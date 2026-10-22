import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { ListingStatus, Role } from "../lib/constants";
import { maskPhone } from "../lib/format";
import { mediaUrl } from "./media";

type Ctx = QueryCtx | MutationCtx;

// ---------- auth / roles ----------

export async function getViewer(ctx: Ctx): Promise<Doc<"users"> | null> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;
  const user = await ctx.db.get(userId);
  if (!user || user.banned) return null;
  return user;
}

export async function requireUser(ctx: Ctx): Promise<Doc<"users">> {
  const user = await getViewer(ctx);
  if (!user) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Please sign in first." });
  return user;
}

export async function requireRole(ctx: Ctx, roles: Role[]): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (!roles.includes(user.role ?? "buyer")) {
    throw new ConvexError({ code: "FORBIDDEN", message: "You do not have permission to do this." });
  }
  return user;
}

export const SELLER_ROLES: Role[] = ["seller", "broker", "admin"];

export function isAdmin(user: Doc<"users"> | null) {
  return user?.role === "admin";
}

/** Owner of the listing, or an admin. */
export async function requireListingOwner(ctx: Ctx, listingId: Id<"listings">) {
  const user = await requireUser(ctx);
  const listing = await ctx.db.get(listingId);
  if (!listing) throw new ConvexError({ code: "NOT_FOUND", message: "Listing not found." });
  if (listing.sellerId !== user._id && !isAdmin(user)) {
    throw new ConvexError({ code: "FORBIDDEN", message: "This is not your listing." });
  }
  return { user, listing };
}

// ---------- rate limiting (fixed window) ----------

export async function rateLimit(ctx: MutationCtx, key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const row = await ctx.db
    .query("rateLimits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (!row || now - row.windowStart >= windowMs) {
    if (row) await ctx.db.patch(row._id, { windowStart: now, count: 1 });
    else await ctx.db.insert("rateLimits", { key, windowStart: now, count: 1 });
    return;
  }
  if (row.count >= limit) {
    const retryMin = Math.ceil((row.windowStart + windowMs - now) / 60000);
    throw new ConvexError({ code: "RATE_LIMITED", message: `Too many requests. Try again in ${retryMin} min.` });
  }
  await ctx.db.patch(row._id, { count: row.count + 1 });
}

/** Returns false (instead of throwing) when the window is exhausted. */
export async function tryRateLimit(ctx: MutationCtx, key: string, limit: number, windowMs: number) {
  try {
    await rateLimit(ctx, key, limit, windowMs);
    return true;
  } catch {
    return false;
  }
}

// ---------- time ----------

/** YYYY-MM-DD in Asia/Dhaka (UTC+6, no DST). */
export function dhakaDay(ts = Date.now()) {
  return new Date(ts + 6 * 3600 * 1000).toISOString().slice(0, 10);
}

export async function bumpDailyStat(
  ctx: MutationCtx,
  listing: Pick<Doc<"listings">, "_id" | "sellerId">,
  field: "views" | "inquiries" | "videoWatchSec",
  by = 1,
) {
  const day = dhakaDay();
  const row = await ctx.db
    .query("dailyStats")
    .withIndex("by_listing_day", (q) => q.eq("listingId", listing._id).eq("day", day))
    .unique();
  if (row) await ctx.db.patch(row._id, { [field]: row[field] + by });
  else
    await ctx.db.insert("dailyStats", {
      listingId: listing._id,
      sellerId: listing.sellerId,
      day,
      views: 0,
      inquiries: 0,
      videoWatchSec: 0,
      [field]: by,
    });
}

// ---------- listing status transitions ----------

/**
 * Single place that changes listing status. Keeps area activeCount and the
 * denormalized `listingActive` flag on videos in sync.
 */
export async function setListingStatus(
  ctx: MutationCtx,
  listing: Doc<"listings">,
  status: ListingStatus,
  extra: Partial<Doc<"listings">> = {},
) {
  const wasActive = listing.status === "active";
  const isActive = status === "active";
  await ctx.db.patch(listing._id, { ...extra, status, updatedAt: Date.now() });
  if (wasActive !== isActive) {
    const area = await ctx.db.get(listing.areaId);
    if (area) await ctx.db.patch(area._id, { activeCount: Math.max(0, area.activeCount + (isActive ? 1 : -1)) });
    const videos = await ctx.db
      .query("videos")
      .withIndex("by_listing", (q) => q.eq("listingId", listing._id))
      .collect();
    for (const vid of videos) await ctx.db.patch(vid._id, { listingActive: isActive });
  }
}

// ---------- public projections (never leak PII) ----------

/** ~550 m grid so the public pin is approximate. */
export function approxCoord(n?: number) {
  return n === undefined ? undefined : Math.round(n * 200) / 200;
}

export async function listingCard(ctx: Ctx, l: Doc<"listings">) {
  const area = await ctx.db.get(l.areaId); // cached per transaction; gives the Bangla area name
  return {
    _id: l._id,
    slug: l.slug,
    title: l.title,
    landType: l.landType,
    sizeValue: l.sizeValue,
    sizeUnit: l.sizeUnit,
    sizeSqft: l.sizeSqft,
    price: l.price,
    pricePerSqft: l.pricePerSqft,
    negotiable: l.negotiable,
    areaId: l.areaId,
    areaName: l.areaName,
    areaNameBn: area?.areaNameBn,
    areaSlug: l.areaSlug,
    district: l.district,
    division: l.division,
    facing: l.facing,
    roadWidthFt: l.roadWidthFt,
    coverUrl: mediaUrl(l.coverImageId ?? l.imageIds[0]),
    imageCount: l.imageIds.length,
    sellerType: l.sellerType,
    isVerified: l.isVerified,
    isFeatured: l.isFeatured,
    hasVideo: l.hasVideo,
    status: l.status,
    publishedAt: l.publishedAt ?? l.createdAt,
    viewCount: l.viewCount,
    utilities: l.utilities,
    approxLat: approxCoord(l.lat),
    approxLng: approxCoord(l.lng),
  };
}
export type ListingCard = Awaited<ReturnType<typeof listingCard>>;

export async function sellerSummary(ctx: Ctx, sellerId: Id<"users">) {
  const seller = await ctx.db.get(sellerId);
  if (!seller) return null;
  const recent = await ctx.db
    .query("inquiries")
    .withIndex("by_seller", (q) => q.eq("sellerId", sellerId))
    .order("desc")
    .take(100);
  const answered = recent.filter((i) => i.status !== "new").length;
  return {
    _id: seller._id,
    name: seller.name ?? "Seller",
    companyName: seller.companyName,
    image: seller.image,
    accountType: seller.accountType ?? "owner",
    verificationStatus: seller.verificationStatus ?? "unverified",
    maskedPhone: maskPhone(seller.phone),
    memberSince: seller.createdAt ?? seller._creationTime,
    responseRate: recent.length ? Math.round((answered / recent.length) * 100) : null,
  };
}
