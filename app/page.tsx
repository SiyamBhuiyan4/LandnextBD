import type { Metadata } from "next";
import { Hero } from "@/components/home/hero";
import {
  Categories,
  FeaturedCarousel,
  NewestGrid,
  PopularAreas,
  SellCta,
  StatsStrip,
  TrustSection,
  VerifiedSellers,
  VideosStrip,
} from "@/components/home/home-sections";
import { SITE_URL, jsonLdHtml, organization } from "@/lib/seo";

export const metadata: Metadata = { alternates: { canonical: "/" } };

// schema.org Organization + WebSite with a sitelinks search box pointing at /browse?q=
const homeJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    organization,
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "land.db",
      publisher: { "@id": organization["@id"] },
      inLanguage: ["en", "bn"],
      potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/browse?q={search_term_string}` }, "query-input": "required name=search_term_string" },
    },
  ],
};

export default function HomePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdHtml(homeJsonLd)} />
      <Hero />
      <StatsStrip />
      <Categories />
      <FeaturedCarousel />
      <PopularAreas />
      <NewestGrid />
      <TrustSection />
      <VideosStrip />
      <VerifiedSellers />
      <SellCta />
    </>
  );
}
