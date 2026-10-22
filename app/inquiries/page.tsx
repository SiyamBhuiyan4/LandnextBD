"use client";

import { useQuery } from "convex/react";
import { MessageCircle, Phone } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { whatsappHref } from "@/components/listings/contact-panel";
import { buttonVariants } from "@/components/ui/button";
import { useFmt } from "@/hooks/use-fmt";
import { listingHref } from "@/lib/urls";
import { cn } from "@/lib/utils";

export default function MyInquiriesPage() {
  const t = useTranslations("inquiries");
  const td = useTranslations("listingDetail");
  const tc = useTranslations("common");
  const tst = useTranslations("status");
  const fmt = useFmt();
  const rows = useQuery(api.inquiries.mine);
  return (
    <div className="container-page max-w-3xl py-8">
      <h1 className="font-heading text-2xl font-bold">{t("title")}</h1>
      {rows?.length === 0 && (
        <div className="mt-6 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          <p>{t("empty")}</p>
          <Link href="/browse" className={buttonVariants({ size: "sm", className: "mt-4" })}>
            {tc("browse")}
          </Link>
        </div>
      )}
      <ul className="mt-6 space-y-3">
        {rows === undefined && <li className="h-24 animate-pulse rounded-2xl bg-muted" />}
        {rows?.map((i) => {
          const live = i.listing?.status === "active";
          return (
            <li key={i._id} className="flex gap-3 rounded-2xl border bg-card p-3 shadow-soft">
              <div className="relative h-20 w-24 shrink-0 overflow-hidden rounded-xl bg-muted">
                {i.listing?.coverUrl && <Image src={i.listing.coverUrl} alt="" fill sizes="96px" className={cn("object-cover", !live && "grayscale")} />}
              </div>
              <div className="min-w-0 flex-1">
                {i.listing ? (
                  <Link href={listingHref(i.listing)} className="line-clamp-1 font-semibold hover:underline">
                    {i.listing.title}
                  </Link>
                ) : (
                  <p className="font-semibold">—</p>
                )}
                <p className="line-clamp-2 text-sm text-muted-foreground">{i.message}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                  <span className={cn("rounded-full px-2 py-0.5 font-semibold", i.status === "replied" ? "bg-primary text-primary-foreground" : "bg-muted")}>{t(`status.${i.status}`)}</span>
                  {i.listing && !live && <span className="rounded-full bg-foreground px-2 py-0.5 font-semibold text-background">{tst(i.listing.status)}</span>}
                  <span className="text-muted-foreground">{fmt.ago(i.createdAt)}</span>
                  {i.sellerName && <span className="text-muted-foreground">· {t("seller", { name: i.sellerName })}</span>}
                </p>
                {i.sellerPhone && live && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <a href={`tel:${i.sellerPhone}`} className={buttonVariants({ size: "sm", variant: "outline" })}>
                      <Phone /> {td("call")}
                    </a>
                    <a href={whatsappHref(i.sellerPhone)} target="_blank" rel="noopener noreferrer" className={buttonVariants({ size: "sm", variant: "outline" })}>
                      <MessageCircle /> {td("whatsapp")}
                    </a>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
