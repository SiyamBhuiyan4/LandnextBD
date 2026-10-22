import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  vAccountType,
  vDocument,
  vFacility,
  vFacing,
  vLandStatus,
  vLandType,
  vListingFilters,
  vListingStatus,
  vModeration,
  vReportReason,
  vRole,
  vSizeUnit,
  vUtility,
  vVerificationStatus,
  vVideoStatus,
} from "./validators";

export default defineSchema({
  ...authTables,

  // Extends the Convex Auth users table. Auth creates the row first, then
  // afterUserCreatedOrUpdated fills role/verification defaults.
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    role: v.optional(vRole),
    verificationStatus: v.optional(vVerificationStatus),
    accountType: v.optional(vAccountType),
    companyName: v.optional(v.string()),
    bio: v.optional(v.string()),
    nidNumber: v.optional(v.string()),
    banned: v.optional(v.boolean()),
    createdAt: v.optional(v.number()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_role", ["role"])
    .index("by_verification", ["verificationStatus"]),

  areas: defineTable({
    division: v.string(),
    district: v.string(),
    upazila: v.string(),
    areaName: v.string(),
    areaNameBn: v.optional(v.string()),
    slug: v.string(),
    geohash: v.string(),
    centerLat: v.number(),
    centerLng: v.number(),
    activeCount: v.number(), // maintained on listing status changes
  })
    .index("by_slug", ["slug"])
    .index("by_division_district", ["division", "district"])
    .index("by_active", ["activeCount"])
    .searchIndex("search_name", { searchField: "areaName", filterFields: ["division", "district"] }),

  listings: defineTable({
    title: v.string(),
    slug: v.string(),
    description: v.string(),
    landType: vLandType,
    sizeValue: v.number(),
    sizeUnit: vSizeUnit,
    sizeSqft: v.number(),
    price: v.number(),
    pricePerSqft: v.number(),
    currency: v.literal("BDT"),
    negotiable: v.boolean(),

    areaId: v.id("areas"),
    division: v.string(),
    district: v.string(),
    areaName: v.string(),
    areaSlug: v.string(),
    exactAddress: v.optional(v.string()),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    geohash: v.optional(v.string()),

    facing: v.optional(vFacing),
    roadWidthFt: v.optional(v.number()),
    plotNumber: v.optional(v.string()),
    sectorBlock: v.optional(v.string()),
    nearbyFacilities: v.array(vFacility),
    utilities: v.array(vUtility),
    hasBoundaryWall: v.boolean(),
    landStatus: vLandStatus,

    documents: v.array(vDocument),
    imageIds: v.array(v.id("media")),
    coverImageId: v.optional(v.id("media")),

    sellerId: v.id("users"),
    sellerType: vAccountType, // denormalized for the card
    status: vListingStatus,
    rejectionReason: v.optional(v.string()),
    isVerified: v.boolean(), // admin verified documents
    isFeatured: v.boolean(),
    promotionRequested: v.optional(v.boolean()),
    hasVideo: v.boolean(),

    // Combined text for the full-text index (title + area + description).
    searchText: v.string(),

    viewCount: v.number(),
    saveCount: v.number(),
    inquiryCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    publishedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    expiryWarnedAt: v.optional(v.number()), // "expires soon" notification sent for this expiresAt
  })
    .index("by_slug", ["slug"])
    .index("by_seller", ["sellerId", "updatedAt"])
    .index("by_status_published", ["status", "publishedAt"])
    .index("by_status_area_type", ["status", "areaId", "landType", "publishedAt"])
    .index("by_status_area_published", ["status", "areaId", "publishedAt"])
    .index("by_status_type", ["status", "landType", "publishedAt"])
    .index("by_status_district", ["status", "district", "publishedAt"])
    .index("by_status_division", ["status", "division", "publishedAt"])
    .index("by_price_area", ["status", "areaId", "price"])
    .index("by_status_price", ["status", "price"])
    .index("by_status_size", ["status", "sizeSqft"])
    .index("by_status_views", ["status", "viewCount"])
    .index("by_status_featured", ["status", "isFeatured", "publishedAt"])
    .index("by_status_expires", ["status", "expiresAt"])
    .index("by_geohash", ["status", "geohash"])
    .index("by_area_plot", ["areaId", "plotNumber"])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["status", "landType", "areaId", "district", "division"],
    }),

  videos: defineTable({
    listingId: v.id("listings"),
    uploaderId: v.id("users"),
    mediaId: v.optional(v.id("media")),
    title: v.optional(v.string()),
    status: vVideoStatus,
    moderation: vModeration,
    provider: v.union(v.literal("telegram"), v.literal("seed")),
    hlsUrl: v.optional(v.string()), // seed placeholders only
    thumbMediaId: v.optional(v.id("media")),
    durationSec: v.optional(v.number()),
    resolutions: v.optional(v.array(v.string())),
    sizeBytes: v.optional(v.number()),
    mimeType: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    // copied from the listing for related-video queries
    areaId: v.id("areas"),
    landType: vLandType,
    price: v.number(),
    listingActive: v.boolean(),
    viewCount: v.number(),
    createdAt: v.number(),
    readyAt: v.optional(v.number()),
  })
    .index("by_listing", ["listingId", "createdAt"])
    .index("by_area_type_status", ["areaId", "landType", "status", "createdAt"])
    .index("by_area_status", ["areaId", "status", "createdAt"])
    .index("by_type_status", ["landType", "status", "createdAt"])
    .index("by_status", ["status", "createdAt"])
    .index("by_moderation", ["moderation", "createdAt"])
    .index("by_media", ["mediaId"]),

  saves: defineTable({
    userId: v.id("users"),
    listingId: v.id("listings"),
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_listing", ["listingId"])
    .index("by_user_listing", ["userId", "listingId"]),

  savedSearches: defineTable({
    userId: v.id("users"),
    name: v.string(),
    filters: vListingFilters,
    notifyVia: v.union(v.literal("email"), v.literal("push")),
    lastNotifiedAt: v.number(),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),

  inquiries: defineTable({
    listingId: v.id("listings"),
    sellerId: v.id("users"),
    buyerId: v.id("users"),
    message: v.string(),
    contactPhone: v.string(), // visible only to the seller
    status: v.union(v.literal("new"), v.literal("replied"), v.literal("closed")),
    sellerNote: v.optional(v.string()),
    createdAt: v.number(),
    repliedAt: v.optional(v.number()),
  })
    .index("by_listing", ["listingId", "createdAt"])
    .index("by_buyer", ["buyerId", "createdAt"])
    .index("by_seller", ["sellerId", "createdAt"])
    .index("by_buyer_listing", ["buyerId", "listingId"]),

  reports: defineTable({
    listingId: v.id("listings"),
    reporterId: v.id("users"),
    reason: vReportReason,
    details: v.optional(v.string()),
    status: v.union(v.literal("open"), v.literal("reviewed"), v.literal("dismissed")),
    createdAt: v.number(),
  })
    .index("by_status", ["status", "createdAt"])
    .index("by_listing", ["listingId"]),

  watchHistory: defineTable({
    userId: v.id("users"),
    videoId: v.id("videos"),
    listingId: v.id("listings"),
    progressSec: v.number(),
    durationSec: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId", "updatedAt"])
    .index("by_user_video", ["userId", "videoId"]),

  // ---- supporting tables (not in the original spec, needed for features) ----

  // Fixed-window rate limiter keyed by e.g. "inquiry:<userId>".
  rateLimits: defineTable({
    key: v.string(),
    windowStart: v.number(),
    count: v.number(),
  }).index("by_key", ["key"]),

  // Per-listing daily counters for seller analytics.
  dailyStats: defineTable({
    listingId: v.id("listings"),
    sellerId: v.id("users"),
    day: v.string(), // YYYY-MM-DD (Asia/Dhaka)
    views: v.number(),
    inquiries: v.number(),
    videoWatchSec: v.number(),
  })
    .index("by_listing_day", ["listingId", "day"])
    .index("by_seller_day", ["sellerId", "day"])
    .index("by_day", ["day"]),

  // In-app notifications (also the "push" channel for saved-search alerts).
  notifications: defineTable({
    userId: v.id("users"),
    kind: v.union(
      v.literal("saved_search"),
      v.literal("inquiry"),
      v.literal("listing_approved"),
      v.literal("listing_rejected"),
      v.literal("listing_expired"),
      v.literal("video_ready"),
      v.literal("video_failed"),
    ),
    title: v.string(),
    body: v.string(),
    href: v.optional(v.string()),
    read: v.boolean(),
    createdAt: v.number(),
  }).index("by_user", ["userId", "read", "createdAt"]),

  // Every photo, video and document. Bytes live in Telegram (private channel);
  // Convex storage only holds an upload until it has been pushed there.
  media: defineTable({
    ownerId: v.optional(v.id("users")),
    kind: v.union(v.literal("image"), v.literal("document"), v.literal("video"), v.literal("thumbnail")),
    status: v.union(v.literal("pending"), v.literal("ready"), v.literal("failed")),
    attached: v.boolean(),
    storageId: v.optional(v.id("_storage")),
    tgFileId: v.optional(v.string()),
    tgFileUniqueId: v.optional(v.string()),
    tgMessageId: v.optional(v.number()),
    tgFilePath: v.optional(v.string()),
    tgFilePathAt: v.optional(v.number()),
    // Files bigger than CONFIG.telegramChunkBytes (big videos) are stored as
    // ordered parts; the single-file fields above stay empty for those rows.
    parts: v.optional(
      v.array(
        v.object({
          storageId: v.optional(v.id("_storage")),
          size: v.number(),
          tgFileId: v.optional(v.string()),
          tgFileUniqueId: v.optional(v.string()),
          tgMessageId: v.optional(v.number()),
          tgFilePath: v.optional(v.string()),
          tgFilePathAt: v.optional(v.number()),
        }),
      ),
    ),
    // set while a part is being sent to Telegram, so only one push chain runs per file
    pushLeaseAt: v.optional(v.number()),
    // poster frame captured in the browser (kind "thumbnail")
    thumbMediaId: v.optional(v.id("media")),
    mimeType: v.string(),
    size: v.number(),
    fileName: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    durationSec: v.optional(v.number()),
    error: v.optional(v.string()),
    attempts: v.number(),
    createdAt: v.number(),
  })
    .index("by_attached", ["attached", "createdAt"])
    .index("by_status", ["status", "createdAt"])
    .index("by_storage", ["storageId"]),
});
