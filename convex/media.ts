import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, type MutationCtx } from "./_generated/server";
import { requireRole, SELLER_ROLES } from "./helpers";
import { CONFIG } from "../lib/constants";
import { hmacHex } from "../lib/signature";

const vKind = v.union(v.literal("image"), v.literal("document"), v.literal("video"));

// ---------- URLs ----------

/**
 * Public URL for an image/video. Images go through the Next.js /media route
 * (same origin, CDN cached, works with next/image). Videos stream straight
 * from the Convex HTTP action. The Telegram URL (which contains the bot
 * token) is never sent to a browser.
 */
export function mediaUrl(id: Id<"media"> | undefined, kind: "image" | "video" = "image") {
  if (!id) return null;
  return kind === "video" ? `${process.env.CONVEX_SITE_URL}/media/${id}` : `/media/${id}`;
}

/** Short-lived signed URL for private documents (deeds etc.). */
export async function signedDocumentUrl(id: Id<"media">, ttlSec = 600) {
  const secret = process.env.MEDIA_SIGNING_SECRET;
  if (!secret) return null;
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const sig = await hmacHex(secret, `${id}:${exp}`);
  return `${process.env.CONVEX_SITE_URL}/media/${id}?exp=${exp}&sig=${sig}`;
}

// ---------- upload ----------

/** Signed, short-lived upload URL: the browser sends bytes straight to storage. */
export const generateUploadUrl = mutation({
  args: { kind: vKind },
  handler: async (ctx) => {
    await requireRole(ctx, SELLER_ROLES);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Called after the browser upload. Validates type and size from storage
 * metadata (not the client), creates the media row, and queues the push to
 * Telegram. Videos are pushed when registered on a listing (videos.registerUpload).
 */
export const confirmUpload = mutation({
  args: { storageId: v.id("_storage"), kind: vKind, fileName: v.optional(v.string()), durationSec: v.optional(v.number()) },
  handler: async (ctx, { storageId, kind, fileName, durationSec }) => {
    const user = await requireRole(ctx, SELLER_ROLES);
    const meta = await ctx.db.system.get(storageId);
    if (!meta) throw new ConvexError({ code: "NOT_FOUND", message: "Upload not found." });
    const type = meta.contentType ?? "";
    const rules = {
      image: { types: CONFIG.imageMimeTypes as readonly string[], max: CONFIG.maxImageBytes },
      document: { types: CONFIG.docMimeTypes as readonly string[], max: CONFIG.maxDocBytes },
      video: { types: CONFIG.videoMimeTypes as readonly string[], max: CONFIG.maxVideoBytes },
    }[kind];
    const typeOk = rules.types.includes(type);
    if (!typeOk || meta.size > rules.max) {
      await ctx.storage.delete(storageId);
      throw new ConvexError({
        code: "INVALID_FILE",
        message: !typeOk ? `File type ${type || "unknown"} is not allowed.` : `File is too large (max ${Math.round(rules.max / 1024 / 1024)} MB).`,
      });
    }
    if (kind === "video" && durationSec !== undefined && durationSec > CONFIG.maxVideoDurationSec) {
      await ctx.storage.delete(storageId);
      throw new ConvexError({ code: "INVALID_FILE", message: `Videos can be at most ${CONFIG.maxVideoDurationSec / 60} minutes.` });
    }
    const id = await ctx.db.insert("media", {
      ownerId: user._id,
      kind,
      status: "pending",
      attached: false,
      storageId,
      mimeType: type,
      size: meta.size,
      fileName: fileName?.slice(0, 120),
      durationSec,
      attempts: 0,
      createdAt: Date.now(),
    });
    if (kind !== "video") await ctx.scheduler.runAfter(0, internal.telegram.push, { mediaId: id });
    return { mediaId: id, url: kind === "document" ? null : mediaUrl(id) };
  },
});

/** Ensures the media belongs to `userId` (or is already attached to the listing), then marks it attached. */
export async function claimMedia(ctx: MutationCtx, ids: Id<"media">[], userId: Id<"users">, alreadyOwned: Set<string>) {
  for (const id of ids) {
    if (alreadyOwned.has(id)) continue;
    const m = await ctx.db.get(id);
    if (!m || m.ownerId !== userId || m.attached) throw new ConvexError({ code: "INVALID", message: "One of the files was not uploaded by you." });
    await ctx.db.patch(id, { attached: true });
  }
}

/** Deletes media rows plus their bytes (Convex storage and Telegram message). */
export async function deleteMedia(ctx: MutationCtx, ids: Id<"media">[]) {
  for (const id of ids) {
    const m = await ctx.db.get(id);
    if (!m) continue;
    if (m.storageId) await ctx.storage.delete(m.storageId).catch(() => {});
    if (m.tgMessageId) await ctx.scheduler.runAfter(0, internal.telegram.deleteMessage, { messageId: m.tgMessageId });
    await ctx.db.delete(id);
  }
}

// ---------- internal (used by telegram.ts and http.ts) ----------

export const getInternal = internalQuery({
  args: { id: v.id("media") },
  handler: async (ctx, { id }) => ctx.db.get(id),
});

/** Resolves a raw id string from the URL; null when it is not a media id. */
export const lookup = internalQuery({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const norm = ctx.db.normalizeId("media", id);
    if (!norm) return null;
    const m = await ctx.db.get(norm);
    if (!m) return null;
    return {
      _id: m._id,
      kind: m.kind,
      status: m.status,
      mimeType: m.mimeType,
      size: m.size,
      fileName: m.fileName,
      storageUrl: m.storageId ? await ctx.storage.getUrl(m.storageId) : null,
      tgFileId: m.tgFileId,
      tgFilePath: m.tgFilePath && m.tgFilePathAt && Date.now() - m.tgFilePathAt < 50 * 60_000 ? m.tgFilePath : undefined,
    };
  },
});

export const cacheFilePath = internalMutation({
  args: { id: v.id("media"), path: v.string() },
  handler: async (ctx, { id, path }) => {
    await ctx.db.patch(id, { tgFilePath: path, tgFilePathAt: Date.now() });
  },
});

export const markPushed = internalMutation({
  args: {
    id: v.id("media"),
    tgFileId: v.string(),
    tgFileUniqueId: v.optional(v.string()),
    tgMessageId: v.number(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    durationSec: v.optional(v.number()),
    thumb: v.optional(v.object({ fileId: v.string(), uniqueId: v.optional(v.string()), size: v.optional(v.number()) })),
  },
  handler: async (ctx, a) => {
    const m = await ctx.db.get(a.id);
    if (!m) return null; // deleted meanwhile
    if (m.storageId) await ctx.storage.delete(m.storageId).catch(() => {});
    await ctx.db.patch(a.id, {
      status: "ready",
      storageId: undefined,
      tgFileId: a.tgFileId,
      tgFileUniqueId: a.tgFileUniqueId,
      tgMessageId: a.tgMessageId,
      width: a.width,
      height: a.height,
      durationSec: a.durationSec ?? m.durationSec,
      error: undefined,
    });
    let thumbId: Id<"media"> | undefined;
    if (a.thumb) {
      thumbId = await ctx.db.insert("media", {
        ownerId: m.ownerId,
        kind: "thumbnail",
        status: "ready",
        attached: true,
        tgFileId: a.thumb.fileId,
        tgFileUniqueId: a.thumb.uniqueId,
        mimeType: "image/jpeg",
        size: a.thumb.size ?? 0,
        attempts: 0,
        createdAt: Date.now(),
      });
    }
    if (m.kind === "video") {
      const video = await ctx.db
        .query("videos")
        .withIndex("by_media", (q) => q.eq("mediaId", a.id))
        .unique();
      if (video)
        await ctx.runMutation(internal.videos.markReady, {
          id: video._id,
          thumbMediaId: thumbId,
          durationSec: a.durationSec ?? m.durationSec,
          resolutions: a.height ? [`${a.height}p`] : ["original"],
        });
    }
    return null;
  },
});

/** No Telegram channel configured: keep the bytes in Convex storage and serve from there. */
export const markLocalReady = internalMutation({
  args: { id: v.id("media") },
  handler: async (ctx, { id }) => {
    const m = await ctx.db.get(id);
    if (!m) return null;
    await ctx.db.patch(id, { status: "ready" });
    if (m.kind === "video") {
      const video = await ctx.db
        .query("videos")
        .withIndex("by_media", (q) => q.eq("mediaId", id))
        .unique();
      if (video) await ctx.runMutation(internal.videos.markReady, { id: video._id, resolutions: ["original"] });
    }
    return null;
  },
});

export const markPushFailed = internalMutation({
  args: { id: v.id("media"), error: v.string(), retryInSec: v.optional(v.number()) },
  handler: async (ctx, { id, error, retryInSec }) => {
    const m = await ctx.db.get(id);
    if (!m) return null;
    const attempts = m.attempts + 1;
    if (retryInSec !== undefined && attempts < 8) {
      await ctx.db.patch(id, { attempts, error });
      await ctx.scheduler.runAfter(retryInSec * 1000, internal.telegram.push, { mediaId: id });
      return null;
    }
    console.error(`[media] push to Telegram failed media=${id} kind=${m.kind}: ${error}`);
    // Images/documents stay usable from Convex storage; videos are marked failed.
    await ctx.db.patch(id, { attempts, error, status: m.kind === "video" ? "failed" : "ready" });
    if (m.kind === "video") {
      const video = await ctx.db
        .query("videos")
        .withIndex("by_media", (q) => q.eq("mediaId", id))
        .unique();
      if (video) await ctx.runMutation(internal.videos.markFailed, { id: video._id, error });
    }
    return null;
  },
});

/** Media still held in Convex storage (e.g. uploaded before the channel was configured). */
export const notOnTelegram = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("media").take(5000);
    return rows.filter((m) => m.storageId && !m.tgFileId).map((m) => m._id);
  },
});

/** Cron: delete uploads never attached to a listing. */
export const cleanupAbandoned = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - CONFIG.abandonedUploadHours * 3600_000;
    const stale = await ctx.db
      .query("media")
      .withIndex("by_attached", (q) => q.eq("attached", false).lt("createdAt", cutoff))
      .take(200);
    await deleteMedia(
      ctx,
      stale.map((m) => m._id),
    );
    return stale.length;
  },
});

