import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getViewer, listingCard, requireUser } from "./helpers";

export const toggle = mutation({
  args: { listingId: v.id("listings") },
  handler: async (ctx, { listingId }) => {
    const user = await requireUser(ctx);
    const listing = await ctx.db.get(listingId);
    if (!listing) return { saved: false };
    const existing = await ctx.db
      .query("saves")
      .withIndex("by_user_listing", (q) => q.eq("userId", user._id).eq("listingId", listingId))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
      await ctx.db.patch(listingId, { saveCount: Math.max(0, listing.saveCount - 1) });
      return { saved: false };
    }
    await ctx.db.insert("saves", { userId: user._id, listingId, createdAt: Date.now() });
    await ctx.db.patch(listingId, { saveCount: listing.saveCount + 1 });
    return { saved: true };
  },
});

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await getViewer(ctx);
    if (!user) return [];
    const saves = await ctx.db
      .query("saves")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(200);
    const out = [];
    for (const s of saves) {
      const l = await ctx.db.get(s.listingId);
      if (l && ["active", "sold", "expired"].includes(l.status)) out.push({ ...(await listingCard(ctx, l)), savedAt: s.createdAt });
    }
    return out;
  },
});

/** Ids only — cheap lookup for heart icons on cards. */
export const mySavedIds = query({
  args: {},
  handler: async (ctx) => {
    const user = await getViewer(ctx);
    if (!user) return [];
    const saves = await ctx.db
      .query("saves")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(500);
    return saves.map((s) => s.listingId);
  },
});
