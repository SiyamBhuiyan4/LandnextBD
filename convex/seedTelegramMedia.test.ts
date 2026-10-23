/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function setupTestEnvironment() {
  const t = convexTest(schema, modules);

  const sellerId = await t.run((ctx) =>
    ctx.db.insert("users", {
      name: "Test Seller",
      email: "seller@landnest.test",
      role: "seller",
      verificationStatus: "verified",
      accountType: "owner",
      createdAt: Date.now(),
    }),
  );

  const areaId = await t.run((ctx) =>
    ctx.db.insert("areas", {
      division: "Dhaka",
      district: "Dhaka",
      upazila: "Uttara",
      areaName: "Uttara Sector 4",
      slug: "uttara-sector-4",
      geohash: "wh0rb",
      centerLat: 23.87,
      centerLng: 90.38,
      activeCount: 1,
    }),
  );

  const listingId = await t.run((ctx) =>
    ctx.db.insert("listings", {
      title: "Prime Land in Uttara",
      slug: "prime-land-in-uttara-123",
      description: "Excellent residential plot",
      landType: "residential",
      sizeValue: 5,
      sizeUnit: "katha",
      sizeSqft: 3600,
      price: 15000000,
      pricePerSqft: 4166,
      currency: "BDT",
      negotiable: true,
      areaId,
      division: "Dhaka",
      district: "Dhaka",
      areaName: "Uttara Sector 4",
      areaSlug: "uttara-sector-4",
      nearbyFacilities: [],
      utilities: [],
      hasBoundaryWall: true,
      landStatus: "ready",
      documents: [],
      imageIds: [],
      sellerId,
      sellerType: "owner",
      status: "active",
      isVerified: true,
      isFeatured: false,
      hasVideo: false,
      searchText: "prime land uttara",
      viewCount: 0,
      saveCount: 0,
      inquiryCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );

  return { t, sellerId, areaId, listingId };
}

describe("seedTelegramMedia", () => {
  it("inserts a photo directly into media table with 0 Convex storage bytes", async () => {
    const { t, sellerId } = await setupTestEnvironment();

    const mediaId = await t.mutation(api.seedTelegramMedia.insertTelegramPhoto, {
      tgFileId: "AgACAgUAAyEFAAMBBKE4NQADAmra5QI9TrPRVB34bKrdORaZL_LAAAJVE2sbPmbIVk_d918y3Y6JAQADAgADeQADPQQ",
      tgFileUniqueId: "AQADVRNrGz5myFZ-",
      tgMessageId: 2,
      mimeType: "image/jpeg",
      size: 50050,
      width: 1280,
      height: 562,
      ownerId: sellerId,
    });

    const m = await t.run((ctx) => ctx.db.get(mediaId));
    expect(m).not.toBeNull();
    expect(m?.status).toBe("ready");
    expect(m?.attached).toBe(true);
    expect(m?.storageId).toBeUndefined(); // Zero storage used!
    expect(m?.tgFileId).toBe("AgACAgUAAyEFAAMBBKE4NQADAmra5QI9TrPRVB34bKrdORaZL_LAAAJVE2sbPmbIVk_d918y3Y6JAQADAgADeQADPQQ");
    expect(m?.tgFileUniqueId).toBe("AQADVRNrGz5myFZ-");
    expect(m?.tgMessageId).toBe(2);
    expect(m?.size).toBe(50050);
    expect(m?.width).toBe(1280);
    expect(m?.height).toBe(562);
  });

  it("inserts video with thumbnail with 0 Convex storage bytes", async () => {
    const { t, sellerId } = await setupTestEnvironment();

    const { videoMediaId, thumbMediaId } = await t.mutation(
      api.seedTelegramMedia.insertTelegramVideoWithThumbnail,
      {
        video: {
          tgFileId: "BAACAgUAAyEGAAMBBKE4NQADBWra5X1fSWWAB0uLrnVKikFAHs27AAKtJQACPmbIVvblNfp_09BFPQQ",
          tgFileUniqueId: "AgADrSUAAj5myFY",
          tgMessageId: 5,
          mimeType: "video/mp4",
          size: 8575461,
          width: 1280,
          height: 720,
          durationSec: 17,
          fileName: "walkthrough.mp4",
        },
        thumb: {
          tgFileId: "AAMCBQADIQYAAwEEoTg1AAMFatrlfV9JZYAHS4uudUqKQUAezbsAAq0lAAI-ZshW9uU1-n_T0EUBAAdtAAM9BA",
          tgFileUniqueId: "thumb_unique_123",
          tgMessageId: 4,
          mimeType: "image/jpeg",
          size: 97051,
          width: 1280,
          height: 720,
        },
        ownerId: sellerId,
      },
    );

    const videoMedia = await t.run((ctx) => ctx.db.get(videoMediaId));
    const thumbMedia = await t.run((ctx) => ctx.db.get(thumbMediaId!));

    expect(videoMedia?.status).toBe("ready");
    expect(videoMedia?.storageId).toBeUndefined();
    expect(videoMedia?.kind).toBe("video");
    expect(videoMedia?.thumbMediaId).toBe(thumbMediaId);

    expect(thumbMedia?.status).toBe("ready");
    expect(thumbMedia?.storageId).toBeUndefined();
    expect(thumbMedia?.kind).toBe("thumbnail");
  });

  it("creates and attaches images to a listing", async () => {
    const { t, listingId } = await setupTestEnvironment();

    const res = await t.mutation(api.seedTelegramMedia.createAndAttachImagesToListing, {
      listingId,
      images: [
        {
          tgFileId: "file_img_1",
          tgFileUniqueId: "uniq_1",
          mimeType: "image/webp",
          size: 15000,
          width: 1280,
          height: 853,
        },
        {
          tgFileId: "file_img_2",
          tgFileUniqueId: "uniq_2",
          mimeType: "image/webp",
          size: 18000,
          width: 1280,
          height: 853,
        },
      ],
    });

    expect(res.addedMediaIds.length).toBe(2);
    expect(res.totalImages).toBe(2);

    const listing = await t.run((ctx) => ctx.db.get(listingId));
    expect(listing?.imageIds.length).toBe(2);
    expect(listing?.coverImageId).toBe(res.addedMediaIds[0]);

    for (const id of res.addedMediaIds) {
      const m = await t.run((ctx) => ctx.db.get(id));
      expect(m?.status).toBe("ready");
      expect(m?.attached).toBe(true);
      expect(m?.storageId).toBeUndefined();
    }
  });

  it("creates and attaches video to a listing and marks hasVideo = true", async () => {
    const { t, listingId } = await setupTestEnvironment();

    const res = await t.mutation(api.seedTelegramMedia.createAndAttachVideoToListing, {
      listingId,
      video: {
        tgFileId: "vid_file_1",
        tgFileUniqueId: "vid_uniq_1",
        tgMessageId: 5,
        mimeType: "video/mp4",
        size: 8575461,
        width: 1280,
        height: 720,
        durationSec: 17,
        fileName: "test_walkthrough.mp4",
      },
      thumb: {
        tgFileId: "thumb_file_1",
        tgFileUniqueId: "thumb_uniq_1",
        mimeType: "image/jpeg",
        size: 50000,
        width: 1280,
        height: 720,
      },
      title: "Full Site Walkthrough",
    });

    const listing = await t.run((ctx) => ctx.db.get(listingId));
    expect(listing?.hasVideo).toBe(true);

    const video = await t.run((ctx) => ctx.db.get(res.videoId));
    expect(video?.status).toBe("ready");
    expect(video?.moderation).toBe("approved");
    expect(video?.provider).toBe("telegram");
    expect(video?.mediaId).toBe(res.videoMediaId);
    expect(video?.thumbMediaId).toBe(res.thumbMediaId);
    expect(video?.title).toBe("Full Site Walkthrough");
  });

  it("distributes cataloged harvested items across listings with 0 storage bytes", async () => {
    const { t, listingId } = await setupTestEnvironment();

    const result = await t.mutation(api.seedTelegramMedia.distributeHarvestedCatalog, {
      items: [
        {
          fileId: "harvest_photo_1",
          fileUniqueId: "uniq_p1",
          fileSize: 45000,
          mimeType: "image/jpeg",
          width: 1280,
          height: 800,
        },
        {
          fileId: "harvest_photo_2",
          fileUniqueId: "uniq_p2",
          fileSize: 52000,
          mimeType: "image/jpeg",
          width: 1280,
          height: 800,
        },
      ],
      videos: [
        {
          fileId: "harvest_vid_1",
          fileUniqueId: "uniq_v1",
          fileSize: 8500000,
          duration: 15,
          thumbFileId: "harvest_thumb_1",
          width: 1280,
          height: 720,
        },
      ],
      imagesPerListing: 2,
    });

    expect(result.storageBytesUsed).toBe(0);
    expect(result.listingsUpdated).toBe(1);
    expect(result.totalVideosCreated).toBe(1);

    const status = await t.query(api.seedTelegramMedia.getMediaSeedStatus, {});
    expect(status.convexStorageMediaCount).toBe(0); // 0 bytes / 0 Convex storage rows!
    expect(status.telegramOnlyMediaCount).toBeGreaterThan(0);
    expect(status.listingsWithVideos).toBe(1);
  });
});
