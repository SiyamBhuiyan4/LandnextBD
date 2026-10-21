"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { useFmt } from "@/hooks/use-fmt";
import { listingHref } from "@/lib/urls";

export default function AdminPromotions() {
  const t = useTranslations("admin");
  const fmt = useFmt();
  const rows = useQuery(api.admin.promotionRequests);
  const setFlags = useMutation(api.admin.setListingFlags);
  if (rows?.length === 0) return <p className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">—</p>;
  return (
    <ul className="space-y-2">
      {rows?.map((l) => (
        <li key={l._id} className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-3 text-sm shadow-soft">
          <Link href={listingHref(l)} className="flex-1 font-medium hover:underline">
            {l.title}
          </Link>
          <span className="text-muted-foreground">{fmt.price(l.price)}</span>
          <Button size="sm" onClick={() => setFlags({ id: l._id, isFeatured: true })}>
            {t("featureListing")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setFlags({ id: l._id, isFeatured: false })}>
            {t("dismiss")}
          </Button>
        </li>
      ))}
    </ul>
  );
}
