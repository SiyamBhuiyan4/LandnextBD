import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { getViewer, listingCard, requireUser, sellerSummary } from "./helpers";
import { vAccountType, vRole } from "./validators";

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
      image: user.image,
      role: user.role ?? "buyer",
      accountType: user.accountType ?? "owner",
      verificationStatus: user.verificationStatus ?? "unverified",
      companyName: user.companyName,
      bio: user.bio,
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
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const name = args.name.trim();
    if (name.length < 2 || name.length > 60) throw new ConvexError({ code: "INVALID", message: "Name must be 2–60 characters." });
    if ((args.bio ?? "").length > 500) throw new ConvexError({ code: "INVALID", message: "Bio is too long." });
    // Sellers who switch to broker/company keep a matching role.
    let role = user.role ?? "buyer";
    if (role === "seller" && args.accountType !== "owner") role = "broker";
    if (role === "broker" && args.accountType === "owner") role = "seller";
    await ctx.db.patch(user._id, {
      name,
      accountType: args.accountType,
      companyName: args.companyName?.trim() || undefined,
      bio: args.bio?.trim() || undefined,
      role,
    });
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
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (user.verificationStatus === "verified") return null;
    if (!user.phone && !user.email) throw new ConvexError({ code: "INVALID", message: "Add a phone or email first." });
    await ctx.db.patch(user._id, { verificationStatus: "pending" });
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
