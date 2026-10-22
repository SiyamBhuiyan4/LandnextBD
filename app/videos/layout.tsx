import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("video");
  return { title: t("feedTitle"), description: t("feedSubtitle"), alternates: { canonical: "/videos" } };
}

export default function VideosLayout({ children }: { children: React.ReactNode }) {
  return children;
}
