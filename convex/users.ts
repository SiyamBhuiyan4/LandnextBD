import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import { getViewer, listingCard, requireUser, sellerSummary, setListingStatus } from "./helpers";
import { deleteMedia } from "./media";
import { vAccountType, vRole } from "./validators";
import { normalizeBdPhone } from "../lib/phone";

/** The signed-in user's own profile (full data — it is theirs). */
export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const user = await getViewer(ctx);
    if (!user) return null;
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", user._id).eq("read", false))
      .take(100);
    return {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      // A verified number is the sign-in identity and can't be edited here.
      phoneVerified: user.phoneVerificationTime !== undefined,
      image: user.image,
      role: user.role ?? "buyer",
      accountType: user.accountType ?? "owner",
      verificationStatus: user.verificationStatus ?? "unverified",
      companyName: user.companyName,
      bio: user.bio,
      nidNumber: user.nidNumber,
      createdAt: user.createdAt ?? user._creationTime,
      unreadNotifications: unread.length,
    };
  },
});

export const updateProfile = mutation({
  args: {
    name: v.string(),
    accountType: vAccountType,
    companyName: v.optional(v.string()),
    bio: v.optional(v.string()),
    /** Contact number shown to buyers after they inquire. Omit to keep, "" to clear. */
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const name = args.name.trim();
    if (name.length < 2 || name.length > 60) throw new ConvexError({ code: "INVALID", message: "Name must be 2–60 characters." });
    if ((args.bio ?? "").length > 500) throw new ConvexError({ code: "INVALID", message: "Bio is too long." });
    if ((args.companyName ?? "").trim().length > 80) throw new ConvexError({ code: "INVALID", message: "Company name is too long." });
    let phone = user.phone;
    if (args.phone !== undefined && user.phoneVerificationTime === undefined) {
      const raw = args.phone.trim();
      if (!raw) phone = undefined;
      else {
        phone = normalizeBdPhone(raw) ?? undefined;
        if (!phone) throw new ConvexError({ code: "INVALID", message: "Enter a valid Bangladeshi mobile number." });
      }
    }
    // Sellers who switch to broker/company keep a matching role.
    let role = user.role ?? "buyer";
    if (role === "seller" && args.accountType !== "owner") role = "broker";
    if (role === "broker" && args.accountType === "owner") role = "seller";
    await ctx.db.patch(user._id, {
      name,
      accountType: args.accountType,
      companyName: args.companyName?.trim() || undefined,
      bio: args.bio?.trim() || undefined,
      phone,
      role,
    });
    // Listing cards show the seller type; keep the denormalized copy in sync.
    if ((user.accountType ?? "owner") !== args.accountType) {
      const mine = await ctx.db
        .query("listings")
        .withIndex("by_seller", (q) => q.eq("sellerId", user._id))
        .take(500);
      for (const l of mine) if (l.sellerType !== args.accountType) await ctx.db.patch(l._id, { sellerType: args.accountType });
    }
    return null;
  },
});

/** Buyers can start selling. Admin is never self-assignable. */
export const becomeSeller = mutation({
  args: { accountType: vAccountType },
  handler: async (ctx, { accountType }) => {
    const user = await requireUser(ctx);
    if (user.role === "admin") return null;
    await ctx.db.patch(user._id, { role: accountType === "owner" ? "seller" : "broker", accountType });
    return null;
  },
});

export const requestVerification = mutation({
  args: { nidNumber: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (user.verificationStatus === "verified") return null;
    if (!user.phone && !user.email) throw new ConvexError({ code: "INVALID", message: "Add a phone or email first." });
    const nid = args.nidNumber?.trim();
    if (nid && !/^\d{10,17}$/.test(nid)) {
      throw new ConvexError({ code: "INVALID", message: "Enter a valid 10, 13, or 17 digit Bangladeshi NID number." });
    }
    await ctx.db.patch(user._id, {
      verificationStatus: "pending",
      ...(nid ? { nidNumber: nid } : {}),
    });
    return null;
  },
});

export const publicProfile = query({
  args: { id: v.id("users") },
  handler: async (ctx, { id }) => {
    const summary = await sellerSummary(ctx, id);
    if (!summary) return null;
    const user = await ctx.db.get(id);
    const listings = await ctx.db
      .query("listings")
      .withIndex("by_seller", (q) => q.eq("sellerId", id))
      .order("desc")
      .filter((q) => q.or(q.eq(q.field("status"), "active"), q.eq(q.field("status"), "sold")))
      .take(60);
    return {
      ...summary,
      bio: user?.bio,
      listings: await Promise.all(listings.map((l) => listingCard(ctx, l))),
    };
  },
});

export const verifiedSellers = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const users = await ctx.db
      .query("users")
      .withIndex("by_verification", (q) => q.eq("verificationStatus", "verified"))
      .take(Math.min(limit ?? 8, 24));
    const out = [];
    for (const u of users) {
      if (u.role === "buyer" || u.banned) continue;
      const s = await sellerSummary(ctx, u._id);
      const active = await ctx.db
        .query("listings")
        .withIndex("by_seller", (q) => q.eq("sellerId", u._id))
        .filter((q) => q.eq(q.field("status"), "active"))
        .take(200);
      if (s) out.push({ ...s, activeListings: active.length });
    }
    return out;
  },
});

// ---------- notifications ----------

export const notifications = query({
  args: {},
  handler: async (ctx) => {
    const user = await getViewer(ctx);
    if (!user) return [];
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", user._id).eq("read", false))
      .order("desc")
      .take(30);
    const read = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", user._id).eq("read", true))
      .order("desc")
      .take(20);
    return [...unread, ...read];
  },
});

export const markNotificationsRead = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", user._id).eq("read", false))
      .take(200);
    for (const n of unread) await ctx.db.patch(n._id, { read: true });
    return null;
  },
});

/**
 * Permanently deletes the signed-in user: their listings (with photos, videos,
 * papers, inquiries and stats), saves, saved searches, inquiries they sent,
 * notifications and sign-in sessions. Admins must be demoted first.
 */
export const deleteAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (user.role === "admin") throw new ConvexError({ code: "INVALID", message: "Admins can't delete their account. Ask another admin to change your role first." });
    const uid = user._id;

    const listings = await ctx.db
      .query("listings")
      .withIndex("by_seller", (q) => q.eq("sellerId", uid))
      .take(500);
    for (const l of listings) {
      if (l.status === "active") await setListingStatus(ctx, l, "expired"); // keeps area counts right
      const videos = await ctx.db
        .query("videos")
        .withIndex("by_listing", (q) => q.eq("listingId", l._id))
        .collect();
      for (const vid of videos) {
        await deleteMedia(ctx, [vid.mediaId, vid.thumbMediaId].filter((x): x is Id<"media"> => !!x));
        await ctx.db.delete(vid._id);
      }
      await deleteMedia(ctx, [...l.imageIds, ...l.documents.map((d) => d.fileId)]);
      for (const table of ["inquiries", "saves", "reports"] as const) {
        const rows = await ctx.db
          .query(table)
          .withIndex("by_listing", (q) => q.eq("listingId", l._id))
          .take(1000);
        for (const r of rows) await ctx.db.delete(r._id);
      }
      const stats = await ctx.db
        .query("dailyStats")
        .withIndex("by_listing_day", (q) => q.eq("listingId", l._id))
        .take(1000);
      for (const r of stats) await ctx.db.delete(r._id);
      await ctx.db.delete(l._id);
    }

    const saves = await ctx.db
      .query("saves")
      .withIndex("by_user", (q) => q.eq("userId", uid))
      .take(1000);
    for (const s of saves) {
      const l = await ctx.db.get(s.listingId);
      if (l) await ctx.db.patch(l._id, { saveCount: Math.max(0, l.saveCount - 1) });
      await ctx.db.delete(s._id);
    }
    for (const table of ["savedSearches", "watchHistory", "notifications"] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_user", (q) => q.eq("userId", uid))
        .take(1000);
      for (const r of rows) await ctx.db.delete(r._id);
    }
    const sent = await ctx.db
      .query("inquiries")
      .withIndex("by_buyer", (q) => q.eq("buyerId", uid))
      .take(1000);
    for (const r of sent) await ctx.db.delete(r._id);

    // Sign-in data last: this ends every session of the user.
    const accounts = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", uid))
      .collect();
    for (const a of accounts) {
      const codes = await ctx.db
        .query("authVerificationCodes")
        .withIndex("accountId", (q) => q.eq("accountId", a._id))
        .collect();
      for (const c of codes) await ctx.db.delete(c._id);
      await ctx.db.delete(a._id);
    }
    const sessions = await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", uid))
      .collect();
    for (const sess of sessions) {
      const tokens = await ctx.db
        .query("authRefreshTokens")
        .withIndex("sessionId", (q) => q.eq("sessionId", sess._id))
        .collect();
      for (const t of tokens) await ctx.db.delete(t._id);
      await ctx.db.delete(sess._id);
    }
    await ctx.db.delete(uid);
    return null;
  },
});

/** CLI: npx convex run users:setRole '{"email":"you@x.com","role":"admin"}' */
export const setRole = internalMutation({
  args: { email: v.string(), role: vRole },
  handler: async (ctx, { email, role }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .unique();
    if (!user) throw new Error(`No user with email ${email}`);
    await ctx.db.patch(user._id, { role });
    return user._id;
  },
});
