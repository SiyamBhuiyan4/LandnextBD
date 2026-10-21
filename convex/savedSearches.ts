import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { getViewer, requireUser } from "./helpers";
import { buildListingQuery, matchesArrayFilters } from "./listings";
import { vListingFilters } from "./validators";

export const create = mutation({
  args: { name: v.string(), filters: vListingFilters, notifyVia: v.union(v.literal("email"), v.literal("push")) },
  handler: async (ctx, { name, filters, notifyVia }) => {
    const user = await requireUser(ctx);
    const existing = await ctx.db
      .query("savedSearches")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    if (existing.length >= 20) throw new ConvexError({ code: "LIMIT", message: "You can keep up to 20 saved searches." });
    if (notifyVia === "email" && !user.email) throw new ConvexError({ code: "INVALID", message: "Add an email to your account for email alerts." });
    return await ctx.db.insert("savedSearches", {
      userId: user._id,
      name: name.trim().slice(0, 80) || "My search",
      filters,
      notifyVia,
      lastNotifiedAt: Date.now(),
      createdAt: Date.now(),
    });
  },
});

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await getViewer(ctx);
    if (!user) return [];
    return await ctx.db
      .query("savedSearches")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
  },
});

export const remove = mutation({
  args: { id: v.id("savedSearches") },
  handler: async (ctx, { id }) => {
    const user = await requireUser(ctx);
    const s = await ctx.db.get(id);
    if (!s || s.userId !== user._id) throw new ConvexError({ code: "FORBIDDEN", message: "Not yours." });
    await ctx.db.delete(id);
    return null;
  },
});

/** Daily cron: notify each saved search about listings published since the last alert. */
export const runAlerts = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("savedSearches").paginate({ numItems: 100, cursor: cursor ?? null });
    const now = Date.now();
    for (const s of page.page) {
      const rows = await buildListingQuery(ctx, { ...s.filters, sort: "newest" }).take(50);
      const fresh = rows.filter((l) => (l.publishedAt ?? 0) > s.lastNotifiedAt && matchesArrayFilters(l, s.filters));
      if (fresh.length) {
        const { areaId, ...rest } = s.filters;
        const area = areaId ? await ctx.db.get(areaId) : null;
        const qs = new URLSearchParams(
          Object.entries({ ...rest, area: area?.slug }).flatMap(([k, val]) =>
            val === undefined ? [] : [[k, Array.isArray(val) ? val.join(",") : val === true ? "1" : String(val)]],
          ),
        );
        const href = `/browse?${qs}`;
        await ctx.db.insert("notifications", {
          userId: s.userId,
          kind: "saved_search",
          title: `${fresh.length} new match${fresh.length > 1 ? "es" : ""} for "${s.name}"`,
          body: fresh
            .slice(0, 3)
            .map((l) => l.title)
            .join(" · "),
          href,
          read: false,
          createdAt: now,
        });
        if (s.notifyVia === "email") {
          const user = await ctx.db.get(s.userId);
          if (user?.email)
            await ctx.scheduler.runAfter(0, internal.notify.sendEmail, {
              to: user.email,
              subject: `New land listings for "${s.name}"`,
              text:
                fresh
                  .slice(0, 10)
                  .map((l) => `• ${l.title} — ${l.areaName}`)
                  .join("\n") + `\n\nSee all: ${process.env.SITE_URL ?? ""}${href}`,
            });
        }
      }
      await ctx.db.patch(s._id, { lastNotifiedAt: now });
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.savedSearches.runAlerts, { cursor: page.continueCursor });
    return page.page.length;
  },
});
