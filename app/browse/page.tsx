import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { BrowseView } from "@/components/search/browse-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("browse");
  return { title: t("title"), alternates: { canonical: "/browse" } };
}

export default async function BrowsePage() {
  const t = await getTranslations("browse");
  return (
    <Suspense>
      <BrowseView title={t("title")} />
    </Suspense>
  );
}
