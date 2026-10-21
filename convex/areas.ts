import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";

export const autocomplete = query({
  args: { q: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { q, limit }) => {
    const term = q.trim();
    const max = Math.min(limit ?? 8, 20);
    const rows = term
      ? await ctx.db
          .query("areas")
          .withSearchIndex("search_name", (s) => s.search("areaName", term))
          .take(max)
      : await ctx.db.query("areas").withIndex("by_active").order("desc").take(max);
    // Bangla names are not in the search index; match them with a contains check.
    if (term && rows.length < max && /[ঀ-৿]/.test(term)) {
      const all = await ctx.db.query("areas").take(500);
      for (const a of all) if (a.areaNameBn?.includes(term) && !rows.some((r) => r._id === a._id)) rows.push(a);
    }
    return rows.map(shape);
  },
});

/** Division > District > Area tree with active listing counts. */
export const hierarchy = query({
  args: {},
  handler: async (ctx) => {
    const areas = await ctx.db.query("areas").take(1000);
    const divisions = new Map<string, { name: string; count: number; districts: Map<string, { name: string; count: number; areas: ReturnType<typeof shape>[] }> }>();
    for (const a of areas) {
      let d = divisions.get(a.division);
      if (!d) divisions.set(a.division, (d = { name: a.division, count: 0, districts: new Map() }));
      let dist = d.districts.get(a.district);
      if (!dist) d.districts.set(a.district, (dist = { name: a.district, count: 0, areas: [] }));
      dist.areas.push(shape(a));
      dist.count += a.activeCount;
      d.count += a.activeCount;
    }
    return [...divisions.values()]
      .map((d) => ({
        name: d.name,
        count: d.count,
        districts: [...d.districts.values()]
          .map((x) => ({ ...x, areas: x.areas.sort((p, q) => q.activeCount - p.activeCount) }))
          .sort((p, q) => q.count - p.count),
      }))
      .sort((p, q) => q.count - p.count);
  },
});

export const bySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const a = await ctx.db
      .query("areas")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    return a ? shape(a) : null;
  },
});

export const all = query({
  args: {},
  handler: async (ctx) => (await ctx.db.query("areas").take(1000)).map(shape),
});

function shape(a: Doc<"areas">) {
  return {
    _id: a._id,
    division: a.division,
    district: a.district,
    upazila: a.upazila,
    areaName: a.areaName,
    areaNameBn: a.areaNameBn,
    slug: a.slug,
    centerLat: a.centerLat,
    centerLng: a.centerLng,
    activeCount: a.activeCount,
  };
}
