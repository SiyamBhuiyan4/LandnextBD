import { fetchQuery } from "convex/nextjs";
import type { MetadataRoute } from "next";
import { api } from "@/convex/_generated/api";
import { landTypeToSlug, listingHref } from "@/lib/urls";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [listings, areas] = await Promise.all([
    fetchQuery(api.listings.sitemapEntries, {}).catch(() => []),
    fetchQuery(api.areas.all, {}).catch(() => []),
  ]);
  const typesByArea = new Map<string, Set<string>>();
  for (const l of listings) {
    const set = typesByArea.get(l.areaSlug) ?? new Set();
    set.add(landTypeToSlug(l.landType));
    typesByArea.set(l.areaSlug, set);
  }
  return [
    { url: SITE, changeFrequency: "daily", priority: 1 },
    { url: `${SITE}/browse`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE}/videos`, changeFrequency: "daily", priority: 0.7 },
    ...areas
      .filter((a) => a.activeCount > 0)
      .flatMap((a) => [
        { url: `${SITE}/land/${a.slug}`, changeFrequency: "daily" as const, priority: 0.8 },
        ...[...(typesByArea.get(a.slug) ?? [])].map((t) => ({ url: `${SITE}/land/${a.slug}/${t}`, changeFrequency: "daily" as const, priority: 0.7 })),
      ]),
    ...listings.map((l) => ({ url: `${SITE}${listingHref(l)}`, lastModified: new Date(l.updatedAt), changeFrequency: "weekly" as const, priority: 0.6 })),
  ];
}
