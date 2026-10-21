import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { dhakaDay, requireRole, SELLER_ROLES } from "./helpers";

/** Seller analytics: views/inquiries/watch time over time and top listings. */
export const analytics = query({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, { days }) => {
    const user = await requireRole(ctx, SELLER_ROLES);
    const n = Math.min(Math.max(days ?? 30, 7), 90);
    const from = dhakaDay(Date.now() - (n - 1) * 86400_000);
    const rows = await ctx.db
      .query("dailyStats")
      .withIndex("by_seller_day", (q) => q.eq("sellerId", user._id).gte("day", from))
      .take(10000);
    const dayKeys: string[] = [];
    for (let i = n - 1; i >= 0; i--) dayKeys.push(dhakaDay(Date.now() - i * 86400_000));
    const byDay = new Map(dayKeys.map((d) => [d, { day: d, views: 0, inquiries: 0, videoWatchSec: 0 }]));
    const byListing = new Map<Id<"listings">, { views: number; inquiries: number; videoWatchSec: number }>();
    for (const r of rows) {
      const d = byDay.get(r.day);
      if (d) {
        d.views += r.views;
        d.inquiries += r.inquiries;
        d.videoWatchSec += r.videoWatchSec;
      }
      const l = byListing.get(r.listingId) ?? { views: 0, inquiries: 0, videoWatchSec: 0 };
      l.views += r.views;
      l.inquiries += r.inquiries;
      l.videoWatchSec += r.videoWatchSec;
      byListing.set(r.listingId, l);
    }
    const series = [...byDay.values()];
    const top = await Promise.all(
      [...byListing.entries()]
        .sort((a, b) => b[1].views - a[1].views)
        .slice(0, 5)
        .map(async ([id, s]) => {
          const listing = await ctx.db.get(id);
          return { listingId: id, title: listing?.title ?? "—", slug: listing?.slug, areaSlug: listing?.areaSlug, landType: listing?.landType, ...s };
        }),
    );
    const mine = await ctx.db
      .query("listings")
      .withIndex("by_seller", (q) => q.eq("sellerId", user._id))
      .take(500);
    const newInquiries = (
      await ctx.db
        .query("inquiries")
        .withIndex("by_seller", (q) => q.eq("sellerId", user._id))
        .filter((q) => q.eq(q.field("status"), "new"))
        .take(500)
    ).length;
    return {
      series,
      top,
      totals: {
        views: series.reduce((s, d) => s + d.views, 0),
        inquiries: series.reduce((s, d) => s + d.inquiries, 0),
        videoWatchSec: series.reduce((s, d) => s + d.videoWatchSec, 0),
      },
      counts: {
        active: mine.filter((l) => l.status === "active").length,
        pending: mine.filter((l) => l.status === "pending_review").length,
        drafts: mine.filter((l) => l.status === "draft" || l.status === "rejected").length,
        sold: mine.filter((l) => l.status === "sold").length,
        newInquiries,
      },
    };
  },
});
