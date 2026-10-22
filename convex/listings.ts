import { paginationOptsValidator, type OrderedQuery } from "convex/server";
import { ConvexError, v, type Infer } from "convex/values";
import ngeohash from "ngeohash";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type QueryCtx } from "./_generated/server";
import {
  bumpDailyStat,
  getViewer,
  isAdmin,
  listingCard,
  requireListingOwner,
  requireRole,
  requireUser,
  SELLER_ROLES,
  sellerSummary,
  setListingStatus,
  tryRateLimit,
} from "./helpers";
import { claimMedia, deleteMedia, mediaUrl, signedDocumentUrl } from "./media";
import {
  vDocument,
  vFacility,
  vFacing,
  vLandStatus,
  vLandType,
  vListingFilters,
  vSizeUnit,
  vUtility,
} from "./validators";
import { CONFIG, PRICE_BUCKETS, type ListingFilters } from "../lib/constants";
import { DISTRICT_BN } from "../lib/places";
import { slugify } from "../lib/format";
import { toSqft } from "../lib/units";

type LQ = OrderedQuery<DataModel["listings"]>;

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/** Picks the most selective index for the filters + sort, then applies the rest as filters. */
export function buildListingQuery(ctx: QueryCtx, f: ListingFilters & { areaId?: Id<"areas"> }): LQ {
  const db = ctx.db.query("listings");
  let base: LQ;
  const text = f.q?.trim();
  const sort = f.sort ?? "newest";
  const dateDir = sort === "oldest" ? "asc" : "desc";

  if (text) {
    base = db.withSearchIndex("search_text", (s) => {
      let x = s.search("searchText", text).eq("status", "active");
      if (f.landType) x = x.eq("landType", f.landType);
      if (f.areaId) x = x.eq("areaId", f.areaId);
      else if (f.district) x = x.eq("district", f.district);
      else if (f.division) x = x.eq("division", f.division);
      return x;
    });
  } else if (sort === "price_asc" || sort === "price_desc") {
    const dir = sort === "price_asc" ? "asc" : "desc";
    base = f.areaId
      ? db
          .withIndex("by_price_area", (q) => {
            const r = q.eq("status", "active").eq("areaId", f.areaId!);
            if (f.minPrice !== undefined && f.maxPrice !== undefined) return r.gte("price", f.minPrice).lte("price", f.maxPrice);
            if (f.minPrice !== undefined) return r.gte("price", f.minPrice);
            if (f.maxPrice !== undefined) return r.lte("price", f.maxPrice);
            return r;
          })
          .order(dir)
      : db
          .withIndex("by_status_price", (q) => {
            const r = q.eq("status", "active");
            if (f.minPrice !== undefined && f.maxPrice !== undefined) return r.gte("price", f.minPrice).lte("price", f.maxPrice);
            if (f.minPrice !== undefined) return r.gte("price", f.minPrice);
            if (f.maxPrice !== undefined) return r.lte("price", f.maxPrice);
            return r;
          })
          .order(dir);
  } else if (sort === "size_desc") {
    base = db
      .withIndex("by_status_size", (q) => {
        const r = q.eq("status", "active");
        if (f.minSqft !== undefined && f.maxSqft !== undefined) return r.gte("sizeSqft", f.minSqft).lte("sizeSqft", f.maxSqft);
        if (f.minSqft !== undefined) return r.gte("sizeSqft", f.minSqft);
        if (f.maxSqft !== undefined) return r.lte("sizeSqft", f.maxSqft);
        return r;
      })
      .order("desc");
  } else if (sort === "views") {
    base = db.withIndex("by_status_views", (q) => q.eq("status", "active")).order("desc");
  } else if (f.areaId && f.landType) {
    base = db
      .withIndex("by_status_area_type", (q) => q.eq("status", "active").eq("areaId", f.areaId!).eq("landType", f.landType!))
      .order(dateDir);
  } else if (f.areaId) {
    base = db.withIndex("by_status_area_published", (q) => q.eq("status", "active").eq("areaId", f.areaId!)).order(dateDir);
  } else if (f.landType) {
    base = db.withIndex("by_status_type", (q) => q.eq("status", "active").eq("landType", f.landType!)).order(dateDir);
  } else if (f.district) {
    base = db.withIndex("by_status_district", (q) => q.eq("status", "active").eq("district", f.district!)).order(dateDir);
  } else if (f.division) {
    base = db.withIndex("by_status_division", (q) => q.eq("status", "active").eq("division", f.division!)).order(dateDir);
  } else {
    base = db.withIndex("by_status_published", (q) => q.eq("status", "active")).order(dateDir);
  }

  return base.filter((q) => {
    const c = [q.eq(q.field("status"), "active")];
    if (f.landType) c.push(q.eq(q.field("landType"), f.landType));
    if (f.areaId) c.push(q.eq(q.field("areaId"), f.areaId));
    if (f.district) c.push(q.eq(q.field("district"), f.district));
    if (f.division) c.push(q.eq(q.field("division"), f.division));
    if (f.minPrice !== undefined) c.push(q.gte(q.field("price"), f.minPrice));
    if (f.maxPrice !== undefined) c.push(q.lte(q.field("price"), f.maxPrice));
    if (f.minSqft !== undefined) c.push(q.gte(q.field("sizeSqft"), f.minSqft));
    if (f.maxSqft !== undefined) c.push(q.lte(q.field("sizeSqft"), f.maxSqft));
    if (f.facing) c.push(q.eq(q.field("facing"), f.facing));
    if (f.minRoadWidth !== undefined) c.push(q.gte(q.field("roadWidthFt"), f.minRoadWidth));
    if (f.verifiedOnly) c.push(q.eq(q.field("isVerified"), true));
    if (f.hasVideo) c.push(q.eq(q.field("hasVideo"), true));
    if (f.negotiable) c.push(q.eq(q.field("negotiable"), true));
    if (f.sellerType) c.push(q.eq(q.field("sellerType"), f.sellerType));
    if (f.postedWithinDays) c.push(q.gte(q.field("publishedAt"), Date.now() - f.postedWithinDays * 86_400_000));
    return q.and(...c);
  });
}

/** The same filters as buildListingQuery, checked in memory (used by the map, which reads by geohash). */
export function matchesFilters(l: Doc<"listings">, f: ListingFilters & { areaId?: Id<"areas"> }, now = Date.now()) {
  if (l.status !== "active") return false;
  if (f.landType && l.landType !== f.landType) return false;
  if (f.areaId && l.areaId !== f.areaId) return false;
  if (f.district && l.district !== f.district) return false;
  if (f.division && l.division !== f.division) return false;
  if (f.minPrice !== undefined && l.price < f.minPrice) return false;
  if (f.maxPrice !== undefined && l.price > f.maxPrice) return false;
  if (f.minSqft !== undefined && l.sizeSqft < f.minSqft) return false;
  if (f.maxSqft !== undefined && l.sizeSqft > f.maxSqft) return false;
  if (f.facing && l.facing !== f.facing) return false;
  if (f.minRoadWidth !== undefined && (l.roadWidthFt ?? 0) < f.minRoadWidth) return false;
  if (f.verifiedOnly && !l.isVerified) return false;
  if (f.hasVideo && !l.hasVideo) return false;
  if (f.negotiable && !l.negotiable) return false;
  if (f.sellerType && l.sellerType !== f.sellerType) return false;
  if (f.postedWithinDays && (l.publishedAt ?? 0) < now - f.postedWithinDays * 86_400_000) return false;
  const words = f.q?.toLowerCase().split(/\s+/).filter(Boolean) ?? [];
  if (words.length && !words.every((w) => l.searchText.toLowerCase().includes(w))) return false;
  return matchesArrayFilters(l, f);
}

/** Array filters Convex .filter() cannot express; applied to each page. */
export function matchesArrayFilters(l: Doc<"listings">, f: ListingFilters) {
  if (f.utilities?.length && !f.utilities.every((u) => l.utilities.includes(u))) return false;
  if (f.facilities?.length && !f.facilities.every((x) => l.nearbyFacilities.includes(x))) return false;
  return true;
}

// Bangla keywords -> the English words used in titles/searchText.
const BN_WORDS: [string, string][] = [
  ["আবাসিক", "residential"],
  ["বাণিজ্যিক", "commercial"],
  ["কমার্শিয়াল", "commercial"],
  ["শিল্প", "industrial"],
  ["কৃষি", "farmland"],
  ["প্লট", "plot"],
  ["কাঠা", "katha"],
  ["বিঘা", "bigha"],
  ["শতাংশ", "decimal"],
  ["কর্নার", "corner"],
  ["লেক", "lake"],
  ["সেক্টর", "sector"],
  ["রাস্তা", "road"],
  ["জমি", ""],
];
const BN_DIGITS = "০১২৩৪৫৬৭৮৯";

/**
 * The full-text index only holds English text. Rewrite Bangla area/district names,
 * common land words and Bangla digits in the keyword to their English forms.
 */
export async function normalizeFilters<T extends ListingFilters>(ctx: QueryCtx, f: T): Promise<T> {
  let q = f.q?.trim();
  if (!q || !/[\u0980-\u09FF]/.test(q)) return f;
  q = q.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
  const areas = await ctx.db.query("areas").take(1000);
  for (const a of [...areas].sort((x, y) => (y.areaNameBn?.length ?? 0) - (x.areaNameBn?.length ?? 0)))
    if (a.areaNameBn && q.includes(a.areaNameBn)) q = q.split(a.areaNameBn).join(` ${a.areaName} `);
  for (const [en, bn] of Object.entries(DISTRICT_BN)) if (q.includes(bn)) q = q.split(bn).join(` ${en} `);
  for (const [bn, en] of BN_WORDS) if (q.includes(bn)) q = q.split(bn).join(` ${en} `);
  q = q.replace(/\s+/g, " ").trim();
  return { ...f, q: q || undefined };
}

export const search = query({
  args: { filters: vListingFilters, paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const { paginationOpts } = args;
    const filters = await normalizeFilters(ctx, args.filters);
    const result = await buildListingQuery(ctx, filters).paginate(paginationOpts);
    const page = await Promise.all(
      result.page.filter((l) => matchesArrayFilters(l, filters)).map((l) => listingCard(ctx, l)),
    );
    return { ...result, page };
  },
});

const COUNT_CAP = 2000;

/**
 * Total matches for the browse header plus per-option counts for the land type,
 * posted-by and price-bucket filters (each facet ignores its own selection).
 * Scans at most COUNT_CAP listings; `capped` says the numbers are a floor.
 */
export const count = query({
  args: { filters: vListingFilters },
  handler: async (ctx, args) => {
    const f = await normalizeFilters(ctx, args.filters);
    const { landType, sellerType, minPrice, maxPrice, sort: _sort, ...rest } = f;
    const rows = (await buildListingQuery(ctx, { ...rest, sort: "newest" }).take(COUNT_CAP)).filter((l) => matchesArrayFilters(l, f));
    const okType = (l: Doc<"listings">) => !landType || l.landType === landType;
    const okSeller = (l: Doc<"listings">) => !sellerType || l.sellerType === sellerType;
    const okPrice = (l: Doc<"listings">) => (minPrice === undefined || l.price >= minPrice) && (maxPrice === undefined || l.price <= maxPrice);
    const tally = (list: Doc<"listings">[], key: (l: Doc<"listings">) => string | undefined) => {
      const out: Record<string, number> = {};
      for (const l of list) {
        const k = key(l);
        if (k) out[k] = (out[k] ?? 0) + 1;
      }
      return out;
    };
    return {
      total: rows.filter((l) => okType(l) && okSeller(l) && okPrice(l)).length,
      capped: rows.length >= COUNT_CAP,
      landType: tally(rows.filter((l) => okSeller(l) && okPrice(l)), (l) => l.landType),
      sellerType: tally(rows.filter((l) => okType(l) && okPrice(l)), (l) => l.sellerType),
      price: tally(rows.filter((l) => okType(l) && okSeller(l)), (l) =>
        PRICE_BUCKETS.find((b) => (b.min === undefined || l.price >= b.min) && (b.max === undefined || l.price < b.max))?.key,
      ),
    };
  },
});

export const featured = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const rows = await ctx.db
      .query("listings")
      .withIndex("by_status_featured", (q) => q.eq("status", "active").eq("isFeatured", true))
      .order("desc")
      .take(Math.min(limit ?? 10, 24));
    return Promise.all(rows.map((l) => listingCard(ctx, l)));
  },
});

export const newest = query({
  args: { limit: v.optional(v.number()), verifiedOnly: v.optional(v.boolean()) },
  handler: async (ctx, { limit, verifiedOnly }) => {
    let q = ctx.db.query("listings").withIndex("by_status_published", (q) => q.eq("status", "active")).order("desc");
    if (verifiedOnly) q = q.filter((q) => q.eq(q.field("isVerified"), true));
    const rows = await q.take(Math.min(limit ?? 8, 24));
    return Promise.all(rows.map((l) => listingCard(ctx, l)));
  },
});

/** Live numbers for the home stats strip. */
export const stats = query({
  args: {},
  handler: async (ctx) => {
    const areas = await ctx.db.query("areas").collect();
    const active = areas.reduce((s, a) => s + a.activeCount, 0);
    const verified = await ctx.db
      .query("listings")
      .withIndex("by_status_featured", (q) => q.eq("status", "active"))
      .filter((q) => q.eq(q.field("isVerified"), true))
      .take(10000);
    const videos = await ctx.db
      .query("videos")
      .withIndex("by_status", (q) => q.eq("status", "ready"))
      .take(10000);
    return {
      activeListings: active,
      areasCovered: areas.filter((a) => a.activeCount > 0).length,
      verifiedListings: verified.length,
      videos: videos.filter((x) => x.listingActive && x.moderation === "approved").length,
    };
  },
});

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const l = await ctx.db
      .query("listings")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!l) return null;
    const viewer = await getViewer(ctx);
    const isOwner = !!viewer && viewer._id === l.sellerId;
    // Expired ads stay reachable (saved lists and old links point at them) but are shown as
    // no longer available and are noindexed; drafts / in-review / rejected stay private.
    const publicStatuses = ["active", "sold", "expired"];
    if (!publicStatuses.includes(l.status) && !isOwner && !isAdmin(viewer)) return null;

    const [card, images, seller, saved, inquiry, area, sellerListings] = await Promise.all([
      listingCard(ctx, l),
      l.imageIds.map((id) => mediaUrl(id)),
      sellerSummary(ctx, l.sellerId),
      viewer
        ? ctx.db
            .query("saves")
            .withIndex("by_user_listing", (q) => q.eq("userId", viewer._id).eq("listingId", l._id))
            .unique()
        : null,
      viewer
        ? ctx.db
            .query("inquiries")
            .withIndex("by_buyer_listing", (q) => q.eq("buyerId", viewer._id).eq("listingId", l._id))
            .first()
        : null,
      ctx.db.get(l.areaId),
      ctx.db
        .query("listings")
        .withIndex("by_seller", (q) => q.eq("sellerId", l.sellerId))
        .take(200),
    ]);

    return {
      ...card,
      description: l.description,
      images: images.filter((u): u is string => !!u),
      sectorBlock: l.sectorBlock,
      nearbyFacilities: l.nearbyFacilities,
      utilities: l.utilities,
      hasBoundaryWall: l.hasBoundaryWall,
      landStatus: l.landStatus,
      documents: l.documents.map((d) => ({ type: d.type, verified: d.verified })),
      saveCount: l.saveCount,
      inquiryCount: l.inquiryCount,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
      upazila: area?.upazila,
      areaNameBn: area?.areaNameBn,
      areaCenter: area ? { lat: area.centerLat, lng: area.centerLng } : null,
      seller: seller ? { ...seller, activeListings: sellerListings.filter((x) => x.status === "active").length } : null,
      expiresAt: l.status === "active" ? l.expiresAt : undefined,
      promotionRequested: isOwner ? !!l.promotionRequested : undefined,
      viewer: {
        signedIn: !!viewer,
        isOwner,
        isAdmin: isAdmin(viewer),
        saved: !!saved,
        hasInquired: !!inquiry,
      },
      rejectionReason: isOwner || isAdmin(viewer) ? l.rejectionReason : undefined,
    };
  },
});

/**
 * Price context for a listing: median price per sqft of active listings in the same area.
 * Returns null when there are too few comparables to say anything fair.
 */
export const areaInsight = query({
  args: { listingId: v.id("listings") },
  handler: async (ctx, { listingId }) => {
    const l = await ctx.db.get(listingId);
    if (!l) return null;
    const LIMIT = 200;
    const rows = await ctx.db
      .query("listings")
      .withIndex("by_status_area_published", (q) => q.eq("status", "active").eq("areaId", l.areaId))
      .take(LIMIT);
    const vals = rows.map((r) => r.pricePerSqft).filter((n) => n > 0).sort((a, b) => a - b);
    if (vals.length < 3 || l.pricePerSqft <= 0) return null;
    const mid = vals.length >> 1;
    const median = vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
    return {
      count: vals.length,
      capped: rows.length === LIMIT,
      medianPerSqft: median,
      diffPct: Math.round(((l.pricePerSqft - median) / median) * 100),
    };
  },
});

/** Great-circle distance in km. Used to rank nearby land without an external service. */
function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const NEARBY_RADII_KM = [5, 10, 20, 40, 80] as const;

/**
 * Active land within `radiusKm` of a listing, nearest first. Coarse-filters on
 * the geohash index (same trick as the map), then measures each candidate
 * exactly, so no geo service is involved.
 */
export const nearby = query({
  args: {
    listingId: v.id("listings"),
    radiusKm: v.optional(v.number()),
    landType: v.optional(vLandType),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { listingId, radiusKm, landType, limit }) => {
    const origin = await ctx.db.get(listingId);
    if (!origin || origin.lat === undefined || origin.lng === undefined) return [];
    const radius = Math.min(Math.max(radiusKm ?? 20, 1), 200);
    const max = Math.min(limit ?? 12, 24);

    // Bounding box that contains the circle, then geohash prefixes covering it.
    const dLat = radius / 111.32;
    const cos = Math.max(Math.cos((origin.lat * Math.PI) / 180), 0.01);
    const dLng = radius / (111.32 * cos);
    const box = { south: origin.lat - dLat, north: origin.lat + dLat, west: origin.lng - dLng, east: origin.lng + dLng };

    let hashes: string[] = [];
    for (let p = 6; p >= 1; p--) {
      hashes = ngeohash.bboxes(box.south, box.west, box.north, box.east, p);
      if (hashes.length <= 16) break;
    }

    const seen = new Set<string>([origin._id]);
    const found: { listing: Doc<"listings">; distanceKm: number }[] = [];
    for (const h of hashes) {
      const rows = await ctx.db
        .query("listings")
        .withIndex("by_geohash", (q) => q.eq("status", "active").gte("geohash", h).lt("geohash", h + "{"))
        .take(200);
      for (const l of rows) {
        if (seen.has(l._id) || l.lat === undefined || l.lng === undefined) continue;
        if (landType && l.landType !== landType) continue;
        const distanceKm = haversineKm(origin.lat, origin.lng, l.lat, l.lng);
        if (distanceKm > radius) continue;
        seen.add(l._id);
        found.push({ listing: l, distanceKm });
      }
    }

    found.sort((a, b) => a.distanceKm - b.distanceKm);
    return Promise.all(
      found.slice(0, max).map(async ({ listing, distanceKm }) => ({
        ...(await listingCard(ctx, listing)),
        distanceKm: Math.round(distanceKm * 10) / 10,
      })),
    );
  },
});

/** How many active listings sit in each radius band, for the radius picker. */
export const nearbyCounts = query({
  args: { listingId: v.id("listings"), landType: v.optional(vLandType) },
  handler: async (ctx, { listingId, landType }) => {
    const origin = await ctx.db.get(listingId);
    if (!origin || origin.lat === undefined || origin.lng === undefined) return null;
    const widest = NEARBY_RADII_KM[NEARBY_RADII_KM.length - 1];
    const dLat = widest / 111.32;
    const cos = Math.max(Math.cos((origin.lat * Math.PI) / 180), 0.01);
    const dLng = widest / (111.32 * cos);

    let hashes: string[] = [];
    for (let p = 6; p >= 1; p--) {
      hashes = ngeohash.bboxes(origin.lat - dLat, origin.lng - dLng, origin.lat + dLat, origin.lng + dLng, p);
      if (hashes.length <= 16) break;
    }

    const seen = new Set<string>([origin._id]);
    const counts: Record<number, number> = Object.fromEntries(NEARBY_RADII_KM.map((r) => [r, 0]));
    for (const h of hashes) {
      const rows = await ctx.db
        .query("listings")
        .withIndex("by_geohash", (q) => q.eq("status", "active").gte("geohash", h).lt("geohash", h + "{"))
        .take(200);
      for (const l of rows) {
        if (seen.has(l._id) || l.lat === undefined || l.lng === undefined) continue;
        if (landType && l.landType !== landType) continue;
        seen.add(l._id);
        const d = haversineKm(origin.lat, origin.lng, l.lat, l.lng);
        for (const r of NEARBY_RADII_KM) if (d <= r) counts[r]++;
      }
    }
    return counts;
  },
});

export const related = query({
  args: { listingId: v.id("listings"), limit: v.optional(v.number()) },
  handler: async (ctx, { listingId, limit }) => {
    const l = await ctx.db.get(listingId);
    if (!l) return [];
    const max = Math.min(limit ?? 8, 16);
    const seen = new Set<string>([l._id]);
    const out: Doc<"listings">[] = [];
    const add = (rows: Doc<"listings">[]) => {
      for (const r of rows) {
        if (seen.has(r._id) || out.length >= max) continue;
        seen.add(r._id);
        out.push(r);
      }
    };
    // 1) same area, similar price band
    add(
      await ctx.db
        .query("listings")
        .withIndex("by_price_area", (q) =>
          q.eq("status", "active").eq("areaId", l.areaId).gte("price", l.price * 0.6).lte("price", l.price * 1.6),
        )
        .take(max + 1),
    );
    // 2) same area, same type
    if (out.length < max)
      add(
        await ctx.db
          .query("listings")
          .withIndex("by_status_area_type", (q) => q.eq("status", "active").eq("areaId", l.areaId).eq("landType", l.landType))
          .order("desc")
          .take(max + 1),
      );
    // 3) same type anywhere
    if (out.length < max)
      add(
        await ctx.db
          .query("listings")
          .withIndex("by_status_type", (q) => q.eq("status", "active").eq("landType", l.landType))
          .order("desc")
          .take(max + 1),
      );
    return Promise.all(out.map((r) => listingCard(ctx, r)));
  },
});

export const getMany = query({
  args: { ids: v.array(v.id("listings")) },
  handler: async (ctx, { ids }) => {
    const rows = await Promise.all(ids.slice(0, CONFIG.compareMax).map((id) => ctx.db.get(id)));
    return Promise.all(
      rows
        .filter((l): l is Doc<"listings"> => !!l && (l.status === "active" || l.status === "sold"))
        .map(async (l) => ({
          ...(await listingCard(ctx, l)),
          nearbyFacilities: l.nearbyFacilities,
          hasBoundaryWall: l.hasBoundaryWall,
          landStatus: l.landStatus,
          documents: l.documents.map((d) => ({ type: d.type, verified: d.verified })),
        })),
    );
  },
});

/** Map view: geohash prefix ranges covering the bbox, then an exact bbox filter. */
export const inBounds = query({
  args: {
    south: v.number(),
    west: v.number(),
    north: v.number(),
    east: v.number(),
    filters: v.optional(vListingFilters),
  },
  handler: async (ctx, a) => {
    const filters = a.filters ? await normalizeFilters(ctx, a.filters) : {};
    const now = Date.now();
    let hashes: string[] = [];
    for (let p = 6; p >= 1; p--) {
      hashes = ngeohash.bboxes(a.south, a.west, a.north, a.east, p);
      if (hashes.length <= 16) break;
    }
    const pins = [];
    for (const h of hashes) {
      const rows = await ctx.db
        .query("listings")
        .withIndex("by_geohash", (q) => q.eq("status", "active").gte("geohash", h).lt("geohash", h + "{"))
        .take(150);
      for (const l of rows) {
        if (l.lat === undefined || l.lng === undefined) continue;
        if (l.lat < a.south || l.lat > a.north || l.lng < a.west || l.lng > a.east) continue;
        if (!matchesFilters(l, filters, now)) continue;
        pins.push({
          _id: l._id,
          slug: l.slug,
          areaSlug: l.areaSlug,
          landType: l.landType,
          title: l.title,
          price: l.price,
          sizeValue: l.sizeValue,
          sizeUnit: l.sizeUnit,
          lat: Math.round(l.lat * 200) / 200,
          lng: Math.round(l.lng * 200) / 200,
        });
        if (pins.length >= 300) return pins;
      }
    }
    return pins;
  },
});

// ---------------------------------------------------------------------------
// Seller: create / edit / lifecycle
// ---------------------------------------------------------------------------

const listingInput = {
  title: v.string(),
  description: v.string(),
  landType: vLandType,
  sizeValue: v.number(),
  sizeUnit: vSizeUnit,
  price: v.number(),
  negotiable: v.boolean(),
  areaId: v.id("areas"),
  exactAddress: v.optional(v.string()),
  lat: v.optional(v.number()),
  lng: v.optional(v.number()),
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
};

function bad(message: string): never {
  throw new ConvexError({ code: "INVALID", message });
}

function validateInput(d: Infer<typeof vListingInput>) {
  const title = String(d.title).trim();
  if (title.length < 8 || title.length > 120) bad("Title must be 8–120 characters.");
  if (String(d.description).trim().length > 5000) bad("Description is too long (max 5000).");
  if (!(d.sizeValue > 0) || d.sizeValue > 1e7) bad("Enter a valid land size.");
  if (!(d.price > 0) || d.price > 1e11) bad("Enter a valid price.");
  if (d.roadWidthFt !== undefined && (d.roadWidthFt < 0 || d.roadWidthFt > 500)) bad("Road width looks wrong.");
  if (d.lat !== undefined && (d.lat < 20.3 || d.lat > 26.8)) bad("Location must be inside Bangladesh.");
  if (d.lng !== undefined && (d.lng < 87.9 || d.lng > 92.8)) bad("Location must be inside Bangladesh.");
  if ((d.lat === undefined) !== (d.lng === undefined)) bad("Provide both latitude and longitude.");
  if (d.imageIds.length > CONFIG.maxImages) bad(`At most ${CONFIG.maxImages} photos.`);
  if (d.documents.length > 12) bad("Too many documents.");
  if (d.coverImageId && !d.imageIds.includes(d.coverImageId)) bad("Cover photo must be one of the photos.");
}

const vListingInput = v.object(listingInput);

/** Live listings can be renewed (extended) in their last week. */
const RENEW_WINDOW_MS = 7 * 86400_000;
/** "Expires soon" reminder goes out this long before expiry. */
const EXPIRY_WARN_MS = 3 * 86400_000;
function canRenewActive(l: Doc<"listings">, now = Date.now()) {
  return l.status === "active" && l.expiresAt !== undefined && l.expiresAt - now <= RENEW_WINDOW_MS;
}

export const upsert = mutation({
  args: { id: v.optional(v.id("listings")), data: v.object(listingInput) },
  handler: async (ctx, { id, data }) => {
    const user = await requireRole(ctx, SELLER_ROLES);
    validateInput(data);
    const area = await ctx.db.get(data.areaId);
    if (!area) bad("Unknown area.");

    let existing: Doc<"listings"> | null = null;
    if (id) {
      existing = (await requireListingOwner(ctx, id)).listing;
      if (existing.status === "sold" || existing.status === "expired") bad("Sold or expired listings cannot be edited.");
    }

    // Every file must already belong to this listing or be a fresh upload by this user.
    const known = new Set<string>([...(existing?.imageIds ?? []), ...(existing?.documents.map((d) => d.fileId) ?? [])]);
    const fileIds = [...data.imageIds, ...data.documents.map((d) => d.fileId)];
    if (new Set(fileIds).size !== fileIds.length) bad("Duplicate file in listing.");
    await claimMedia(ctx, fileIds, user._id, known);
    // Document "verified" flags can only be set by admins.
    const prevDocs = new Map(existing?.documents.map((d) => [d.fileId, d.verified]) ?? []);
    const documents = data.documents.map((d) => ({ ...d, verified: isAdmin(user) ? d.verified : (prevDocs.get(d.fileId) ?? false) }));

    const sizeSqft = toSqft(data.sizeValue, data.sizeUnit);
    const now = Date.now();
    const fields = {
      ...data,
      title: data.title.trim(),
      description: data.description.trim(),
      documents,
      sizeSqft,
      pricePerSqft: Math.round((data.price / sizeSqft) * 100) / 100,
      currency: "BDT" as const,
      division: area.division,
      district: area.district,
      areaName: area.areaName,
      areaSlug: area.slug,
      geohash: data.lat !== undefined && data.lng !== undefined ? ngeohash.encode(data.lat, data.lng, 7) : area.geohash,
      lat: data.lat ?? area.centerLat,
      lng: data.lng ?? area.centerLng,
      searchText: `${data.title} ${area.areaName} ${area.district} ${data.sectorBlock ?? ""} ${data.description}`.slice(0, 8000),
      coverImageId: data.coverImageId ?? data.imageIds[0],
      updatedAt: now,
    };

    if (existing) {
      // Removed files are deleted from storage.
      const keep = new Set<string>(fileIds);
      await deleteMedia(
        ctx,
        [...known].filter((old) => !keep.has(old)) as Id<"media">[],
      );
      // An area change on an active listing moves the active count.
      if (existing.status === "active" && existing.areaId !== data.areaId) {
        const oldArea = await ctx.db.get(existing.areaId);
        if (oldArea) await ctx.db.patch(oldArea._id, { activeCount: Math.max(0, oldArea.activeCount - 1) });
        await ctx.db.patch(area._id, { activeCount: area.activeCount + 1 });
        const vids = await ctx.db
          .query("videos")
          .withIndex("by_listing", (q) => q.eq("listingId", existing._id))
          .collect();
        for (const vid of vids) await ctx.db.patch(vid._id, { areaId: area._id, landType: data.landType, price: data.price });
      } else if (existing.landType !== data.landType || existing.price !== data.price) {
        const vids = await ctx.db
          .query("videos")
          .withIndex("by_listing", (q) => q.eq("listingId", existing._id))
          .collect();
        for (const vid of vids) await ctx.db.patch(vid._id, { areaId: area._id, landType: data.landType, price: data.price });
      }
      await ctx.db.patch(existing._id, {
        ...fields,
        status: existing.status === "rejected" ? "draft" : existing.status,
      });
      // A live listing whose public content changes goes back to moderation, so an
      // approved ad can't be swapped for something else. Price/details edits stay live.
      if (existing.status === "active" && !isAdmin(user) && needsReReview(existing, fields)) {
        await setListingStatus(ctx, { ...existing, areaId: data.areaId }, "pending_review");
        return { id: existing._id, slug: existing.slug, reReview: true };
      }
      return { id: existing._id, slug: existing.slug, reReview: false };
    }

    const slug = `${slugify(data.title) || "land"}-${Math.random().toString(36).slice(2, 7)}`;
    const newId = await ctx.db.insert("listings", {
      ...fields,
      slug,
      sellerId: user._id,
      sellerType: user.accountType ?? "owner",
      status: "draft",
      isVerified: false,
      isFeatured: false,
      hasVideo: false,
      viewCount: 0,
      saveCount: 0,
      inquiryCount: 0,
      createdAt: now,
    });
    return { id: newId, slug, reReview: false };
  },
});

/** True when an edit changes what moderators approved: text, location, type, or adds new files. */
function needsReReview(
  before: Doc<"listings">,
  after: Pick<Doc<"listings">, "title" | "description" | "areaId" | "landType" | "imageIds" | "documents">,
) {
  if (before.title.trim() !== after.title.trim()) return true;
  if (before.description.trim() !== after.description.trim()) return true;
  if (before.areaId !== after.areaId || before.landType !== after.landType) return true;
  const oldFiles = new Set<string>([...before.imageIds, ...before.documents.map((d) => d.fileId)]);
  return [...after.imageIds, ...after.documents.map((d) => d.fileId)].some((id) => !oldFiles.has(id));
}

export const submitForReview = mutation({
  args: { id: v.id("listings") },
  handler: async (ctx, { id }) => {
    const { listing } = await requireListingOwner(ctx, id);
    if (listing.status !== "draft" && listing.status !== "rejected") bad("Only drafts can be submitted.");
    if (listing.imageIds.length < 1) bad("Add at least one photo.");
    if (listing.description.length < 30) bad("Description should be at least 30 characters.");
    await setListingStatus(ctx, listing, "pending_review", { rejectionReason: undefined });
    return null;
  },
});

export const markSold = mutation({
  args: { id: v.id("listings") },
  handler: async (ctx, { id }) => {
    const { listing } = await requireListingOwner(ctx, id);
    if (listing.status !== "active") bad("Only active listings can be marked sold.");
    await setListingStatus(ctx, listing, "sold");
    return null;
  },
});

export const renew = mutation({
  args: { id: v.id("listings") },
  handler: async (ctx, { id }) => {
    const { listing } = await requireListingOwner(ctx, id);
    // A live listing close to expiry is extended in place (no re-review needed).
    if (canRenewActive(listing)) {
      await ctx.db.patch(id, { expiresAt: Date.now() + CONFIG.listingValidityDays * 86400_000, expiryWarnedAt: undefined });
      return { extended: true };
    }
    if (listing.status !== "expired") bad("Only expired listings, or live ones about to expire, can be renewed.");
    await setListingStatus(ctx, listing, "pending_review");
    return { extended: false };
  },
});

export const requestPromotion = mutation({
  args: { id: v.id("listings") },
  handler: async (ctx, { id }) => {
    const { listing } = await requireListingOwner(ctx, id);
    if (listing.status !== "active") bad("Only active listings can be promoted.");
    await ctx.db.patch(id, { promotionRequested: true });
    return null;
  },
});

export const removeDraft = mutation({
  args: { id: v.id("listings") },
  handler: async (ctx, { id }) => {
    const { listing } = await requireListingOwner(ctx, id);
    if (!["draft", "rejected"].includes(listing.status)) bad("Only drafts can be deleted.");
    await deleteMedia(ctx, [...listing.imageIds, ...listing.documents.map((d) => d.fileId)]);
    const videos = await ctx.db
      .query("videos")
      .withIndex("by_listing", (q) => q.eq("listingId", id))
      .collect();
    for (const vid of videos) {
      await deleteMedia(ctx, [vid.mediaId, vid.thumbMediaId].filter((x): x is Id<"media"> => !!x));
      await ctx.db.delete(vid._id);
    }
    await ctx.db.delete(id);
    return null;
  },
});

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("listings")
      .withIndex("by_seller", (q) => q.eq("sellerId", user._id))
      .order("desc")
      .take(500);
    return Promise.all(
      rows.map(async (l) => ({
        ...(await listingCard(ctx, l)),
        inquiryCount: l.inquiryCount,
        saveCount: l.saveCount,
        rejectionReason: l.rejectionReason,
        promotionRequested: l.promotionRequested ?? false,
        updatedAt: l.updatedAt,
        expiresAt: l.expiresAt,
        canRenew: l.status === "expired" || canRenewActive(l),
      })),
    );
  },
});

/** Full listing for the edit wizard (owner/admin only). */
export const getForEdit = query({
  args: { id: v.id("listings") },
  handler: async (ctx, { id }) => {
    const { listing } = await requireListingOwner(ctx, id);
    const images = listing.imageIds.map((mediaId) => ({ mediaId, url: mediaUrl(mediaId)! }));
    const docs = await Promise.all(listing.documents.map(async (d) => ({ ...d, url: await signedDocumentUrl(d.fileId) })));
    return { ...listing, images, documentFiles: docs };
  },
});

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export const recordView = mutation({
  args: { listingId: v.id("listings"), sessionId: v.string() },
  handler: async (ctx, { listingId, sessionId }) => {
    if (sessionId.length < 8 || sessionId.length > 64) return null;
    const viewer = await getViewer(ctx);
    const who = viewer?._id ?? `anon:${sessionId}`;
    // One counted view per viewer per listing per window, and a global cap per viewer.
    if (!(await tryRateLimit(ctx, `views:${who}`, 300, 3600_000))) return null;
    if (!(await tryRateLimit(ctx, `view:${listingId}:${who}`, 1, CONFIG.viewDedupeHours * 3600_000))) return null;
    const l = await ctx.db.get(listingId);
    if (!l || l.status !== "active" || l.sellerId === viewer?._id) return null;
    await ctx.db.patch(listingId, { viewCount: l.viewCount + 1 });
    await bumpDailyStat(ctx, l, "views");
    return null;
  },
});

// ---------------------------------------------------------------------------
// Internal (crons)
// ---------------------------------------------------------------------------

export const expireOld = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    // gt(0) skips rows without expiresAt (undefined sorts before every number).
    const due = await ctx.db
      .query("listings")
      .withIndex("by_status_expires", (q) => q.eq("status", "active").gt("expiresAt", 0).lt("expiresAt", now))
      .take(200);
    // Remind sellers a few days ahead so they can renew without going offline.
    const soon = await ctx.db
      .query("listings")
      .withIndex("by_status_expires", (q) => q.eq("status", "active").gte("expiresAt", now).lt("expiresAt", now + EXPIRY_WARN_MS))
      .take(500);
    for (const l of soon) {
      if (l.expiryWarnedAt !== undefined) continue;
      await ctx.db.patch(l._id, { expiryWarnedAt: now });
      await ctx.db.insert("notifications", {
        userId: l.sellerId,
        kind: "listing_expired",
        title: "Listing expires soon",
        body: `"${l.title}" expires in a few days. Renew it from your dashboard to keep it live.`,
        href: "/dashboard/listings",
        read: false,
        createdAt: now,
      });
    }
    for (const l of due) {
      await setListingStatus(ctx, l, "expired");
      await ctx.db.insert("notifications", {
        userId: l.sellerId,
        kind: "listing_expired",
        title: "Listing expired",
        body: `"${l.title}" has expired. Renew it from your dashboard.`,
        href: "/dashboard/listings",
        read: false,
        createdAt: now,
      });
    }
    return due.length;
  },
});

/** For sitemap.xml: active listings only, minimal fields. */
export const sitemapEntries = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("listings")
      .withIndex("by_status_published", (q) => q.eq("status", "active"))
      .order("desc")
      .take(5000);
    return rows.map((l) => ({ slug: l.slug, areaSlug: l.areaSlug, landType: l.landType, updatedAt: l.updatedAt }));
  },
});
