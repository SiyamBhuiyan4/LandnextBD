import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { syncListingHasVideo } from "./videos";

// Original sample videos for seeded listings (scripts/seed-videos.mjs).
// They go through the same media pipeline as seller uploads: bytes land in
// Convex storage, then telegram.push moves them to the Telegram channel (or
// marks them ready from storage while no channel is configured).

const SAMPLE_PREFIX = "sample-";
const isPlaceholder = (vid: Doc<"videos">) => vid.provider === "seed" || !!vid.hlsUrl?.includes("test-streams.mux.dev");

async function listingVideos(ctx: QueryCtx, listingId: Id<"listings">) {
  return ctx.db
    .query("videos")
    .withIndex("by_listing", (q) => q.eq("listingId", listingId))
    .collect();
}

async function isSample(ctx: QueryCtx, vid: Doc<"videos">) {
  if (!vid.mediaId) return false;
  const m = await ctx.db.get(vid.mediaId);
  return !!m?.fileName?.startsWith(SAMPLE_PREFIX);
}

/**
 * Listings that should get sample videos: those carrying Mux placeholders
 * (one clip per placeholder), or — on a fresh seed with no placeholders and no
 * samples yet — every third active listing. Listings that already have a
 * sample video are skipped, so the script is idempotent.
 */
export const targets = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("videos").take(2000);
    const placeholders = new Map<Id<"listings">, Doc<"videos">[]>();
    for (const vid of all)
      if (isPlaceholder(vid)) placeholders.set(vid.listingId, [...(placeholders.get(vid.listingId) ?? []), vid]);

    let wanted: { listingId: Id<"listings">; titles: string[] }[] = [];
    if (placeholders.size) {
      wanted = [...placeholders.entries()].map(([listingId, vids]) => ({
        listingId,
        titles: vids
          .sort((a, b) => (a.title === "Site walkthrough" ? -1 : b.title === "Site walkthrough" ? 1 : 0))
          .map((x) => x.title ?? "Site walkthrough"),
      }));
    } else {
      let anySample = false;
      for (const vid of all) if (await isSample(ctx, vid)) anySample = true;
      if (!anySample) {
        const listings = await ctx.db.query("listings").take(1000);
        wanted = listings
          .filter((l, i) => l.status === "active" && i % 3 === 0)
          .map((l, i) => ({ listingId: l._id, titles: i % 2 === 0 ? ["Site walkthrough", "Access road and surroundings"] : ["Site walkthrough"] }));
      }
    }

    const out = [];
    for (const w of wanted) {
      const l = await ctx.db.get(w.listingId);
      if (!l) continue;
      let has = false;
      for (const vid of await listingVideos(ctx, l._id)) if (await isSample(ctx, vid)) has = true;
      if (has) continue;
      out.push({
        id: l._id,
        slug: l.slug,
        landType: l.landType,
        title: l.title,
        areaName: l.areaName,
        sectorBlock: l.sectorBlock ?? null,
        district: l.district,
        sizeValue: l.sizeValue,
        sizeUnit: l.sizeUnit,
        facing: l.facing ?? null,
        roadWidthFt: l.roadWidthFt ?? null,
        titles: w.titles,
      });
    }
    return out;
  },
});

export const uploadUrls = internalMutation({
  args: { n: v.number() },
  handler: async (ctx, { n }) => {
    const urls: string[] = [];
    for (let i = 0; i < Math.min(n, 100); i++) urls.push(await ctx.storage.generateUploadUrl());
    return urls;
  },
});

async function insertMedia(
  ctx: MutationCtx,
  ownerId: Id<"users">,
  kind: "video" | "thumbnail",
  storageId: Id<"_storage">,
  extra: { durationSec?: number; fileName: string; width: number; height: number },
) {
  const meta = await ctx.db.system.get(storageId);
  if (!meta) throw new Error(`storage object ${storageId} not found`);
  return ctx.db.insert("media", {
    ownerId,
    kind,
    status: "pending",
    attached: true,
    storageId,
    mimeType: meta.contentType ?? (kind === "video" ? "video/mp4" : "image/jpeg"),
    size: meta.size,
    ...extra,
    attempts: 0,
    createdAt: Date.now(),
  });
}

/** Creates the media + video rows for one rendered clip, exactly like a seller upload, and queues the Telegram push. */
export const attach = internalMutation({
  args: {
    listingId: v.id("listings"),
    videoStorageId: v.id("_storage"),
    thumbStorageId: v.optional(v.id("_storage")),
    durationSec: v.number(),
    title: v.string(),
    fileName: v.string(),
  },
  handler: async (ctx, a) => {
    const listing = await ctx.db.get(a.listingId);
    if (!listing) throw new Error("listing not found");
    const fileName = a.fileName.startsWith(SAMPLE_PREFIX) ? a.fileName : SAMPLE_PREFIX + a.fileName;
    const mediaId = await insertMedia(ctx, listing.sellerId, "video", a.videoStorageId, {
      durationSec: a.durationSec,
      fileName,
      width: 1280,
      height: 720,
    });
    const thumbMediaId = a.thumbStorageId
      ? await insertMedia(ctx, listing.sellerId, "thumbnail", a.thumbStorageId, {
          fileName: fileName.replace(/\.\w+$/, "") + "-poster.jpg",
          width: 1280,
          height: 720,
        })
      : undefined;
    const media = (await ctx.db.get(mediaId))!;
    const id = await ctx.db.insert("videos", {
      listingId: listing._id,
      uploaderId: listing.sellerId,
      mediaId,
      thumbMediaId,
      title: a.title,
      status: "processing",
      moderation: "approved",
      provider: "telegram",
      durationSec: a.durationSec,
      sizeBytes: media.size,
      mimeType: media.mimeType,
      areaId: listing.areaId,
      landType: listing.landType,
      price: listing.price,
      listingActive: listing.status === "active",
      viewCount: 0,
      createdAt: Date.now(),
    });
    // Poster first so the video's push (and its markReady) lands after it; spaced for Telegram's rate limit.
    if (thumbMediaId) await ctx.scheduler.runAfter(0, internal.telegram.push, { mediaId: thumbMediaId });
    await ctx.scheduler.runAfter(thumbMediaId ? 3500 : 0, internal.telegram.push, { mediaId });
    return id;
  },
});

/** Deletes the Mux placeholder video rows and re-syncs listing.hasVideo. Their thumbnails are listing photos, so media is kept. */
export const removePlaceholders = internalMutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("videos").take(2000);
    const touched = new Set<Id<"listings">>();
    let removed = 0;
    for (const vid of all) {
      if (!isPlaceholder(vid)) continue;
      const watched = await ctx.db
        .query("watchHistory")
        .filter((q) => q.eq(q.field("videoId"), vid._id))
        .collect();
      for (const w of watched) await ctx.db.delete(w._id);
      await ctx.db.delete(vid._id);
      touched.add(vid.listingId);
      removed++;
    }
    for (const id of touched) await syncListingHasVideo(ctx, id);
    return { removed, listings: touched.size };
  },
});

/** Summary for verification. */
export const status = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("videos").take(2000);
    const rows = [];
    for (const vid of all) {
      if (!(await isSample(ctx, vid))) continue;
      const m = vid.mediaId ? await ctx.db.get(vid.mediaId) : null;
      rows.push({ id: vid._id, listingId: vid.listingId, status: vid.status, mediaId: vid.mediaId, mediaStatus: m?.status, onTelegram: !!m?.tgFileId, size: m?.size });
    }
    return {
      samples: rows.length,
      placeholders: all.filter(isPlaceholder).length,
      listings: new Set(rows.map((r) => r.listingId)).size,
      ready: rows.filter((r) => r.status === "ready").length,
      onTelegram: rows.filter((r) => r.onTelegram).length,
      rows,
    };
  },
});

/**
 * telegram.push swaps a video's thumbnail for Telegram's auto-generated one
 * (tiny, ~90 px). Point sample videos back at their rendered 1280x720 poster.
 */
export const restorePosters = internalMutation({
  args: {},
  handler: async (ctx) => {
    const media = await ctx.db.query("media").take(5000);
    const posters = new Map(media.filter((m) => m.fileName?.startsWith(SAMPLE_PREFIX) && m.fileName.endsWith("-poster.jpg")).map((m) => [m.fileName!, m._id]));
    let fixed = 0;
    for (const vid of await ctx.db.query("videos").take(2000)) {
      if (!vid.mediaId || vid.status !== "ready") continue;
      const m = await ctx.db.get(vid.mediaId);
      if (!m?.fileName?.startsWith(SAMPLE_PREFIX)) continue;
      const poster = posters.get(m.fileName.replace(/\.\w+$/, "") + "-poster.jpg");
      if (!poster || vid.thumbMediaId === poster) continue;
      const old = vid.thumbMediaId ? await ctx.db.get(vid.thumbMediaId) : null;
      await ctx.db.patch(vid._id, { thumbMediaId: poster });
      if (old?.kind === "thumbnail" && !old.storageId) await ctx.db.delete(old._id); // Telegram's auto thumb (no bytes of ours)
      fixed++;
    }
    return { fixed };
  },
});
