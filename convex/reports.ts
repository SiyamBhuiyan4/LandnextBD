import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { rateLimit, requireUser } from "./helpers";
import { vReportReason } from "./validators";

export const create = mutation({
  args: { listingId: v.id("listings"), reason: vReportReason, details: v.optional(v.string()) },
  handler: async (ctx, { listingId, reason, details }) => {
    const user = await requireUser(ctx);
    if (!(await ctx.db.get(listingId))) throw new ConvexError({ code: "NOT_FOUND", message: "Listing not found." });
    await rateLimit(ctx, `report:${user._id}`, 10, 24 * 3600_000);
    const dup = await ctx.db
      .query("reports")
      .withIndex("by_listing", (q) => q.eq("listingId", listingId))
      .filter((q) => q.and(q.eq(q.field("reporterId"), user._id), q.eq(q.field("status"), "open")))
      .first();
    if (dup) return dup._id;
    return await ctx.db.insert("reports", {
      listingId,
      reporterId: user._id,
      reason,
      details: details?.trim().slice(0, 1000) || undefined,
      status: "open",
      createdAt: Date.now(),
    });
  },
});
