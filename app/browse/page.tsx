import { fetchQuery } from "convex/nextjs";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { api } from "@/convex/_generated/api";
import { BrowseView } from "@/components/search/browse-view";
import { districtName, divisionName } from "@/lib/places";
import { filtersFromSearchParams, filtersToSearchParams } from "@/lib/urls";

type SP = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("browse");
  return { title: t("title"), alternates: { canonical: "/browse" } };
}

/** Server-renders the first page for the URL's filters (SEO + fast first paint); the live view takes over. */
export default async function BrowsePage({ searchParams }: { searchParams: SP }) {
  const t = await getTranslations("browse");
  const locale = await getLocale();
  const urlFilters = filtersFromSearchParams(await searchParams);
  const { area: areaSlug, ...rest } = urlFilters;
  const area = areaSlug ? await fetchQuery(api.areas.bySlug, { slug: areaSlug }).catch(() => null) : null;
  const filters = { ...rest, areaId: area?._id };
  const { sort: _sort, ...countFilters } = filters;
  const [first, count] = await Promise.all([
    fetchQuery(api.listings.search, { filters, paginationOpts: { numItems: 12, cursor: null } }).catch(() => null),
    fetchQuery(api.listings.count, { filters: countFilters }).catch(() => null),
  ]);
  const place = area ? (locale === "bn" && area.areaNameBn ? area.areaNameBn : area.areaName) : rest.district ? districtName(rest.district, locale) : rest.division ? divisionName(rest.division, locale) : undefined;
  const crumbs = [
    { label: t("home"), href: "/" },
    { label: t("landForSale"), href: "/browse" },
    ...(rest.division ? [{ label: divisionName(rest.division, locale), href: `/browse?division=${encodeURIComponent(rest.division)}` }] : []),
    ...(rest.district ? [{ label: districtName(rest.district, locale), href: `/browse?district=${encodeURIComponent(rest.district)}` }] : []),
    ...(area ? [{ label: place!, href: `/land/${area.slug}` }] : []),
  ];
  return (
    <Suspense>
      <BrowseView
        title={place ? t("titleIn", { place }) : t("title")}
        initialPage={first?.page}
        initialCount={count ? { total: count.total, capped: count.capped } : undefined}
        initialKey={filtersToSearchParams(urlFilters).toString()}
        breadcrumbs={crumbs}
      />
    </Suspense>
  );
}
