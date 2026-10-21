import { fetchQuery } from "convex/nextjs";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { api } from "@/convex/_generated/api";
import { BrowseView } from "@/components/search/browse-view";
import type { LandType } from "@/lib/constants";
import { slugToLandType } from "@/lib/urls";

// Shared by /land/[area] and /land/[area]/[type]: server-rendered first page for SEO,
// then the live, filterable browse view takes over.

async function resolve(areaSlug: string, typeSlug?: string) {
  const area = await fetchQuery(api.areas.bySlug, { slug: areaSlug });
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
  const first = await fetchQuery(api.listings.search, {
    filters: { areaId: r.area._id, landType: r.landType as LandType | undefined },
    paginationOpts: { numItems: 12, cursor: null },
  });
  const title = r.landType ? `${tl(r.landType)} · ${t("titleIn", { place: placeName })}` : t("titleIn", { place: placeName });
  return (
    <Suspense>
      <BrowseView title={title} fixedArea={r.area} fixedType={r.landType} initialPage={first.page} />
    </Suspense>
  );
}
