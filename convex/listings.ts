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
import { CONFIG, type ListingFilters } from "../lib/constants";
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
      .order("desc");
  } else if (f.areaId) {
    base = db.withIndex("by_status_area_published", (q) => q.eq("status", "active").eq("areaId", f.areaId!)).order("desc");
  } else if (f.landType) {
    base = db.withIndex("by_status_type", (q) => q.eq("status", "active").eq("landType", f.landType!)).order("desc");
  } else if (f.district) {
    base = db.withIndex("by_status_district", (q) => q.eq("status", "active").eq("district", f.district!)).order("desc");
  } else if (f.division) {
    base = db.withIndex("by_status_division", (q) => q.eq("status", "active").eq("division", f.division!)).order("desc");
  } else {
    base = db.withIndex("by_status_published", (q) => q.eq("status", "active")).order("desc");
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
    return q.and(...c);
  });
}

/** Array filters Convex .filter() cannot express; applied to each page. */
export function matchesArrayFilters(l: Doc<"listings">, f: ListingFilters) {
  if (f.utilities?.length && !f.utilities.every((u) => l.utilities.includes(u))) return false;
  if (f.facilities?.length && !f.facilities.every((x) => l.nearbyFacilities.includes(x))) return false;
  return true;
}

export const search = query({
  args: { filters: vListingFilters, paginationOpts: paginationOptsValidator },
  handler: async (ctx, { filters, paginationOpts }) => {
    const result = await buildListingQuery(ctx, filters).paginate(paginationOpts);
    const page = await Promise.all(
      result.page.filter((l) => matchesArrayFilters(l, filters)).map((l) => listingCard(ctx, l)),
    );
    return { ...result, page };
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
    const publicStatuses = ["active", "sold"];
    if (!publicStatuses.includes(l.status) && !isOwner && !isAdmin(viewer)) return null;

    const [card, images, seller, saved, inquiry, area] = await Promise.all([
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
      seller,
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
    landType: v.optional(vLandType),
    minPrice: v.optional(v.number()),
    maxPrice: v.optional(v.number()),
  },
  handler: async (ctx, a) => {
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
        if (a.landType && l.landType !== a.landType) continue;
        if (a.minPrice !== undefined && l.price < a.minPrice) continue;
        if (a.maxPrice !== undefined && l.price > a.maxPrice) continue;
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
      return { id: existing._id, slug: existing.slug };
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
    return { id: newId, slug };
  },
});

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
    if (listing.status !== "expired") bad("Only expired listings can be renewed.");
    await setListingStatus(ctx, listing, "pending_review");
    return null;
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
    const due = await ctx.db
      .query("listings")
      .withIndex("by_status_expires", (q) => q.eq("status", "active").lt("expiresAt", now))
      .take(200);
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
