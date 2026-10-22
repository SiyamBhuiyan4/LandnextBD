import { BRAND } from "./constants";

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

export const absUrl = (path: string) => new URL(path, SITE_URL).toString();

/** Serialise JSON-LD for a <script type="application/ld+json"> without letting "</script>" break out. */
export const jsonLdHtml = (data: unknown) => ({ __html: JSON.stringify(data).replace(/</g, "\\u003c") });

export function breadcrumbList(items: { name: string; path: string }[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: absUrl(it.path) })),
  };
}

export const organization = {
  "@type": "Organization",
  "@id": `${SITE_URL}/#org`,
  name: BRAND.company,
  alternateName: BRAND.site,
  url: SITE_URL,
  logo: absUrl("/brand/icon.svg"),
  areaServed: { "@type": "Country", name: "Bangladesh" },
};
