"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { readLocal } from "@/lib/client";

// Written by the listing page (listing-detail.tsx). Stays on this device only.
export const RECENT_KEY = "lnb_recent";
export type RecentItem = { id: string; href: string; title: string; area: string };

export function RecentlyViewed() {
  const t = useTranslations("home");
  const [items, setItems] = useState<RecentItem[]>([]);
  useEffect(() => setItems(readLocal<RecentItem[]>(RECENT_KEY, []).slice(0, 6)), []);
  if (items.length === 0) return null;
  return (
    <section className="container-page py-10" aria-labelledby="recently-viewed">
      <h2 id="recently-viewed" className="font-heading text-xl font-bold">
        {t("recentlyViewed")}
      </h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((i) => (
          <li key={i.id}>
            <Link href={i.href} className="block rounded-xl border bg-card px-4 py-3 transition hover:border-primary/50 hover:shadow-elev-1">
              <p className="line-clamp-1 font-medium">{i.title}</p>
              <p className="text-xs text-muted-foreground">{i.area}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
