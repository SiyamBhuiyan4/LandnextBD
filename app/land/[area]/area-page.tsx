import { fetchQuery } from "convex/nextjs";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { api } from "@/convex/_generated/api";
import { BrowseView } from "@/components/search/browse-view";
import type { LandType } from "@/lib/constants";
import { districtName, divisionName } from "@/lib/places";
import { absUrl, breadcrumbList, jsonLdHtml } from "@/lib/seo";
import { landTypeToSlug, listingHref, slugToLandType } from "@/lib/urls";

// Shared by /land/[area] and /land/[area]/[type]: server-rendered first page for SEO,
// then the live, filterable browse view takes over.

async function resolve(areaSlug: string, typeSlug?: string) {
  const area = await fetchQuery(api.areas.bySlug, { slug: areaSlug }).catch(() => null);
  const landType = typeSlug ? slugToLandType(typeSlug) : undefined;
  if (!area || landType === null) return null;
  return { area, landType: landType ?? undefined };
}

export async function areaMetadata(areaSlug: string, typeSlug?: string): Promise<Metadata> {
  const r = await resolve(areaSlug, typeSlug);
  if (!r) return { title: "Not found", robots: { index: false } };
  const tl = await getTranslations("landType");
  const place = `${r.area.areaName}, ${r.area.district}`;
  const title = r.landType ? `${tl(r.landType)} land for sale in ${place}` : `Land & plots for sale in ${place}`;
  return {
    title,
    description: `${r.area.activeCount} active land listings in ${place}. Photos, documents checklist, prices per katha and walkthrough videos.`,
    alternates: { canonical: `/land/${areaSlug}${typeSlug ? `/${typeSlug}` : ""}` },
  };
}

export async function AreaPage({ areaSlug, typeSlug }: { areaSlug: string; typeSlug?: string }) {
  const r = await resolve(areaSlug, typeSlug);
  if (!r) notFound();
  const t = await getTranslations("browse");
  const tl = await getTranslations("landType");
  const locale = await getLocale();
  const placeName = locale === "bn" && r.area.areaNameBn ? r.area.areaNameBn : r.area.areaName;
  const filters = { areaId: r.area._id, landType: r.landType as LandType | undefined };
  const [firstRes, countRes] = await Promise.all([
    fetchQuery(api.listings.search, { filters, paginationOpts: { numItems: 12, cursor: null } }).catch(() => null),
    fetchQuery(api.listings.count, { filters }).catch(() => null),
  ]);
  const first = firstRes ?? { page: [], isDone: true, continueCursor: "" };
  const count = countRes ?? { total: 0, capped: false };
  const crumbs = [
    { label: t("home"), href: "/" },
    { label: t("landForSale"), href: "/browse" },
    { label: divisionName(r.area.division, locale), href: `/browse?division=${encodeURIComponent(r.area.division)}` },
    { label: districtName(r.area.district, locale), href: `/browse?district=${encodeURIComponent(r.area.district)}` },
    { label: placeName, href: `/land/${r.area.slug}` },
    ...(r.landType ? [{ label: tl(r.landType) }] : []),
  ];
  const title = r.landType ? `${tl(r.landType)} · ${t("titleIn", { place: placeName })}` : t("titleIn", { place: placeName });
  const areaPath = `/land/${r.area.slug}`;
  const path = r.landType ? `${areaPath}/${landTypeToSlug(r.landType)}` : areaPath;
  // schema.org CollectionPage: breadcrumb trail + the server-rendered first page as an ItemList
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    url: absUrl(path),
    breadcrumb: breadcrumbList([
      { name: "Home", path: "/" },
      { name: `Land in ${r.area.areaName}`, path: areaPath },
      ...(r.landType ? [{ name: tl(r.landType), path }] : []),
    ]),
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: first.page.length,
      itemListElement: first.page.map((l, i) => ({ "@type": "ListItem", position: i + 1, url: absUrl(listingHref(l)), name: l.title })),
    },
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdHtml(jsonLd)} />
      <Suspense>
        <BrowseView title={title} fixedArea={r.area} fixedType={r.landType} initialPage={first.page} initialCount={{ total: count.total, capped: count.capped }} breadcrumbs={crumbs} />
      </Suspense>
    </>
  );
}
