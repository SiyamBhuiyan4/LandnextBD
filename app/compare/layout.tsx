import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

// The compare table depends on the visitor's own tray, so keep it out of search results.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("compare");
  return { title: t("title"), robots: { index: false, follow: true } };
}

export default function CompareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
