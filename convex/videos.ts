import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { bumpDailyStat, getViewer, isAdmin, requireListingOwner } from "./helpers";
import { deleteMedia, mediaUrl } from "./media";
import { vLandType } from "./validators";
import { CONFIG } from "../lib/constants";

// ---------- shapes ----------

async function publicVideo(ctx: QueryCtx, vid: Doc<"videos">) {
  const listing = await ctx.db.get(vid.listingId);
  return {
    _id: vid._id,
    listingId: vid.listingId,
    title: vid.title ?? listing?.title ?? "Land video",
    status: vid.status,
    moderation: vid.moderation,
    hlsUrl: vid.hlsUrl,
    mp4Url: mediaUrl(vid.mediaId, "video"),
    thumbnailUrl: mediaUrl(vid.thumbMediaId),
    durationSec: vid.durationSec,
    resolutions: vid.resolutions ?? [],
    landType: vid.landType,
    price: vid.price,
    createdAt: vid.createdAt,
    viewCount: vid.viewCount,
    listing: listing
      ? {
          slug: listing.slug,
          areaSlug: listing.areaSlug,
          areaName: listing.areaName,
          landType: listing.landType,
          title: listing.title,
          price: listing.price,
          sizeValue: listing.sizeValue,
          sizeUnit: listing.sizeUnit,
        }
      : null,
  };
}
export type PublicVideo = Awaited<ReturnType<typeof publicVideo>>;

const isPublic = (vid: Doc<"videos">) => vid.status === "ready" && vid.moderation === "approved" && vid.listingActive;

/** Keeps listing.hasVideo in sync with its playable videos. */
export async function syncListingHasVideo(ctx: MutationCtx, listingId: Id<"listings">) {
  const vids = await ctx.db
    .query("videos")
    .withIndex("by_listing", (q) => q.eq("listingId", listingId))
    .collect();
  const has = vids.some((x) => x.status === "ready" && x.moderation === "approved");
  const l = await ctx.db.get(listingId);
  if (l && l.hasVideo !== has) await ctx.db.patch(listingId, { hasVideo: has });
}

// ---------- upload ----------

export const registerUpload = mutation({
  args: { listingId: v.id("listings"), mediaId: v.id("media"), title: v.optional(v.string()) },
  handler: async (ctx, { listingId, mediaId, title }) => {
    const { user, listing } = await requireListingOwner(ctx, listingId);
    const media = await ctx.db.get(mediaId);
    if (!media || media.ownerId !== user._id || media.kind !== "video" || media.attached)
      throw new ConvexError({ code: "INVALID", message: "Upload the video file first." });
    const count = (
      await ctx.db
        .query("videos")
        .withIndex("by_listing", (q) => q.eq("listingId", listingId))
        .collect()
    ).filter((x) => x.status !== "failed").length;
    if (count >= CONFIG.maxVideosPerListing) {
      await deleteMedia(ctx, [mediaId]);
      throw new ConvexError({ code: "INVALID", message: `At most ${CONFIG.maxVideosPerListing} videos per listing.` });
    }
    await ctx.db.patch(mediaId, { attached: true });
    const thumb = media.thumbMediaId ? await ctx.db.get(media.thumbMediaId) : null;
    if (thumb) await ctx.db.patch(thumb._id, { attached: true });
    const id = await ctx.db.insert("videos", {
      listingId,
      uploaderId: user._id,
      mediaId,
      title: title?.trim().slice(0, 120) || undefined,
      status: "processing",
      moderation: process.env.VIDEO_REQUIRE_MODERATION === "true" && !isAdmin(user) ? "pending" : "approved",
      provider: "telegram",
      durationSec: media.durationSec,
      sizeBytes: media.size,
      mimeType: media.mimeType,
      areaId: listing.areaId,
      landType: listing.landType,
      price: listing.price,
      listingActive: listing.status === "active",
      viewCount: 0,
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.telegram.push, { mediaId });
    return id;
  },
});

export const remove = mutation({
  args: { id: v.id("videos") },
  handler: async (ctx, { id }) => {
    const vid = await ctx.db.get(id);
    if (!vid) return null;
    await requireListingOwner(ctx, vid.listingId);
    await deleteMedia(ctx, [vid.mediaId, vid.thumbMediaId].filter((x): x is Id<"media"> => !!x));
    await ctx.db.delete(id);
    await syncListingHasVideo(ctx, vid.listingId);
    return null;
  },
});

// ---------- read ----------

/** Public: playable videos. Owner/admin: every video with its processing status. */
export const byListing = query({
  args: { listingId: v.id("listings") },
  handler: async (ctx, { listingId }) => {
    const listing = await ctx.db.get(listingId);
    if (!listing) return [];
    const viewer = await getViewer(ctx);
    const privileged = !!viewer && (viewer._id === listing.sellerId || isAdmin(viewer));
    const vids = await ctx.db
      .query("videos")
      .withIndex("by_listing", (q) => q.eq("listingId", listingId))
      .collect();
    const visible = privileged
      ? vids
      : vids.filter((x) => x.status === "ready" && x.moderation === "approved" && (listing.status === "active" || listing.status === "sold"));
    return Promise.all(
      visible.map(async (x) => ({
        ...(await publicVideo(ctx, x)),
        errorMessage: privileged ? x.errorMessage : undefined,
      })),
    );
  },
});

export const get = query({
  args: { id: v.id("videos") },
  handler: async (ctx, { id }) => {
    const vid = await ctx.db.get(id);
    if (!vid) return null;
    if (!isPublic(vid)) {
      const viewer = await getViewer(ctx);
      if (!viewer || (viewer._id !== vid.uploaderId && !isAdmin(viewer))) return null;
    }
    return publicVideo(ctx, vid);
  },
});

/** Same area + type first, then same type, then same area, then similar price band. */
export const related = query({
  args: { listingId: v.id("listings"), limit: v.optional(v.number()) },
  handler: async (ctx, { listingId, limit }) => {
    const listing = await ctx.db.get(listingId);
    if (!listing) return [];
    const max = Math.min(limit ?? 12, 24);
    const out: Doc<"videos">[] = [];
    const seen = new Set<string>();
    const add = (rows: Doc<"videos">[]) => {
      for (const r of rows) {
        if (out.length >= max) return;
        if (seen.has(r._id) || r.listingId === listingId || !isPublic(r)) continue;
        seen.add(r._id);
        out.push(r);
      }
    };
    add(
      await ctx.db
        .query("videos")
        .withIndex("by_area_type_status", (q) => q.eq("areaId", listing.areaId).eq("landType", listing.landType).eq("status", "ready"))
        .order("desc")
        .take(max * 2),
    );
    if (out.length < max)
      add(
        await ctx.db
          .query("videos")
          .withIndex("by_type_status", (q) => q.eq("landType", listing.landType).eq("status", "ready"))
          .order("desc")
          .take(max * 2),
      );
    if (out.length < max)
      add(
        await ctx.db
          .query("videos")
          .withIndex("by_area_status", (q) => q.eq("areaId", listing.areaId).eq("status", "ready"))
          .order("desc")
          .take(max * 2),
      );
    if (out.length < max) {
      const rows = await ctx.db
        .query("videos")
        .withIndex("by_status", (q) => q.eq("status", "ready"))
        .order("desc")
        .take(200);
      add(rows.filter((r) => r.price >= listing.price * 0.5 && r.price <= listing.price * 2));
    }
    return Promise.all(out.map((x) => publicVideo(ctx, x)));
  },
});

/** Global videos feed, filterable by area and land type. */
export const feed = query({
  args: { areaId: v.optional(v.id("areas")), landType: v.optional(vLandType), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { areaId, landType, paginationOpts }) => {
    const db = ctx.db.query("videos");
    const q = areaId && landType
      ? db.withIndex("by_area_type_status", (q) => q.eq("areaId", areaId).eq("landType", landType).eq("status", "ready"))
      : areaId
        ? db.withIndex("by_area_status", (q) => q.eq("areaId", areaId).eq("status", "ready"))
        : landType
          ? db.withIndex("by_type_status", (q) => q.eq("landType", landType).eq("status", "ready"))
          : db.withIndex("by_status", (q) => q.eq("status", "ready"));
    const res = await q
      .order("desc")
      .filter((f) => f.and(f.eq(f.field("moderation"), "approved"), f.eq(f.field("listingActive"), true)))
      .paginate(paginationOpts);
    return { ...res, page: await Promise.all(res.page.map((x) => publicVideo(ctx, x))) };
  },
});

export const latest = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const rows = await ctx.db
      .query("videos")
      .withIndex("by_status", (q) => q.eq("status", "ready"))
      .order("desc")
      .filter((f) => f.and(f.eq(f.field("moderation"), "approved"), f.eq(f.field("listingActive"), true)))
      .take(Math.min(limit ?? 10, 24));
    return Promise.all(rows.map((x) => publicVideo(ctx, x)));
  },
});

// ---------- watch history (phase 2) ----------

export const recordProgress = mutation({
  args: { videoId: v.id("videos"), progressSec: v.number(), watchedDeltaSec: v.number() },
  handler: async (ctx, { videoId, progressSec, watchedDeltaSec }) => {
    const vid = await ctx.db.get(videoId);
    if (!vid || !isPublic(vid)) return null;
    const viewer = await getViewer(ctx);
    const delta = Math.max(0, Math.min(60, Math.round(watchedDeltaSec)));
    const listing = await ctx.db.get(vid.listingId);
    if (listing && delta > 0 && listing.sellerId !== viewer?._id) await bumpDailyStat(ctx, listing, "videoWatchSec", delta);
    if (!viewer) return null;
    const existing = await ctx.db
      .query("watchHistory")
      .withIndex("by_user_video", (q) => q.eq("userId", viewer._id).eq("videoId", videoId))
      .unique();
    const progress = Math.max(0, Math.round(progressSec));
    if (existing) await ctx.db.patch(existing._id, { progressSec: progress, durationSec: vid.durationSec, updatedAt: Date.now() });
    else {
      await ctx.db.insert("watchHistory", {
        userId: viewer._id,
        videoId,
        listingId: vid.listingId,
        progressSec: progress,
        durationSec: vid.durationSec,
        updatedAt: Date.now(),
      });
      await ctx.db.patch(videoId, { viewCount: vid.viewCount + 1 });
    }
    return null;
  },
});

export const continueWatching = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return [];
    const rows = await ctx.db
      .query("watchHistory")
      .withIndex("by_user", (q) => q.eq("userId", viewer._id))
      .order("desc")
      .take(30);
    const out = [];
    for (const h of rows) {
      const vid = await ctx.db.get(h.videoId);
      if (!vid || !isPublic(vid)) continue;
      const dur = vid.durationSec ?? h.durationSec ?? 0;
      if (dur && h.progressSec > dur - 5) continue; // finished
      if (h.progressSec < 3) continue;
      out.push({ ...(await publicVideo(ctx, vid)), progressSec: h.progressSec });
      if (out.length >= 10) break;
    }
    return out;
  },
});

export const myProgress = query({
  args: { videoId: v.id("videos") },
  handler: async (ctx, { videoId }) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return null;
    const h = await ctx.db
      .query("watchHistory")
      .withIndex("by_user_video", (q) => q.eq("userId", viewer._id).eq("videoId", videoId))
      .unique();
    return h?.progressSec ?? null;
  },
});

// ---------- internal: provider lifecycle ----------

export const markReady = internalMutation({
  args: {
    id: v.id("videos"),
    thumbMediaId: v.optional(v.id("media")),
    durationSec: v.optional(v.number()),
    resolutions: v.optional(v.array(v.string())),
  },
  handler: async (ctx, a) => {
    const vid = await ctx.db.get(a.id);
    if (!vid) return null;
    await ctx.db.patch(vid._id, {
      status: "ready",
      // Keep a poster we already have (browser-captured frame); Telegram's auto thumbnail is only a fallback.
      thumbMediaId: vid.thumbMediaId ?? a.thumbMediaId,
      durationSec: a.durationSec ?? vid.durationSec,
      resolutions: a.resolutions ?? vid.resolutions,
      errorMessage: undefined,
      readyAt: Date.now(),
    });
    await syncListingHasVideo(ctx, vid.listingId);
    await ctx.db.insert("notifications", {
      userId: vid.uploaderId,
      kind: "video_ready",
      title: "Video ready",
      body: vid.moderation === "pending" ? "Your video is processed and waiting for moderation." : "Your video is processed and live.",
      href: "/dashboard/listings",
      read: false,
      createdAt: Date.now(),
    });
    return vid._id;
  },
});

export const markFailed = internalMutation({
  args: { id: v.id("videos"), error: v.string() },
  handler: async (ctx, a) => {
    const vid = await ctx.db.get(a.id);
    if (!vid) return null;
    console.error(`[video] processing failed video=${vid._id} listing=${vid.listingId}: ${a.error}`);
    await ctx.db.patch(vid._id, { status: "failed", errorMessage: a.error.slice(0, 500) });
    await syncListingHasVideo(ctx, vid.listingId);
    await ctx.db.insert("notifications", {
      userId: vid.uploaderId,
      kind: "video_failed",
      title: "Video processing failed",
      body: "Please try uploading the video again.",
      href: "/dashboard/listings",
      read: false,
      createdAt: Date.now(),
    });
    return vid._id;
  },
});

/** Cron: processing jobs stuck for over 2 hours are marked failed. */
export const failStuck = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 2 * 3600_000;
    const stuck = await ctx.db
      .query("videos")
      .withIndex("by_status", (q) => q.eq("status", "processing").lt("createdAt", cutoff))
      .take(100);
    for (const s of stuck) {
      console.error(`[video] stuck in processing video=${s._id} listing=${s.listingId}`);
      await ctx.db.patch(s._id, { status: "failed", errorMessage: "Processing timed out" });
    }
    return stuck.length;
  },
});

/**
 * Attaches a walkthrough video harvested from Telegram to a listing.
 * Registers media and video rows with status: "ready", moderation: "approved",
 * provider: "telegram", resolutions: ["720p"], and syncs listing.hasVideo = true.
 */
export const linkTelegramVideo = internalMutation({
  args: {
    listingId: v.id("listings"),
    fileId: v.string(),
    fileUniqueId: v.optional(v.string()),
    originalMessageId: v.optional(v.number()),
    durationSec: v.number(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    fileSize: v.number(),
    thumbFileId: v.optional(v.string()),
    fileName: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    title: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const listing = await ctx.db.get(a.listingId);
    if (!listing) throw new ConvexError({ code: "NOT_FOUND", message: `Listing ${a.listingId} not found` });

    // 1. Ensure thumbnail media row exists
    let thumbMediaId: Id<"media"> | undefined;
    if (a.thumbFileId) {
      const existingThumb = await ctx.db
        .query("media")
        .filter((q) => q.eq(q.field("tgFileId"), a.thumbFileId))
        .first();
      if (existingThumb) {
        thumbMediaId = existingThumb._id;
      } else {
        thumbMediaId = await ctx.db.insert("media", {
          ownerId: listing.sellerId,
          kind: "thumbnail",
          status: "ready",
          attached: true,
          tgFileId: a.thumbFileId,
          mimeType: "image/jpeg",
          size: 1024,
          fileName: `${(a.fileName ?? "video").replace(/\.\w+$/, "")}-thumb.jpg`,
          width: a.width ?? 1280,
          height: a.height ?? 720,
          attempts: 0,
          createdAt: Date.now(),
        });
      }
    }

    // 2. Ensure video media row exists
    let mediaId: Id<"media">;
    const existingMedia = await ctx.db
      .query("media")
      .filter((q) => q.eq(q.field("tgFileId"), a.fileId))
      .first();
    if (existingMedia) {
      mediaId = existingMedia._id;
      if (thumbMediaId && !existingMedia.thumbMediaId) {
        await ctx.db.patch(mediaId, { thumbMediaId });
      }
    } else {
      mediaId = await ctx.db.insert("media", {
        ownerId: listing.sellerId,
        kind: "video",
        status: "ready",
        attached: true,
        tgFileId: a.fileId,
        tgFileUniqueId: a.fileUniqueId,
        tgMessageId: a.originalMessageId,
        mimeType: a.mimeType ?? "video/mp4",
        size: a.fileSize,
        fileName: a.fileName,
        width: a.width ?? 1280,
        height: a.height ?? 720,
        durationSec: a.durationSec,
        thumbMediaId,
        attempts: 0,
        createdAt: Date.now(),
      });
    }

    // 3. Ensure videos table row exists
    const existingVideo = await ctx.db
      .query("videos")
      .withIndex("by_listing", (q) => q.eq("listingId", a.listingId))
      .filter((q) => q.eq(q.field("mediaId"), mediaId))
      .first();

    let videoId: Id<"videos">;
    if (existingVideo) {
      videoId = existingVideo._id;
      await ctx.db.patch(videoId, {
        status: "ready",
        moderation: "approved",
        provider: "telegram",
        listingActive: listing.status === "active",
        durationSec: a.durationSec,
        resolutions: ["720p"],
        thumbMediaId: thumbMediaId ?? existingVideo.thumbMediaId,
      });
    } else {
      videoId = await ctx.db.insert("videos", {
        listingId: listing._id,
        uploaderId: listing.sellerId,
        mediaId,
        thumbMediaId,
        title: a.title ?? "Site walkthrough",
        status: "ready",
        moderation: "approved",
        provider: "telegram",
        durationSec: a.durationSec,
        resolutions: ["720p"],
        sizeBytes: a.fileSize,
        mimeType: a.mimeType ?? "video/mp4",
        areaId: listing.areaId,
        landType: listing.landType,
        price: listing.price,
        listingActive: listing.status === "active",
        viewCount: listing.viewCount ?? 0,
        createdAt: Date.now(),
        readyAt: Date.now(),
      });
    }

    // 4. Update listing hasVideo
    await syncListingHasVideo(ctx, listing._id);

    return {
      videoId,
      mediaId,
      thumbMediaId,
      listingId: listing._id,
      title: a.title ?? "Site walkthrough",
      durationSec: a.durationSec,
      resolutions: ["720p"],
    };
  },
});

/** Returns candidate listings for assigning telegram videos. */
export const candidateListingsForTelegram = internalQuery({
  args: {},
  handler: async (ctx) => {
    const featured = await ctx.db
      .query("listings")
      .withIndex("by_status_featured", (q) => q.eq("status", "active").eq("isFeatured", true))
      .collect();

    const all = await ctx.db
      .query("listings")
      .filter((q) => q.eq(q.field("status"), "active"))
      .take(100);

    return {
      featured: featured.map((l) => ({
        id: l._id,
        title: l.title,
        slug: l.slug,
        areaName: l.areaName,
        district: l.district,
        landType: l.landType,
        isFeatured: l.isFeatured,
        hasVideo: l.hasVideo,
      })),
      all: all.map((l) => ({
        id: l._id,
        title: l.title,
        slug: l.slug,
        areaName: l.areaName,
        district: l.district,
        landType: l.landType,
        isFeatured: l.isFeatured,
        hasVideo: l.hasVideo,
      })),
    };
  },
});

/** Lists all videos linked via Telegram. */
export const linkedTelegramVideos = internalQuery({
  args: {},
  handler: async (ctx) => {
    const vids = await ctx.db
      .query("videos")
      .filter((q) => q.eq(q.field("provider"), "telegram"))
      .collect();
    const rows = [];
    for (const v of vids) {
      const listing = await ctx.db.get(v.listingId);
      const media = v.mediaId ? await ctx.db.get(v.mediaId) : null;
      rows.push({
        videoId: v._id,
        listingId: v.listingId,
        listingTitle: listing?.title,
        areaName: listing?.areaName,
        title: v.title,
        status: v.status,
        moderation: v.moderation,
        provider: v.provider,
        durationSec: v.durationSec,
        resolutions: v.resolutions,
        tgFileId: media?.tgFileId,
      });
    }
    return rows;
  },
});
