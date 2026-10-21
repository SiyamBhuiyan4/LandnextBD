"use client";

import { useQuery } from "convex/react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useFmt } from "@/hooks/use-fmt";
import { listingHref } from "@/lib/urls";
import { cn } from "@/lib/utils";

export default function MyInquiriesPage() {
  const t = useTranslations("inquiries");
  const fmt = useFmt();
  const rows = useQuery(api.inquiries.mine);
  return (
    <div className="container-page max-w-3xl py-8">
      <h1 className="font-heading text-2xl font-bold">{t("title")}</h1>
      {rows?.length === 0 && <p className="mt-6 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("empty")}</p>}
      <ul className="mt-6 space-y-3">
        {rows === undefined && <li className="h-24 animate-pulse rounded-2xl bg-muted" />}
        {rows?.map((i) => (
          <li key={i._id} className="flex gap-3 rounded-2xl border bg-card p-3 shadow-soft">
            <div className="relative h-20 w-24 shrink-0 overflow-hidden rounded-xl bg-muted">{i.listing?.coverUrl && <Image src={i.listing.coverUrl} alt="" fill sizes="96px" className="object-cover" />}</div>
            <div className="min-w-0 flex-1">
              {i.listing ? (
                <Link href={listingHref(i.listing)} className="line-clamp-1 font-semibold hover:underline">
                  {i.listing.title}
                </Link>
              ) : (
                <p className="font-semibold">—</p>
              )}
              <p className="line-clamp-2 text-sm text-muted-foreground">{i.message}</p>
              <p className="mt-1 flex items-center gap-2 text-xs">
                <span className={cn("rounded-full px-2 py-0.5 font-semibold", i.status === "replied" ? "bg-primary text-primary-foreground" : "bg-muted")}>{t(`status.${i.status}`)}</span>
                <span className="text-muted-foreground">{fmt.ago(i.createdAt)}</span>
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
