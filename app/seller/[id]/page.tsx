"use client";

import { useQuery } from "convex/react";
import { BadgeCheck } from "lucide-react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ListingCard, ListingCardSkeleton } from "@/components/listings/listing-card";
import { useFmt } from "@/hooks/use-fmt";

export default function SellerPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("listing");
  const ts = useTranslations("sellerType");
  const th = useTranslations("home");
  const fmt = useFmt();
  const p = useQuery(api.users.publicProfile, { id: id as Id<"users"> });
  const saved = useQuery(api.saves.mySavedIds);
  if (p === null) return <p className="container-page py-20 text-center text-muted-foreground">Not found</p>;
  return (
    <div className="container-page py-8">
      {p ? (
        <div className="flex items-center gap-4">
          <span className="grid size-16 place-items-center rounded-full bg-secondary font-heading text-2xl font-bold text-primary">{p.name.slice(0, 1)}</span>
          <div>
            <h1 className="flex items-center gap-2 font-heading text-2xl font-bold">
              {p.companyName ?? p.name} {p.verificationStatus === "verified" && <BadgeCheck className="size-6 text-primary" aria-label={t("verifiedSeller")} />}
            </h1>
            <p className="text-sm text-muted-foreground">
              {ts(p.accountType)} · {t("memberSince", { date: fmt.date(p.memberSince) })} ·{" "}
              {p.responseRate !== null ? t("responseRate", { rate: fmt.digits(p.responseRate) }) : t("noResponseData")}
            </p>
            {p.maskedPhone && <p className="font-mono text-sm">{p.maskedPhone}</p>}
          </div>
        </div>
      ) : (
        <div className="h-16 w-72 animate-pulse rounded-xl bg-muted" />
      )}
      {p?.bio && <p className="mt-4 max-w-2xl text-sm text-muted-foreground">{p.bio}</p>}
      <h2 className="mt-8 mb-4 font-heading text-lg font-semibold">{p ? th("listingsCount", { count: fmt.digits(p.listings.length) }) : ""}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {p ? p.listings.map((l) => <ListingCard key={l._id} l={l} saved={!!saved?.includes(l._id)} />) : Array.from({ length: 4 }, (_, i) => <ListingCardSkeleton key={i} />)}
      </div>
    </div>
  );
}
