import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, type MutationCtx } from "./_generated/server";
import { rateLimit, requireRole, SELLER_ROLES } from "./helpers";
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
    const user = await requireRole(ctx, SELLER_ROLES);
    // A 1 GB video needs ~55 URLs (parts + poster); this still stops storage abuse.
    await rateLimit(ctx, `upload-url:${user._id}`, 400, 3600_000);
    return await ctx.storage.generateUploadUrl();
  },
});

type Kind = "image" | "document" | "video";

const RULES = {
  image: { types: CONFIG.imageMimeTypes as readonly string[], max: CONFIG.maxImageBytes },
  document: { types: CONFIG.docMimeTypes as readonly string[], max: CONFIG.maxDocBytes },
  video: { types: CONFIG.videoMimeTypes as readonly string[], max: CONFIG.maxVideoBytes },
} satisfies Record<Kind, { types: readonly string[]; max: number }>;

const THUMB_TYPES = ["image/jpeg", "image/webp", "image/png"];
const MAX_THUMB_BYTES = 1024 * 1024;
const MAX_PARTS = Math.ceil(CONFIG.maxVideoBytes / CONFIG.telegramChunkBytes) + 1;

function invalid(message: string): never {
  throw new ConvexError({ code: "INVALID_FILE", message });
}

/** Pure validation shared by single and multi-part uploads; returns the user-facing error or null. */
export function uploadError(kind: Kind, type: string, size: number, durationSec?: number): string | null {
  const rules = RULES[kind];
  if (!rules.types.includes(type)) return `File type ${type || "unknown"} is not allowed.`;
  if (size > rules.max) return kind === "video" ? `Video is too large (max ${fmtMax(rules.max)}).` : `File is too large (max ${fmtMax(rules.max)}).`;
  if (kind === "video" && durationSec !== undefined && durationSec > CONFIG.maxVideoDurationSec)
    return `Videos can be at most ${CONFIG.maxVideoDurationSec / 60} minutes.`;
  return null;
}

function fmtMax(bytes: number) {
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${Math.round(mb / 1024)} GB` : `${Math.round(mb)} MB`;
}

/** Optional poster frame captured in the browser; invalid ones are dropped silently. */
async function createThumbnail(ctx: MutationCtx, ownerId: Id<"users">, storageId: Id<"_storage"> | undefined) {
  if (!storageId) return undefined;
  const meta = await ctx.db.system.get(storageId);
  if (!meta) return undefined;
  if (!THUMB_TYPES.includes(meta.contentType ?? "") || meta.size > MAX_THUMB_BYTES) {
    await ctx.storage.delete(storageId);
    return undefined;
  }
  const id = await ctx.db.insert("media", {
    ownerId,
    kind: "thumbnail",
    status: "pending",
    attached: false,
    storageId,
    mimeType: meta.contentType!,
    size: meta.size,
    attempts: 0,
    createdAt: Date.now(),
  });
  await ctx.scheduler.runAfter(0, internal.telegram.push, { mediaId: id });
  return id;
}

/**
 * Called after the browser upload. Validates type and size from storage
 * metadata (not the client), creates the media row, and queues the push to
 * Telegram. Videos are pushed when registered on a listing (videos.registerUpload).
 */
export const confirmUpload = mutation({
  args: {
    storageId: v.id("_storage"),
    kind: vKind,
    fileName: v.optional(v.string()),
    durationSec: v.optional(v.number()),
    thumbStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, { storageId, kind, fileName, durationSec, thumbStorageId }) => {
    const user = await requireRole(ctx, SELLER_ROLES);
    const meta = await ctx.db.system.get(storageId);
    if (!meta) throw new ConvexError({ code: "NOT_FOUND", message: "Upload not found." });
    const type = meta.contentType ?? "";
    const error = uploadError(kind, type, meta.size, durationSec);
    if (error) {
      await ctx.storage.delete(storageId);
      if (thumbStorageId) await ctx.storage.delete(thumbStorageId).catch(() => {});
      invalid(error);
    }
    const thumbMediaId = kind === "video" ? await createThumbnail(ctx, user._id, thumbStorageId) : undefined;
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
      thumbMediaId,
      attempts: 0,
      createdAt: Date.now(),
    });
    if (kind !== "video") await ctx.scheduler.runAfter(0, internal.telegram.push, { mediaId: id });
    return { mediaId: id, url: kind === "document" ? null : mediaUrl(id) };
  },
});

/**
 * Multi-part upload (files bigger than CONFIG.telegramChunkBytes): the browser
 * uploads each slice to storage, then confirms the ordered list. Every part is
 * checked against storage metadata; the parts are later posted to Telegram one
 * by one (telegram.push) and served stitched together by GET /media/<id>.
 */
export const confirmParts = mutation({
  args: {
    storageIds: v.array(v.id("_storage")),
    size: v.number(),
    mimeType: v.string(),
    kind: vKind,
    fileName: v.optional(v.string()),
    durationSec: v.optional(v.number()),
    thumbStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, a) => {
    const user = await requireRole(ctx, SELLER_ROLES);
    const discard = async () => {
      for (const sid of [...a.storageIds, ...(a.thumbStorageId ? [a.thumbStorageId] : [])]) await ctx.storage.delete(sid).catch(() => {});
    };
    if (a.storageIds.length === 0 || a.storageIds.length > MAX_PARTS || new Set(a.storageIds).size !== a.storageIds.length) {
      await discard();
      invalid(a.storageIds.length > MAX_PARTS ? uploadError(a.kind, a.mimeType, Infinity) ?? "Too many parts." : "Upload is incomplete. Please try again.");
    }
    const parts: { storageId: Id<"_storage">; size: number }[] = [];
    let firstType = "";
    for (const [i, storageId] of a.storageIds.entries()) {
      const meta = await ctx.db.system.get(storageId);
      if (!meta) {
        await discard();
        throw new ConvexError({ code: "NOT_FOUND", message: "Upload not found." });
      }
      if (i === 0) firstType = meta.contentType ?? "";
      if (meta.size <= 0 || meta.size > CONFIG.telegramChunkBytes) {
        await discard();
        invalid("Upload is incomplete. Please try again.");
      }
      parts.push({ storageId, size: meta.size });
    }
    const total = parts.reduce((s, p) => s + p.size, 0);
    if (total !== a.size) {
      await discard();
      invalid("Upload is incomplete. Please try again.");
    }
    const type = firstType || a.mimeType;
    const error = uploadError(a.kind, type, total, a.durationSec);
    if (error) {
      await discard();
      invalid(error);
    }
    const thumbMediaId = a.kind === "video" ? await createThumbnail(ctx, user._id, a.thumbStorageId) : undefined;
    const id = await ctx.db.insert("media", {
      ownerId: user._id,
      kind: a.kind,
      status: "pending",
      attached: false,
      parts,
      mimeType: type,
      size: total,
      fileName: a.fileName?.slice(0, 120),
      durationSec: a.durationSec,
      thumbMediaId,
      attempts: 0,
      createdAt: Date.now(),
    });
    if (a.kind !== "video") await ctx.scheduler.runAfter(0, internal.telegram.push, { mediaId: id });
    return { mediaId: id, url: a.kind === "document" ? null : mediaUrl(id) };
  },
});

/** Direct upload to Telegram CDN (bypasses Convex storage entirely). */
export const registerDirectUpload = mutation({
  args: {
    kind: vKind,
    tgFileId: v.string(),
    tgFileUniqueId: v.optional(v.string()),
    tgMessageId: v.number(),
    mimeType: v.string(),
    size: v.number(),
    fileName: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    durationSec: v.optional(v.number()),
    thumb: v.optional(v.object({ fileId: v.string(), uniqueId: v.optional(v.string()), size: v.optional(v.number()) })),
  },
  handler: async (ctx, a) => {
    const user = await requireRole(ctx, SELLER_ROLES);
    let thumbMediaId: Id<"media"> | undefined;
    if (a.thumb) {
      thumbMediaId = await ctx.db.insert("media", {
        ownerId: user._id,
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
    const id = await ctx.db.insert("media", {
      ownerId: user._id,
      kind: a.kind,
      status: "ready",
      attached: false,
      tgFileId: a.tgFileId,
      tgFileUniqueId: a.tgFileUniqueId,
      tgMessageId: a.tgMessageId,
      mimeType: a.mimeType,
      size: a.size,
      fileName: a.fileName?.slice(0, 120),
      width: a.width,
      height: a.height,
      durationSec: a.durationSec,
      thumbMediaId,
      attempts: 0,
      createdAt: Date.now(),
    });
    return { mediaId: id, url: a.kind === "document" ? null : mediaUrl(id) };
  },
});

/** Direct multi-part upload to Telegram CDN for files > 19 MB. */
export const registerDirectParts = mutation({
  args: {
    kind: vKind,
    parts: v.array(v.object({
      size: v.number(),
      tgFileId: v.string(),
      tgFileUniqueId: v.optional(v.string()),
      tgMessageId: v.number(),
    })),
    size: v.number(),
    mimeType: v.string(),
    fileName: v.optional(v.string()),
    durationSec: v.optional(v.number()),
    thumb: v.optional(v.object({ fileId: v.string(), uniqueId: v.optional(v.string()), size: v.optional(v.number()) })),
  },
  handler: async (ctx, a) => {
    const user = await requireRole(ctx, SELLER_ROLES);
    let thumbMediaId: Id<"media"> | undefined;
    if (a.thumb) {
      thumbMediaId = await ctx.db.insert("media", {
        ownerId: user._id,
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
    const id = await ctx.db.insert("media", {
      ownerId: user._id,
      kind: a.kind,
      status: "ready",
      attached: false,
      parts: a.parts,
      mimeType: a.mimeType,
      size: a.size,
      fileName: a.fileName?.slice(0, 120),
      durationSec: a.durationSec,
      thumbMediaId,
      attempts: 0,
      createdAt: Date.now(),
    });
    return { mediaId: id, url: a.kind === "document" ? null : mediaUrl(id) };
  },
});

/**
 * Removes storage files from an upload that failed before it was confirmed
 * (e.g. the network dropped after 30 of 54 parts). Only recent files that no
 * media row points at are deleted.
 */
export const discardUploads = mutation({
  args: { storageIds: v.array(v.id("_storage")) },
  handler: async (ctx, { storageIds }) => {
    await requireRole(ctx, SELLER_ROLES);
    const cutoff = Date.now() - 6 * 3600_000;
    let n = 0;
    for (const sid of storageIds.slice(0, MAX_PARTS + 1)) {
      const meta = await ctx.db.system.get(sid);
      if (!meta || meta._creationTime < cutoff) continue;
      const used = await ctx.db
        .query("media")
        .withIndex("by_storage", (q) => q.eq("storageId", sid))
        .first();
      if (used) continue;
      await ctx.storage.delete(sid);
      n++;
    }
    return n;
  },
});

/** Ensures the media belongs to `userId` (or is already attached to the listing), then marks it attached. */
export async function claimMedia(ctx: MutationCtx, ids: Id<"media">[], userId: Id<"users">, alreadyOwned: Set<string>) {
  for (const id of ids) {
    if (alreadyOwned.has(id)) continue;
    const m = await ctx.db.get(id);
    if (!m || m.ownerId !== userId || m.attached) throw new ConvexError({ code: "INVALID", message: "One of the files was not uploaded by you." });
    // Videos (and their posters) are attached through videos.registerUpload only.
    if (m.kind !== "image" && m.kind !== "document") throw new ConvexError({ code: "INVALID", message: "Videos must be added in the video section." });
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
    for (const [i, p] of (m.parts ?? []).entries()) {
      if (p.storageId) await ctx.storage.delete(p.storageId).catch(() => {});
      if (p.tgMessageId) await ctx.scheduler.runAfter(i * 500, internal.telegram.deleteMessage, { messageId: p.tgMessageId });
    }
    await ctx.db.delete(id);
    if (m.thumbMediaId && m.thumbMediaId !== id) await deleteMedia(ctx, [m.thumbMediaId]);
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
      tgFilePath: fresh(m.tgFilePath, m.tgFilePathAt),
      parts: m.parts?.map((p) => ({
        size: p.size,
        storageId: p.storageId,
        tgFileId: p.tgFileId,
        tgFilePath: fresh(p.tgFilePath, p.tgFilePathAt),
      })),
    };
  },
});

/** Telegram download paths are valid for at least an hour; reuse them for 50 minutes. */
function fresh(path: string | undefined, at: number | undefined) {
  return path && at && Date.now() - at < 50 * 60_000 ? path : undefined;
}

export const cachePartPath = internalMutation({
  args: { id: v.id("media"), index: v.number(), path: v.string() },
  handler: async (ctx, { id, index, path }) => {
    const m = await ctx.db.get(id);
    if (!m?.parts?.[index]) return;
    const parts = m.parts.map((p, i) => (i === index ? { ...p, tgFilePath: path, tgFilePathAt: Date.now() } : p));
    await ctx.db.patch(id, { parts });
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
    let thumbId: Id<"media"> | undefined = m.thumbMediaId;
    if (a.thumb && !thumbId) {
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
      if (video) await ctx.runMutation(internal.videos.markReady, { id: video._id, thumbMediaId: m.thumbMediaId, resolutions: ["original"] });
    }
    return null;
  },
});

const LEASE_MS = 3 * 60_000;
/** Spacing between posts to one chat (Telegram allows ~20 messages/minute). */
export const TELEGRAM_POST_GAP_MS = 3200;

/**
 * Multi-part push, step 1: picks the next part that is not on Telegram yet and
 * takes a short lease so only one push chain works on a file at a time.
 * Returns null when another run holds the lease or there is nothing to do.
 */
export const claimNextPart = internalMutation({
  args: { id: v.id("media") },
  handler: async (ctx, { id }) => {
    const m = await ctx.db.get(id);
    if (!m?.parts) return null;
    const index = m.parts.findIndex((p) => !p.tgFileId);
    if (index === -1) {
      await finishParts(ctx, id);
      return null;
    }
    if (m.pushLeaseAt && Date.now() - m.pushLeaseAt < LEASE_MS) return null;
    const part = m.parts[index];
    if (!part.storageId) return { index, count: m.parts.length, storageId: null };
    await ctx.db.patch(id, { pushLeaseAt: Date.now() });
    return { index, count: m.parts.length, storageId: part.storageId };
  },
});

/** Multi-part push, step 2: records one part, drops its storage copy and queues the next. */
export const markPartPushed = internalMutation({
  args: { id: v.id("media"), index: v.number(), tgFileId: v.string(), tgFileUniqueId: v.optional(v.string()), tgMessageId: v.number() },
  handler: async (ctx, a) => {
    const m = await ctx.db.get(a.id);
    const part = m?.parts?.[a.index];
    if (!m?.parts || !part || part.tgFileId) {
      // media deleted meanwhile, or a duplicate run: remove the extra message
      await ctx.scheduler.runAfter(0, internal.telegram.deleteMessage, { messageId: a.tgMessageId });
      return null;
    }
    if (part.storageId) await ctx.storage.delete(part.storageId).catch(() => {});
    const parts = m.parts.map((p, i) =>
      i === a.index ? { size: p.size, tgFileId: a.tgFileId, tgFileUniqueId: a.tgFileUniqueId, tgMessageId: a.tgMessageId } : p,
    );
    await ctx.db.patch(a.id, { parts, pushLeaseAt: undefined, attempts: 0, error: undefined });
    if (parts.some((p) => !p.tgFileId)) await ctx.scheduler.runAfter(TELEGRAM_POST_GAP_MS, internal.telegram.push, { mediaId: a.id });
    else await finishParts(ctx, a.id);
    return null;
  },
});

/** Every part is on Telegram: the file is ready (and its video, if any). */
async function finishParts(ctx: MutationCtx, id: Id<"media">) {
  const m = await ctx.db.get(id);
  if (!m || m.status === "ready") return;
  await ctx.db.patch(id, { status: "ready", pushLeaseAt: undefined, error: undefined });
  if (m.kind !== "video") return;
  const video = await ctx.db
    .query("videos")
    .withIndex("by_media", (q) => q.eq("mediaId", id))
    .unique();
  if (video)
    await ctx.runMutation(internal.videos.markReady, {
      id: video._id,
      thumbMediaId: m.thumbMediaId,
      durationSec: m.durationSec,
      resolutions: ["original"],
    });
}

export const markPushFailed = internalMutation({
  args: { id: v.id("media"), error: v.string(), retryInSec: v.optional(v.number()) },
  handler: async (ctx, { id, error, retryInSec }) => {
    const m = await ctx.db.get(id);
    if (!m) return null;
    const attempts = m.attempts + 1;
    if (retryInSec !== undefined && attempts < 8) {
      await ctx.db.patch(id, { attempts, error, pushLeaseAt: undefined });
      await ctx.scheduler.runAfter(retryInSec * 1000, internal.telegram.push, { mediaId: id });
      return null;
    }
    console.error(`[media] push to Telegram failed media=${id} kind=${m.kind}: ${error}`);
    // Images/documents stay usable from Convex storage; videos are marked failed.
    await ctx.db.patch(id, { attempts, error, pushLeaseAt: undefined, status: m.kind === "video" ? "failed" : "ready" });
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
    return rows.filter(isOnlyLocal).map((m) => m._id);
  },
});

/** Like notOnTelegram, with the number of Telegram posts each file still needs (for spacing). */
export const pushQueue = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("media").take(5000);
    return rows.filter(isOnlyLocal).map((m) => ({ id: m._id, posts: m.parts ? m.parts.filter((p) => !p.tgFileId).length : 1 }));
  },
});

function isOnlyLocal(m: Doc<"media">) {
  return m.parts ? m.parts.some((p) => p.storageId && !p.tgFileId) : !!m.storageId && !m.tgFileId;
}

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


/**
 * Cron: (1) deletes Convex storage files that no media row points at — slices
 * of uploads that were never confirmed (tab closed, network lost) would
 * otherwise stay in storage forever; (2) restarts multi-part pushes whose
 * chain died (action crash/timeout) once their lease has expired.
 */
export const cleanupOrphanStorage = internalMutation({
  args: {},
  handler: async (ctx) => {
    let restarted = 0;
    const pending = await ctx.db
      .query("media")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(500);
    for (const m of pending) {
      if (!m.parts || !m.attached || m.attempts >= 8) continue;
      if (Date.now() - m.createdAt < 10 * 60_000) continue;
      if (m.pushLeaseAt && Date.now() - m.pushLeaseAt < LEASE_MS) continue;
      if (!m.parts.some((p) => !p.tgFileId)) continue;
      await ctx.scheduler.runAfter(restarted * 5000, internal.telegram.push, { mediaId: m._id });
      restarted++;
    }
    // Without a Telegram channel storage is the permanent store: never sweep it.
    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) return { deleted: 0, restarted };
    const failed = await ctx.db
      .query("media")
      .withIndex("by_status", (q) => q.eq("status", "failed"))
      .take(500);
    const partRefs = new Set<string>();
    for (const m of [...pending, ...failed]) for (const p of m.parts ?? []) if (p.storageId) partRefs.add(p.storageId);
    const cutoff = Date.now() - 24 * 3600_000;
    const files = await ctx.db.system
      .query("_storage")
      .withIndex("by_creation_time", (q) => q.lt("_creationTime", cutoff))
      .order("desc")
      .take(300);
    let deleted = 0;
    for (const f of files) {
      if (partRefs.has(f._id)) continue;
      const used = await ctx.db
        .query("media")
        .withIndex("by_storage", (q) => q.eq("storageId", f._id))
        .first();
      if (used) continue;
      await ctx.storage.delete(f._id);
      deleted++;
    }
    return { deleted, restarted };
  },
});
