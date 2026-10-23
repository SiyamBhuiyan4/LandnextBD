import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { syncListingHasVideo } from "./videos";

/**
 * seedTelegramMedia.ts
 *
 * Dedicated module for inserting cataloged Telegram photos and videos directly into
 * the `media` and `videos` tables with ZERO bytes used in Convex storage (`storageId: undefined`).
 *
 * All media rows inserted here have:
 *   - status: "ready"
 *   - attached: true
 *   - storageId: undefined (Convex storage 0 bytes used)
 *   - tgFileId & tgFileUniqueId
 *   - mimeType, size, width, height, durationSec
 *   - thumbMediaId (for videos, pointing to thumbnail media row)
 */

// ---------- Shared Validators ----------

export const vTelegramMediaItem = v.object({
  tgFileId: v.string(),
  tgFileUniqueId: v.string(),
  tgMessageId: v.optional(v.number()),
  mimeType: v.optional(v.string()),
  size: v.number(),
  fileName: v.optional(v.string()),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  durationSec: v.optional(v.number()),
  thumbMediaId: v.optional(v.id("media")),
  ownerId: v.optional(v.id("users")),
  kind: v.optional(
    v.union(v.literal("image"), v.literal("thumbnail"), v.literal("video"), v.literal("document")),
  ),
});

export const vFlexibleMediaItem = v.object({
  tgFileId: v.optional(v.string()),
  fileId: v.optional(v.string()),
  tgFileUniqueId: v.optional(v.string()),
  fileUniqueId: v.optional(v.string()),
  tgMessageId: v.optional(v.number()),
  originalMessageId: v.optional(v.number()),
  mimeType: v.optional(v.string()),
  size: v.optional(v.number()),
  fileSize: v.optional(v.number()),
  fileName: v.optional(v.string()),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  duration: v.optional(v.number()),
  durationSec: v.optional(v.number()),
  thumbFileId: v.optional(v.string()),
  caption: v.optional(v.string()),
  ownerId: v.optional(v.id("users")),
});

// ---------- Internal Core Helpers ----------

/**
 * Inserts a single photo or thumbnail media row with status "ready", attached true,
 * and storageId: undefined (0 bytes in Convex storage).
 */
export async function insertTelegramPhotoRow(
  ctx: MutationCtx,
  args: {
    tgFileId: string;
    tgFileUniqueId: string;
    tgMessageId?: number;
    mimeType?: string;
    size: number;
    fileName?: string;
    width?: number;
    height?: number;
    ownerId?: Id<"users">;
    kind?: "image" | "thumbnail" | "document";
  },
): Promise<Id<"media">> {
  return await ctx.db.insert("media", {
    ownerId: args.ownerId,
    kind: args.kind ?? "image",
    status: "ready",
    attached: true,
    storageId: undefined, // Convex storage 0 bytes used
    tgFileId: args.tgFileId,
    tgFileUniqueId: args.tgFileUniqueId,
    tgMessageId: args.tgMessageId,
    mimeType: args.mimeType ?? "image/jpeg",
    size: args.size,
    fileName: args.fileName,
    width: args.width,
    height: args.height,
    attempts: 0,
    createdAt: Date.now(),
  });
}

/**
 * Inserts a video media row pointing to its optional thumbnail media row,
 * with status "ready", attached true, and storageId: undefined.
 */
export async function insertTelegramVideoRow(
  ctx: MutationCtx,
  args: {
    tgFileId: string;
    tgFileUniqueId: string;
    tgMessageId?: number;
    mimeType?: string;
    size: number;
    fileName?: string;
    width?: number;
    height?: number;
    durationSec?: number;
    thumbMediaId?: Id<"media">;
    ownerId?: Id<"users">;
  },
): Promise<Id<"media">> {
  return await ctx.db.insert("media", {
    ownerId: args.ownerId,
    kind: "video",
    status: "ready",
    attached: true,
    storageId: undefined, // Convex storage 0 bytes used
    tgFileId: args.tgFileId,
    tgFileUniqueId: args.tgFileUniqueId,
    tgMessageId: args.tgMessageId,
    mimeType: args.mimeType ?? "video/mp4",
    size: args.size,
    fileName: args.fileName,
    width: args.width,
    height: args.height,
    durationSec: args.durationSec,
    thumbMediaId: args.thumbMediaId,
    attempts: 0,
    createdAt: Date.now(),
  });
}

// ---------- Public Mutations: Direct Media Insertion ----------

/**
 * Inserts a single Telegram photo/image row into `media` (0 storage bytes).
 */
export const insertTelegramPhoto = mutation({
  args: {
    tgFileId: v.string(),
    tgFileUniqueId: v.string(),
    tgMessageId: v.optional(v.number()),
    mimeType: v.optional(v.string()),
    size: v.number(),
    fileName: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    ownerId: v.optional(v.id("users")),
    kind: v.optional(v.union(v.literal("image"), v.literal("thumbnail"), v.literal("document"))),
  },
  handler: async (ctx, args) => {
    return await insertTelegramPhotoRow(ctx, args);
  },
});

/**
 * Inserts a batch of Telegram photos/images into `media` (0 storage bytes).
 */
export const insertTelegramPhotosBatch = mutation({
  args: {
    items: v.array(
      v.object({
        tgFileId: v.string(),
        tgFileUniqueId: v.string(),
        tgMessageId: v.optional(v.number()),
        mimeType: v.optional(v.string()),
        size: v.number(),
        fileName: v.optional(v.string()),
        width: v.optional(v.number()),
        height: v.optional(v.number()),
        ownerId: v.optional(v.id("users")),
        kind: v.optional(v.union(v.literal("image"), v.literal("thumbnail"), v.literal("document"))),
      }),
    ),
  },
  handler: async (ctx, { items }) => {
    const ids: Id<"media">[] = [];
    for (const item of items) {
      ids.push(await insertTelegramPhotoRow(ctx, item));
    }
    return ids;
  },
});

/**
 * Inserts a Telegram video and its thumbnail into `media` (0 storage bytes).
 */
export const insertTelegramVideoWithThumbnail = mutation({
  args: {
    video: v.object({
      tgFileId: v.string(),
      tgFileUniqueId: v.string(),
      tgMessageId: v.optional(v.number()),
      mimeType: v.optional(v.string()),
      size: v.number(),
      fileName: v.optional(v.string()),
      width: v.optional(v.number()),
      height: v.optional(v.number()),
      durationSec: v.optional(v.number()),
    }),
    thumb: v.optional(
      v.object({
        tgFileId: v.string(),
        tgFileUniqueId: v.string(),
        tgMessageId: v.optional(v.number()),
        mimeType: v.optional(v.string()),
        size: v.number(),
        width: v.optional(v.number()),
        height: v.optional(v.number()),
      }),
    ),
    thumbMediaId: v.optional(v.id("media")),
    ownerId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    let thumbMediaId = args.thumbMediaId;
    if (!thumbMediaId && args.thumb) {
      thumbMediaId = await insertTelegramPhotoRow(ctx, {
        tgFileId: args.thumb.tgFileId,
        tgFileUniqueId: args.thumb.tgFileUniqueId,
        tgMessageId: args.thumb.tgMessageId,
        mimeType: args.thumb.mimeType ?? "image/jpeg",
        size: args.thumb.size,
        width: args.thumb.width,
        height: args.thumb.height,
        ownerId: args.ownerId,
        kind: "thumbnail",
      });
    }

    const videoMediaId = await insertTelegramVideoRow(ctx, {
      ...args.video,
      thumbMediaId,
      ownerId: args.ownerId,
    });

    return { videoMediaId, thumbMediaId };
  },
});

// ---------- Public Mutations: Linking Media to Listings & Videos ----------

/**
 * Attaches existing media IDs to a listing, updating imageIds and coverImageId.
 */
export const attachImagesToListing = mutation({
  args: {
    listingId: v.id("listings"),
    mediaIds: v.array(v.id("media")),
    replace: v.optional(v.boolean()),
  },
  handler: async (ctx, { listingId, mediaIds, replace }) => {
    const listing = await ctx.db.get(listingId);
    if (!listing) throw new ConvexError({ code: "NOT_FOUND", message: "Listing not found" });

    for (const id of mediaIds) {
      const m = await ctx.db.get(id);
      if (m && !m.attached) {
        await ctx.db.patch(id, { attached: true });
      }
    }

    const nextImageIds = replace
      ? mediaIds
      : [...listing.imageIds, ...mediaIds.filter((id) => !listing.imageIds.includes(id))];

    const coverImageId = listing.coverImageId && nextImageIds.includes(listing.coverImageId)
      ? listing.coverImageId
      : nextImageIds[0];

    await ctx.db.patch(listingId, {
      imageIds: nextImageIds,
      coverImageId,
    });

    return { listingId, imageIds: nextImageIds, coverImageId };
  },
});

/**
 * Inserts Telegram photos and immediately attaches them to a listing (0 storage bytes).
 */
export const createAndAttachImagesToListing = mutation({
  args: {
    listingId: v.id("listings"),
    images: v.array(
      v.object({
        tgFileId: v.string(),
        tgFileUniqueId: v.string(),
        tgMessageId: v.optional(v.number()),
        mimeType: v.optional(v.string()),
        size: v.number(),
        fileName: v.optional(v.string()),
        width: v.optional(v.number()),
        height: v.optional(v.number()),
      }),
    ),
    replace: v.optional(v.boolean()),
  },
  handler: async (ctx, { listingId, images, replace }) => {
    const listing = await ctx.db.get(listingId);
    if (!listing) throw new ConvexError({ code: "NOT_FOUND", message: "Listing not found" });

    const newMediaIds: Id<"media">[] = [];
    for (const img of images) {
      const id = await insertTelegramPhotoRow(ctx, {
        ...img,
        ownerId: listing.sellerId,
        kind: "image",
      });
      newMediaIds.push(id);
    }

    const nextImageIds = replace
      ? newMediaIds
      : [...listing.imageIds, ...newMediaIds];

    const coverImageId = listing.coverImageId && nextImageIds.includes(listing.coverImageId)
      ? listing.coverImageId
      : nextImageIds[0];

    await ctx.db.patch(listingId, {
      imageIds: nextImageIds,
      coverImageId,
    });

    return { listingId, addedMediaIds: newMediaIds, totalImages: nextImageIds.length };
  },
});

/**
 * Inserts Telegram photos and attaches them across multiple listings in batches.
 */
export const batchLinkListingPhotos = mutation({
  args: {
    assignments: v.array(
      v.object({
        listingId: v.id("listings"),
        images: v.array(
          v.object({
            tgFileId: v.string(),
            tgFileUniqueId: v.string(),
            tgMessageId: v.optional(v.number()),
            mimeType: v.optional(v.string()),
            size: v.number(),
            fileName: v.optional(v.string()),
            width: v.optional(v.number()),
            height: v.optional(v.number()),
          }),
        ),
      }),
    ),
    replace: v.optional(v.boolean()),
  },
  handler: async (ctx, { assignments, replace }) => {
    let listingsCount = 0;
    let photosCount = 0;
    for (const { listingId, images } of assignments) {
      const listing = await ctx.db.get(listingId);
      if (!listing) continue;

      const newMediaIds: Id<"media">[] = [];
      for (const img of images) {
        const id = await insertTelegramPhotoRow(ctx, {
          ...img,
          ownerId: listing.sellerId,
          kind: "image",
        });
        newMediaIds.push(id);
        photosCount++;
      }

      const nextImageIds = replace
        ? newMediaIds
        : [...listing.imageIds, ...newMediaIds];

      const coverImageId = listing.coverImageId && nextImageIds.includes(listing.coverImageId)
        ? listing.coverImageId
        : nextImageIds[0];

      await ctx.db.patch(listingId, {
        imageIds: nextImageIds,
        coverImageId,
      });
      listingsCount++;
    }
    return { listingsCount, photosCount };
  },
});

/**
 * Inserts Telegram video (+ optional thumbnail), inserts a row in `videos` table,
 * and links it to the listing with hasVideo = true.
 */
export const createAndAttachVideoToListing = mutation({
  args: {
    listingId: v.id("listings"),
    video: v.object({
      tgFileId: v.string(),
      tgFileUniqueId: v.string(),
      tgMessageId: v.optional(v.number()),
      mimeType: v.optional(v.string()),
      size: v.number(),
      fileName: v.optional(v.string()),
      width: v.optional(v.number()),
      height: v.optional(v.number()),
      durationSec: v.optional(v.number()),
    }),
    thumb: v.optional(
      v.object({
        tgFileId: v.string(),
        tgFileUniqueId: v.string(),
        tgMessageId: v.optional(v.number()),
        mimeType: v.optional(v.string()),
        size: v.number(),
        width: v.optional(v.number()),
        height: v.optional(v.number()),
      }),
    ),
    thumbMediaId: v.optional(v.id("media")),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const listing = await ctx.db.get(args.listingId);
    if (!listing) throw new ConvexError({ code: "NOT_FOUND", message: "Listing not found" });

    let thumbMediaId = args.thumbMediaId;
    if (!thumbMediaId && args.thumb) {
      thumbMediaId = await insertTelegramPhotoRow(ctx, {
        tgFileId: args.thumb.tgFileId,
        tgFileUniqueId: args.thumb.tgFileUniqueId,
        tgMessageId: args.thumb.tgMessageId,
        mimeType: args.thumb.mimeType ?? "image/jpeg",
        size: args.thumb.size,
        width: args.thumb.width,
        height: args.thumb.height,
        ownerId: listing.sellerId,
        kind: "thumbnail",
      });
    }

    // Fall back to listing's coverImageId if no specific thumbnail was passed
    if (!thumbMediaId && listing.coverImageId) {
      thumbMediaId = listing.coverImageId;
    }

    const videoMediaId = await insertTelegramVideoRow(ctx, {
      ...args.video,
      thumbMediaId,
      ownerId: listing.sellerId,
    });

    const videoTitle = args.title?.trim().slice(0, 120) || `${listing.title} Walkthrough`;
    const resolutions = args.video.height ? [`${args.video.height}p`] : ["original"];

    const videoId = await ctx.db.insert("videos", {
      listingId: listing._id,
      uploaderId: listing.sellerId,
      mediaId: videoMediaId,
      thumbMediaId,
      title: videoTitle,
      status: "ready",
      moderation: "approved",
      provider: "telegram",
      durationSec: args.video.durationSec,
      resolutions,
      sizeBytes: args.video.size,
      mimeType: args.video.mimeType ?? "video/mp4",
      areaId: listing.areaId,
      landType: listing.landType,
      price: listing.price,
      listingActive: listing.status === "active",
      viewCount: 0,
      createdAt: Date.now(),
      readyAt: Date.now(),
    });

    await syncListingHasVideo(ctx, listing._id);

    return {
      videoId,
      videoMediaId,
      thumbMediaId,
      listingId: listing._id,
    };
  },
});

// ---------- High-Level Seeding & Catalog Distribution ----------

/**
 * Distributes a catalog of harvested Telegram photos and videos across active listings.
 * Accepts both normalized fields (tgFileId, size, etc.) and raw harvest fields (fileId, fileSize, etc.).
 * Guarantees zero Convex storage bytes used (`storageId: undefined`).
 */
export const distributeHarvestedCatalog = mutation({
  args: {
    items: v.array(vFlexibleMediaItem),
    videos: v.array(vFlexibleMediaItem),
    imagesPerListing: v.optional(v.number()),
    maxListingsToVideo: v.optional(v.number()),
    replaceExisting: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const imagesPerListing = args.imagesPerListing ?? 4;
    const listings = await ctx.db.query("listings").collect();

    // 1. Normalize photo items
    const normalizedPhotos = args.items
      .map((item) => {
        const tgFileId = item.tgFileId ?? item.fileId;
        const tgFileUniqueId = item.tgFileUniqueId ?? item.fileUniqueId;
        const size = item.size ?? item.fileSize ?? 0;
        if (!tgFileId || !tgFileUniqueId) return null;
        return {
          tgFileId,
          tgFileUniqueId,
          tgMessageId: item.tgMessageId ?? item.originalMessageId,
          mimeType: item.mimeType ?? "image/jpeg",
          size,
          fileName: item.fileName,
          width: item.width,
          height: item.height,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    // 2. Normalize video items
    const normalizedVideos = args.videos
      .map((item) => {
        const tgFileId = item.tgFileId ?? item.fileId;
        const tgFileUniqueId = item.tgFileUniqueId ?? item.fileUniqueId;
        const size = item.size ?? item.fileSize ?? 0;
        if (!tgFileId || !tgFileUniqueId) return null;
        return {
          tgFileId,
          tgFileUniqueId,
          tgMessageId: item.tgMessageId ?? item.originalMessageId,
          mimeType: item.mimeType ?? "video/mp4",
          size,
          fileName: item.fileName,
          width: item.width,
          height: item.height,
          durationSec: item.durationSec ?? item.duration ?? 0,
          thumbFileId: item.thumbFileId,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    let photoIdx = 0;
    let listingsUpdated = 0;
    let totalMediaCreated = 0;
    let totalVideosCreated = 0;

    // Distribute photos to listings that need them
    for (const listing of listings) {
      if (!args.replaceExisting && listing.imageIds.length >= imagesPerListing) {
        continue;
      }
      if (normalizedPhotos.length === 0) break;

      const newMediaIds: Id<"media">[] = [];
      for (let i = 0; i < imagesPerListing; i++) {
        const photo = normalizedPhotos[photoIdx % normalizedPhotos.length];
        photoIdx++;

        const mediaId = await insertTelegramPhotoRow(ctx, {
          ...photo,
          ownerId: listing.sellerId,
          kind: "image",
        });
        newMediaIds.push(mediaId);
        totalMediaCreated++;
      }

      const nextImageIds = args.replaceExisting
        ? newMediaIds
        : [...listing.imageIds, ...newMediaIds];

      await ctx.db.patch(listing._id, {
        imageIds: nextImageIds,
        coverImageId: nextImageIds[0],
      });
      listingsUpdated++;
    }

    // Distribute videos across listings
    const maxVideoListings = Math.min(
      args.maxListingsToVideo ?? normalizedVideos.length,
      listings.length,
      normalizedVideos.length,
    );

    for (let i = 0; i < maxVideoListings; i++) {
      const listing = listings[i];
      const videoData = normalizedVideos[i];

      // Check if listing already has a video
      const existingVideos = await ctx.db
        .query("videos")
        .withIndex("by_listing", (q) => q.eq("listingId", listing._id))
        .collect();

      if (!args.replaceExisting && existingVideos.length > 0) {
        continue;
      }

      // Thumbnail handling
      let thumbMediaId: Id<"media"> | undefined;
      if (videoData.thumbFileId) {
        thumbMediaId = await insertTelegramPhotoRow(ctx, {
          tgFileId: videoData.thumbFileId,
          tgFileUniqueId: `${videoData.tgFileUniqueId}_thumb`,
          mimeType: "image/jpeg",
          size: 0,
          width: videoData.width,
          height: videoData.height,
          ownerId: listing.sellerId,
          kind: "thumbnail",
        });
        totalMediaCreated++;
      } else if (listing.coverImageId) {
        thumbMediaId = listing.coverImageId;
      }

      const videoMediaId = await insertTelegramVideoRow(ctx, {
        tgFileId: videoData.tgFileId,
        tgFileUniqueId: videoData.tgFileUniqueId,
        tgMessageId: videoData.tgMessageId,
        mimeType: videoData.mimeType,
        size: videoData.size,
        fileName: videoData.fileName,
        width: videoData.width,
        height: videoData.height,
        durationSec: videoData.durationSec,
        thumbMediaId,
        ownerId: listing.sellerId,
      });
      totalMediaCreated++;

      const resolutions = videoData.height ? [`${videoData.height}p`] : ["original"];

      await ctx.db.insert("videos", {
        listingId: listing._id,
        uploaderId: listing.sellerId,
        mediaId: videoMediaId,
        thumbMediaId,
        title: `${listing.title} Walkthrough`,
        status: "ready",
        moderation: "approved",
        provider: "telegram",
        durationSec: videoData.durationSec,
        resolutions,
        sizeBytes: videoData.size,
        mimeType: videoData.mimeType,
        areaId: listing.areaId,
        landType: listing.landType,
        price: listing.price,
        listingActive: listing.status === "active",
        viewCount: 0,
        createdAt: Date.now(),
        readyAt: Date.now(),
      });

      await syncListingHasVideo(ctx, listing._id);
      totalVideosCreated++;
    }

    return {
      listingsUpdated,
      totalMediaCreated,
      totalVideosCreated,
      storageBytesUsed: 0, // Guarantees 0 bytes used in Convex storage
    };
  },
});

// ---------- Queries: Inspection & Status ----------

/**
 * Returns diagnostic stats about listings and media, confirming 0 Convex storage usage.
 */
export const getMediaSeedStatus = query({
  args: {},
  handler: async (ctx) => {
    const listings = await ctx.db.query("listings").collect();
    const media = await ctx.db.query("media").collect();
    const videos = await ctx.db.query("videos").collect();

    const listingsWithImages = listings.filter((l) => l.imageIds && l.imageIds.length > 0).length;
    const listingsWithVideos = listings.filter((l) => l.hasVideo).length;

    const convexStorageMediaCount = media.filter((m) => !!m.storageId).length;
    const telegramOnlyMediaCount = media.filter((m) => !m.storageId && !!m.tgFileId).length;

    return {
      totalListings: listings.length,
      listingsWithImages,
      listingsNeedingImages: listings.length - listingsWithImages,
      listingsWithVideos,
      totalMediaRows: media.length,
      telegramOnlyMediaCount,
      convexStorageMediaCount, // Should be 0 for Telegram-seeded media
      totalVideosRows: videos.length,
      readyVideosCount: videos.filter((v) => v.status === "ready").length,
    };
  },
});

/**
 * Lists listings that currently need images or videos, useful for targeted seeding.
 */
export const listingsNeedingMedia = query({
  args: {},
  handler: async (ctx) => {
    const listings = await ctx.db.query("listings").collect();
    return listings.map((l) => ({
      _id: l._id,
      title: l.title,
      slug: l.slug,
      landType: l.landType,
      areaName: l.areaName,
      imageCount: l.imageIds?.length ?? 0,
      hasVideo: l.hasVideo,
      sellerId: l.sellerId,
    }));
  },
});
