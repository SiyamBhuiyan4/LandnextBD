import { v } from "convex/values";
import ngeohash from "ngeohash";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Facility, Facing, LandType, Utility } from "../lib/constants";
import { slugify } from "../lib/format";
import { deleteMedia } from "./media";
import { toSqft, type SizeUnit } from "../lib/units";

// All seed data is generated here. Nothing is copied from any real listing.
// Run: npx convex run seed:run   (then: node scripts/seed-images.mjs)

const AREAS = [
  { division: "Dhaka", district: "Narayanganj", upazila: "Rupganj", areaName: "Purbachal", areaNameBn: "পূর্বাচল", lat: 23.835, lng: 90.53, perKathaLakh: [35, 70] },
  { division: "Dhaka", district: "Dhaka", upazila: "Vatara", areaName: "Bashundhara R/A", areaNameBn: "বসুন্ধরা আ/এ", lat: 23.8193, lng: 90.4526, perKathaLakh: [90, 170] },
  { division: "Dhaka", district: "Dhaka", upazila: "Uttara", areaName: "Uttara", areaNameBn: "উত্তরা", lat: 23.8759, lng: 90.3795, perKathaLakh: [110, 220] },
  { division: "Dhaka", district: "Dhaka", upazila: "Keraniganj", areaName: "Keraniganj", areaNameBn: "কেরানীগঞ্জ", lat: 23.698, lng: 90.346, perKathaLakh: [8, 22] },
  { division: "Dhaka", district: "Dhaka", upazila: "Savar", areaName: "Savar", areaNameBn: "সাভার", lat: 23.8583, lng: 90.2667, perKathaLakh: [10, 28] },
  { division: "Dhaka", district: "Gazipur", upazila: "Gazipur Sadar", areaName: "Gazipur Sadar", areaNameBn: "গাজীপুর সদর", lat: 23.9999, lng: 90.4203, perKathaLakh: [9, 24] },
  { division: "Chattogram", district: "Chattogram", upazila: "Double Mooring", areaName: "Halishahar", areaNameBn: "হালিশহর", lat: 22.342, lng: 91.779, perKathaLakh: [30, 65] },
  { division: "Sylhet", district: "Sylhet", upazila: "Sylhet Sadar", areaName: "Tilagarh", areaNameBn: "টিলাগড়", lat: 24.899, lng: 91.901, perKathaLakh: [15, 38] },
] as const;

const SELLERS = [
  { name: "Rahim Uddin", accountType: "owner", verificationStatus: "verified", phone: "+8801700000101", role: "seller" },
  { name: "Nasrin Akter", accountType: "owner", verificationStatus: "unverified", phone: "+8801700000102", role: "seller" },
  { name: "Green Acre Properties", accountType: "company", verificationStatus: "verified", phone: "+8801700000103", role: "broker" },
  { name: "Kamal Hossain", accountType: "broker", verificationStatus: "verified", phone: "+8801700000104", role: "broker" },
  { name: "Delta Land Solutions", accountType: "company", verificationStatus: "pending", phone: "+8801700000105", role: "broker" },
  { name: "Farzana Rahman", accountType: "owner", verificationStatus: "verified", phone: "+8801700000106", role: "seller" },
] as const;

// Public HLS test streams used as placeholder playback for seeded video records.
const SAMPLE_STREAMS = [
  "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
  "https://test-streams.mux.dev/tos_ismc/main.m3u8",
  "https://test-streams.mux.dev/test_001/stream.m3u8",
];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TYPE_LABEL: Record<LandType, string> = {
  residential: "Residential Plot",
  commercial: "Commercial Plot",
  mixed_use: "Mixed-use Plot",
  industrial: "Industrial Land",
  farmland: "Farmland",
  quarry: "Quarry Land",
};
const FACING_LABEL: Record<Facing, string> = {
  north: "North-facing",
  south: "South-facing",
  east: "East-facing",
  west: "West-facing",
  north_east: "North-east corner",
  north_west: "North-west corner",
  south_east: "South-east corner",
  south_west: "South-west corner",
};

export const run = internalMutation({
  args: { listings: v.optional(v.number()) },
  handler: async (ctx, { listings: count = 40 }) => {
    if (await ctx.db.query("areas").first()) return "Already seeded. Run seed:reset first to reseed.";
    const r = rng(20261021);
    const pick = <T,>(arr: readonly T[]) => arr[Math.floor(r() * arr.length)];
    const now = Date.now();

    const areaIds: Id<"areas">[] = [];
    for (const a of AREAS) {
      areaIds.push(
        await ctx.db.insert("areas", {
          division: a.division,
          district: a.district,
          upazila: a.upazila,
          areaName: a.areaName,
          areaNameBn: a.areaNameBn,
          slug: slugify(a.areaName),
          geohash: ngeohash.encode(a.lat, a.lng, 5),
          centerLat: a.lat,
          centerLng: a.lng,
          activeCount: 0,
        }),
      );
    }

    const sellerIds: Id<"users">[] = [];
    for (const s of SELLERS) {
      sellerIds.push(
        await ctx.db.insert("users", {
          name: s.name,
          phone: s.phone,
          role: s.role,
          accountType: s.accountType,
          verificationStatus: s.verificationStatus,
          companyName: s.accountType === "company" ? s.name : undefined,
          createdAt: now - (30 + Math.floor(r() * 400)) * 86400_000,
        }),
      );
    }

    const types: LandType[] = ["residential", "residential", "residential", "commercial", "mixed_use", "farmland", "industrial", "quarry"];
    const facings: Facing[] = ["north", "south", "east", "west", "north_east", "south_east", "north_west", "south_west"];
    const allUtilities: Utility[] = ["electricity", "water", "gas", "sewerage", "drainage"];
    const allFacilities: Facility[] = ["car_parking", "school", "hospital", "mosque", "market", "park", "bus_stand", "highway", "lake_view", "security"];

    const created: { id: Id<"listings">; areaId: Id<"areas">; landType: LandType; price: number; title: string }[] = [];
    for (let i = 0; i < count; i++) {
      // First five areas get most listings; every area gets at least one.
      const areaIndex = i < AREAS.length ? i : Math.floor(r() * (r() < 0.8 ? 5 : AREAS.length));
      const area = AREAS[areaIndex];
      const areaId = areaIds[areaIndex];
      let landType = pick(types);
      if (area.areaName === "Bashundhara R/A" || area.areaName === "Uttara") landType = r() < 0.7 ? "residential" : "commercial";

      let sizeUnit: SizeUnit = "katha";
      let sizeValue = pick([3, 3, 4, 5, 5, 6, 7.5, 10]);
      let perKatha = (area.perKathaLakh[0] + r() * (area.perKathaLakh[1] - area.perKathaLakh[0])) * 100_000;
      if (landType === "commercial") perKatha *= 1.4;
      if (landType === "farmland") {
        sizeUnit = r() < 0.5 ? "bigha" : "decimal";
        sizeValue = sizeUnit === "bigha" ? pick([1, 2, 3, 5]) : pick([20, 33, 50, 66, 100]);
        perKatha *= 0.12;
      }
      if (landType === "industrial" || landType === "quarry") {
        sizeUnit = r() < 0.5 ? "bigha" : "decimal";
        sizeValue = sizeUnit === "bigha" ? pick([2, 4, 6, 10]) : pick([50, 80, 120, 200]);
        perKatha *= 0.35;
      }
      const sizeSqft = toSqft(sizeValue, sizeUnit);
      const price = Math.round(((sizeSqft / 720) * perKatha) / 50_000) * 50_000;
      const facing = pick(facings);
      const roadWidthFt = pick([12, 16, 20, 25, 30, 40, 60, 100]);
      const sector = landType === "residential" || landType === "commercial" ? `Sector ${1 + Math.floor(r() * 18)}` : undefined;
      const block = sector ? `Block ${"ABCDEFGH"[Math.floor(r() * 8)]}` : undefined;
      const sectorBlock = sector ? `${sector}, ${block}` : undefined;
      const unitLabel = sizeUnit === "katha" ? "Katha" : sizeUnit === "bigha" ? "Bigha" : "Decimal";
      const title = `${sizeValue} ${unitLabel} ${FACING_LABEL[facing]} ${TYPE_LABEL[landType]} in ${area.areaName}${sector ? `, ${sector}` : ""}`;
      const utilities = allUtilities.filter(() => r() < 0.65);
      const nearbyFacilities = allFacilities.filter(() => r() < 0.35);
      if (!utilities.includes("electricity") && r() < 0.8) utilities.unshift("electricity");
      const lat = area.lat + (r() - 0.5) * 0.03;
      const lng = area.lng + (r() - 0.5) * 0.03;
      const publishedAt = now - Math.floor(r() * 45 * 86400_000) - Math.floor(r() * 86400_000);
      const sellerIndex = Math.floor(r() * sellerIds.length);
      const seller = SELLERS[sellerIndex];
      const docs = r() < 0.75;
      const description = [
        `${sizeValue} ${unitLabel.toLowerCase()} ${TYPE_LABEL[landType].toLowerCase()} available in ${area.areaName}, ${area.district}.`,
        `The plot is ${FACING_LABEL[facing].toLowerCase()} with a ${roadWidthFt} ft access road${sectorBlock ? ` in ${sectorBlock}` : ""}.`,
        utilities.length ? `Utilities on site: ${utilities.join(", ")}.` : "Utility connections can be arranged.",
        docs ? "Deed, khatian and mutation papers are ready for inspection." : "Documents will be shared with serious buyers.",
        "Sample listing generated for the LandnestBD demo.",
      ].join(" ");

      const id = await ctx.db.insert("listings", {
        title,
        slug: `${slugify(title)}-${(i + 1).toString(36)}${Math.floor(r() * 1296).toString(36)}`,
        description,
        landType,
        sizeValue,
        sizeUnit,
        sizeSqft,
        price,
        pricePerSqft: Math.round((price / sizeSqft) * 100) / 100,
        currency: "BDT",
        negotiable: r() < 0.6,
        areaId,
        division: area.division,
        district: area.district,
        areaName: area.areaName,
        areaSlug: slugify(area.areaName),
        exactAddress: `Plot ${100 + i}, ${sectorBlock ?? area.upazila}, ${area.areaName}, ${area.district}`,
        lat,
        lng,
        geohash: ngeohash.encode(lat, lng, 7),
        facing,
        roadWidthFt,
        plotNumber: String(100 + i),
        sectorBlock,
        nearbyFacilities,
        utilities,
        hasBoundaryWall: r() < 0.5,
        landStatus: r() < 0.7 ? "ready" : "under_development",
        documents: [],
        imageIds: [],
        sellerId: sellerIds[sellerIndex],
        sellerType: seller.accountType,
        status: "active",
        isVerified: docs && seller.verificationStatus === "verified",
        isFeatured: i % 6 === 0,
        hasVideo: false,
        searchText: `${title} ${area.areaName} ${area.district} ${sectorBlock ?? ""} ${description}`,
        viewCount: Math.floor(r() * 900),
        saveCount: Math.floor(r() * 40),
        inquiryCount: Math.floor(r() * 12),
        createdAt: publishedAt - 86400_000,
        updatedAt: publishedAt,
        publishedAt,
        expiresAt: publishedAt + 90 * 86400_000,
      });
      created.push({ id, areaId, landType, price, title });
      const a = await ctx.db.get(areaId);
      await ctx.db.patch(areaId, { activeCount: (a?.activeCount ?? 0) + 1 });
    }

    // Placeholder video records on roughly a third of the listings.
    let videos = 0;
    for (const [i, l] of created.entries()) {
      if (i % 3 !== 0) continue;
      const n = i % 2 === 0 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        await ctx.db.insert("videos", {
          listingId: l.id,
          uploaderId: sellerIds[0],
          title: k === 0 ? "Site walkthrough" : "Access road and surroundings",
          status: "ready",
          moderation: "approved",
          provider: "seed",
          hlsUrl: SAMPLE_STREAMS[(i + k) % SAMPLE_STREAMS.length],
          durationSec: 60 + ((i * 37 + k * 11) % 240),
          resolutions: ["360p", "720p", "1080p"],
          areaId: l.areaId,
          landType: l.landType,
          price: l.price,
          listingActive: true,
          viewCount: (i * 13) % 200,
          createdAt: now - i * 3600_000 - k * 60_000,
          readyAt: now - i * 3600_000,
        });
        videos++;
      }
      await ctx.db.patch(l.id, { hasVideo: true });
    }
    return `Seeded ${AREAS.length} areas, ${SELLERS.length} sellers, ${created.length} listings, ${videos} videos.`;
  },
});

/** Listings still missing images, for scripts/seed-images.mjs. */
export const listingsNeedingImages = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("listings").take(1000);
    return rows
      .filter((l) => l.imageIds.length === 0)
      .map((l) => ({ id: l._id, landType: l.landType, title: l.title, areaName: l.areaName, facing: l.facing ?? "north" }));
  },
});

export const uploadUrls = internalMutation({
  args: { n: v.number() },
  handler: async (ctx, { n }) => {
    const urls: string[] = [];
    for (let i = 0; i < Math.min(n, 200); i++) urls.push(await ctx.storage.generateUploadUrl());
    return urls;
  },
});

export const attachImages = internalMutation({
  args: { listingId: v.id("listings"), storageIds: v.array(v.id("_storage")) },
  handler: async (ctx, { listingId, storageIds }) => {
    const listing = await ctx.db.get(listingId);
    if (!listing) return null;
    const ids: Id<"media">[] = [];
    for (const storageId of storageIds) {
      const meta = await ctx.db.system.get(storageId);
      const id = await ctx.db.insert("media", {
        ownerId: listing.sellerId,
        kind: "image",
        status: "ready",
        attached: true,
        storageId,
        mimeType: meta?.contentType ?? "image/webp",
        size: meta?.size ?? 0,
        attempts: 0,
        createdAt: Date.now(),
      });
      ids.push(id);
    }
    // Bytes stay in Convex storage until `npx convex run telegram:backfill`
    // moves them to Telegram at a rate the Bot API allows.
    await ctx.db.patch(listingId, { imageIds: ids, coverImageId: ids[0] });
    const vids = await ctx.db
      .query("videos")
      .withIndex("by_listing", (q) => q.eq("listingId", listingId))
      .collect();
    for (const [i, vid] of vids.entries())
      if (vid.provider === "seed" && !vid.thumbMediaId) await ctx.db.patch(vid._id, { thumbMediaId: ids[(i + 1) % ids.length] });
    return null;
  },
});

/** Danger: wipes all marketplace data (keeps auth tables). Dev only. */
export const reset = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const table of ["videos", "saves", "savedSearches", "inquiries", "reports", "watchHistory", "dailyStats", "notifications", "rateLimits", "areas", "listings"] as const) {
      for (const row of await ctx.db.query(table).collect()) await ctx.db.delete(row._id);
    }
    const media = await ctx.db.query("media").collect();
    await deleteMedia(
      ctx,
      media.map((m) => m._id),
    );
    // Seed users have no auth account; real users are kept.
    for (const u of await ctx.db.query("users").collect()) {
      const account = await ctx.db
        .query("authAccounts")
        .withIndex("userIdAndProvider", (q) => q.eq("userId", u._id))
        .first();
      if (!account) await ctx.db.delete(u._id);
    }
    return "Reset complete.";
  },
});


/** Removes QA/E2E accounts (emails ending in `suffix`) and everything they created. */
export const purgeTestUsers = internalMutation({
  args: { suffix: v.optional(v.string()) },
  handler: async (ctx, { suffix = "@landnestbd.test" }) => {
    const users = (await ctx.db.query("users").collect()).filter((u) => u.email?.endsWith(suffix));
    let listings = 0;
    for (const u of users) {
      for (const l of await ctx.db
        .query("listings")
        .withIndex("by_seller", (q) => q.eq("sellerId", u._id))
        .collect()) {
        if (l.status === "active") {
          const area = await ctx.db.get(l.areaId);
          if (area) await ctx.db.patch(area._id, { activeCount: Math.max(0, area.activeCount - 1) });
        }
        for (const vid of await ctx.db
          .query("videos")
          .withIndex("by_listing", (q) => q.eq("listingId", l._id))
          .collect()) {
          await deleteMedia(ctx, [vid.mediaId, vid.thumbMediaId].filter((x): x is Id<"media"> => !!x));
          await ctx.db.delete(vid._id);
        }
        for (const t of ["inquiries", "reports"] as const)
          for (const r of await ctx.db
            .query(t)
            .withIndex("by_listing", (q) => q.eq("listingId", l._id))
            .collect())
            await ctx.db.delete(r._id);
        for (const s of await ctx.db
          .query("saves")
          .withIndex("by_listing", (q) => q.eq("listingId", l._id))
          .collect())
          await ctx.db.delete(s._id);
        for (const d of await ctx.db
          .query("dailyStats")
          .withIndex("by_listing_day", (q) => q.eq("listingId", l._id))
          .collect())
          await ctx.db.delete(d._id);
        await deleteMedia(ctx, [...l.imageIds, ...l.documents.map((d) => d.fileId)]);
        await ctx.db.delete(l._id);
        listings++;
      }
      for (const i of await ctx.db
        .query("inquiries")
        .withIndex("by_buyer", (q) => q.eq("buyerId", u._id))
        .collect())
        await ctx.db.delete(i._id);
      for (const n of await ctx.db
        .query("notifications")
        .withIndex("by_user", (q) => q.eq("userId", u._id))
        .collect())
        await ctx.db.delete(n._id);
      for (const s of await ctx.db
        .query("savedSearches")
        .withIndex("by_user", (q) => q.eq("userId", u._id))
        .collect())
        await ctx.db.delete(s._id);
      for (const h of await ctx.db
        .query("watchHistory")
        .withIndex("by_user", (q) => q.eq("userId", u._id))
        .collect())
        await ctx.db.delete(h._id);
      const orphanMedia = (await ctx.db.query("media").collect()).filter((m) => m.ownerId === u._id);
      await deleteMedia(
        ctx,
        orphanMedia.map((m) => m._id),
      );
      for (const s of await ctx.db
        .query("authSessions")
        .withIndex("userId", (q) => q.eq("userId", u._id))
        .collect()) {
        for (const rt of await ctx.db
          .query("authRefreshTokens")
          .withIndex("sessionId", (q) => q.eq("sessionId", s._id))
          .collect())
          await ctx.db.delete(rt._id);
        await ctx.db.delete(s._id);
      }
      for (const a of await ctx.db
        .query("authAccounts")
        .withIndex("userIdAndProvider", (q) => q.eq("userId", u._id))
        .collect()) {
        for (const c of await ctx.db
          .query("authVerificationCodes")
          .withIndex("accountId", (q) => q.eq("accountId", a._id))
          .collect())
          await ctx.db.delete(c._id);
        await ctx.db.delete(a._id);
      }
      await ctx.db.delete(u._id);
    }
    return `Removed ${users.length} test users and ${listings} listings.`;
  },
});
