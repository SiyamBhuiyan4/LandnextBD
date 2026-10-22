"use client";

import { useMutation, useQuery } from "convex/react";
import { BellRing, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { ListingCard, ListingCardSkeleton } from "@/components/listings/listing-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { useFmt } from "@/hooks/use-fmt";

export default function SavedPage() {
  const t = useTranslations("saved");
  const tb = useTranslations("browse");
  const fmt = useFmt();
  const listings = useQuery(api.saves.mine);
  const searches = useQuery(api.savedSearches.mine);
  const areas = useQuery(api.areas.all);
  const remove = useMutation(api.savedSearches.remove);

  const hrefFor = (f: Record<string, unknown>) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) {
      if (v === undefined) continue;
      if (k === "areaId") {
        const a = areas?.find((x) => x._id === v);
        if (a) sp.set("area", a.slug);
      } else sp.set(k, Array.isArray(v) ? v.join(",") : v === true ? "1" : String(v));
    }
    return `/browse?${sp}`;
  };

  return (
    <div className="container-page py-8">
      <h1 className="font-heading text-2xl font-bold">{t("title")}</h1>

      <section className="mt-6">
        <h2 className="mb-3 font-heading text-lg font-semibold">{t("searches")}</h2>
        {searches?.length === 0 && <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">{t("noSearches")}</p>}
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {searches?.map((s) => (
            <li key={s._id} className="flex items-start gap-3 rounded-2xl border bg-card p-4 shadow-soft">
              <BellRing className="mt-0.5 size-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{s.name}</p>
                <p className="text-xs text-muted-foreground">
                  {s.notifyVia === "email" ? tb("email") : tb("push")} · {t("lastAlert", { time: fmt.ago(s.lastNotifiedAt) })}
                </p>
                <Link href={hrefFor(s.filters)} className={buttonVariants({ variant: "outline", size: "sm", className: "mt-2" })}>
                  <Search /> {t("run")}
                </Link>
              </div>
              <Button variant="ghost" size="icon-sm" aria-label={t("delete")} onClick={() => remove({ id: s._id })}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="mb-3 font-heading text-lg font-semibold">{t("listings")}</h2>
        {listings?.length === 0 && <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">{t("noListings")}</p>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {listings === undefined ? Array.from({ length: 4 }, (_, i) => <ListingCardSkeleton key={i} />) : listings.map((l) => <ListingCard key={l._id} l={l} saved />)}
        </div>
      </section>
    </div>
  );
}
