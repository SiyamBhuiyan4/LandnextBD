import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { bumpDailyStat, listingCard, rateLimit, requireUser } from "./helpers";
import { CONFIG } from "../lib/constants";
import { normalizeBdPhone } from "../lib/phone";

export const create = mutation({
  args: { listingId: v.id("listings"), message: v.string(), contactPhone: v.string() },
  handler: async (ctx, { listingId, message, contactPhone }) => {
    const user = await requireUser(ctx);
    const listing = await ctx.db.get(listingId);
    if (!listing || listing.status !== "active") throw new ConvexError({ code: "NOT_FOUND", message: "This listing is not available." });
    if (listing.sellerId === user._id) throw new ConvexError({ code: "INVALID", message: "You cannot inquire on your own listing." });
    const phone = normalizeBdPhone(contactPhone);
    if (!phone) throw new ConvexError({ code: "INVALID", message: "Enter a valid Bangladeshi mobile number." });
    const text = message.trim();
    if (text.length < 5 || text.length > 1000) throw new ConvexError({ code: "INVALID", message: "Message must be 5–1000 characters." });

    await rateLimit(ctx, `inquiry:${user._id}`, CONFIG.inquiryLimitPerHour, 3600_000);
    await rateLimit(ctx, `inquiry:${user._id}:${listingId}`, 3, 24 * 3600_000);

    const id = await ctx.db.insert("inquiries", {
      listingId,
      sellerId: listing.sellerId,
      buyerId: user._id,
      message: text,
      contactPhone: phone,
      status: "new",
      createdAt: Date.now(),
    });
    await ctx.db.patch(listingId, { inquiryCount: listing.inquiryCount + 1 });
    await bumpDailyStat(ctx, listing, "inquiries");
    await ctx.db.insert("notifications", {
      userId: listing.sellerId,
      kind: "inquiry",
      title: "New inquiry",
      body: `${user.name ?? "A buyer"} asked about "${listing.title}"`,
      href: "/dashboard/inquiries",
      read: false,
      createdAt: Date.now(),
    });
    const seller = await ctx.db.get(listing.sellerId);
    if (seller?.email)
      await ctx.scheduler.runAfter(0, internal.notify.sendEmail, {
        to: seller.email,
        subject: `New inquiry: ${listing.title}`,
        text: `${user.name ?? "A buyer"} sent an inquiry:\n\n"${text}"\n\nOpen your inbox: ${process.env.SITE_URL ?? ""}/dashboard/inquiries`,
      });
    return id;
  },
});

/**
 * Reveals the seller's full phone and the exact location. Only for a signed-in
 * user who has already sent an inquiry on this listing (or the owner/admin).
 */
export const revealContact = query({
  args: { listingId: v.id("listings") },
  handler: async (ctx, { listingId }) => {
    const user = await requireUser(ctx);
    const listing = await ctx.db.get(listingId);
    if (!listing) return null;
    const isOwner = listing.sellerId === user._id || user.role === "admin";
    if (!isOwner) {
      const inquiry = await ctx.db
        .query("inquiries")
        .withIndex("by_buyer_listing", (q) => q.eq("buyerId", user._id).eq("listingId", listingId))
        .first();
      if (!inquiry) return null;
    }
    const seller = await ctx.db.get(listing.sellerId);
    return {
      phone: seller?.phone ?? null,
      email: seller?.email ?? null,
      exactAddress: listing.exactAddress ?? null,
      plotNumber: listing.plotNumber ?? null,
      lat: listing.lat ?? null,
      lng: listing.lng ?? null,
    };
  },
});

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const rows = await ctx.db
      .query("inquiries")
      .withIndex("by_buyer", (q) => q.eq("buyerId", user._id))
      .order("desc")
      .take(200);
    return Promise.all(
      rows.map(async (i) => {
        const l = await ctx.db.get(i.listingId);
        // Same rule as revealContact: a buyer who inquired may see the seller's number.
        const seller = l ? await ctx.db.get(l.sellerId) : null;
        return {
          _id: i._id,
          message: i.message,
          status: i.status,
          createdAt: i.createdAt,
          repliedAt: i.repliedAt,
          listing: l ? await listingCard(ctx, l) : null,
          sellerName: seller ? (seller.companyName ?? seller.name ?? null) : null,
          sellerPhone: seller?.phone ?? null,
        };
      }),
    );
  },
});

export const inbox = query({
  args: { status: v.optional(v.union(v.literal("new"), v.literal("replied"), v.literal("closed"))) },
  handler: async (ctx, { status }) => {
    const user = await requireUser(ctx);
    let q = ctx.db
      .query("inquiries")
      .withIndex("by_seller", (q) => q.eq("sellerId", user._id))
      .order("desc");
    if (status) q = q.filter((f) => f.eq(f.field("status"), status));
    const rows = await q.take(300);
    return Promise.all(
      rows.map(async (i) => {
        const [l, buyer] = await Promise.all([ctx.db.get(i.listingId), ctx.db.get(i.buyerId)]);
        return {
          ...i,
          buyerName: buyer?.name ?? "Buyer",
          buyerEmail: buyer?.email,
          listingTitle: l?.title ?? "(deleted listing)",
          listingSlug: l?.slug,
          listingAreaSlug: l?.areaSlug,
          listingLandType: l?.landType,
        };
      }),
    );
  },
});

export const setStatus = mutation({
  args: {
    id: v.id("inquiries"),
    status: v.union(v.literal("new"), v.literal("replied"), v.literal("closed")),
    sellerNote: v.optional(v.string()),
  },
  handler: async (ctx, { id, status, sellerNote }) => {
    const user = await requireUser(ctx);
    const inquiry = await ctx.db.get(id);
    if (!inquiry || inquiry.sellerId !== user._id) throw new ConvexError({ code: "FORBIDDEN", message: "Not your inquiry." });
    await ctx.db.patch(id, {
      status,
      sellerNote: sellerNote?.slice(0, 1000),
      repliedAt: status === "replied" && !inquiry.repliedAt ? Date.now() : inquiry.repliedAt,
    });
    return null;
  },
});
