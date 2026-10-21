import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery, preloadedQueryResult, preloadQuery } from "convex/nextjs";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { ListingDetail } from "@/components/listings/listing-detail";
import { formatBDT } from "@/lib/format";
import { listingHref } from "@/lib/urls";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

type Params = { area: string; type: string; slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const l = await fetchQuery(api.listings.getBySlug, { slug });
  if (!l) return { title: "Listing not found", robots: { index: false } };
  const description = `${formatBDT(l.price)} · ${l.sizeValue} ${l.sizeUnit} · ${l.areaName}, ${l.district}. ${l.description.slice(0, 140)}`;
  const image = l.coverUrl ? new URL(l.coverUrl, SITE).toString() : undefined;
  return {
    title: l.title,
    description,
    alternates: { canonical: listingHref(l) },
    openGraph: { title: l.title, description, type: "article", url: listingHref(l), images: image ? [{ url: image, width: 1280, height: 853, alt: l.title }] : [] },
    twitter: { card: "summary_large_image", title: l.title, description, images: image ? [image] : [] },
    robots: l.status === "active" ? undefined : { index: false },
  };
}

export default async function ListingPage({ params }: { params: Promise<Params> }) {
  const { area, type, slug } = await params;
  const token = await convexAuthNextjsToken();
  const preloaded = await preloadQuery(api.listings.getBySlug, { slug }, { token });
  const l = preloadedQueryResult(preloaded);
  if (!l) notFound();
  const canonical = listingHref(l);
  if (canonical !== `/land/${area}/${type}/${slug}`) permanentRedirect(canonical);

  // schema.org RealEstateListing
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: l.title,
    description: l.description,
    url: new URL(canonical, SITE).toString(),
    image: l.images.map((src) => new URL(src, SITE).toString()),
    datePosted: new Date(l.publishedAt).toISOString(),
    offers: {
      "@type": "Offer",
      price: l.price,
      priceCurrency: "BDT",
      availability: l.status === "active" ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
    },
    about: {
      "@type": "Place",
      name: `${l.areaName}, ${l.district}`,
      address: { "@type": "PostalAddress", addressLocality: l.areaName, addressRegion: l.division, addressCountry: "BD" },
      ...(l.approxLat !== undefined ? { geo: { "@type": "GeoCoordinates", latitude: l.approxLat, longitude: l.approxLng } } : {}),
    },
    additionalProperty: [
      { "@type": "PropertyValue", name: "Land size", value: l.sizeValue, unitText: l.sizeUnit },
      { "@type": "PropertyValue", name: "Land type", value: l.landType },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <ListingDetail preloaded={preloaded} />
    </>
  );
}
