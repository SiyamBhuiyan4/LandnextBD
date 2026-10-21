"use client";

import { useQuery } from "convex/react";
import { ArrowRight, Pencil, Plus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { BarList, StatTile, TimeSeriesChart } from "@/components/dashboard/charts";
import { PostLandEmpty } from "@/components/dashboard/post-land-empty";
import { StatusChip } from "@/components/dashboard/status-chip";
import { buttonVariants } from "@/components/ui/button";
import { useFmt } from "@/hooks/use-fmt";
import { listingHref } from "@/lib/urls";
import { cn } from "@/lib/utils";

export default function DashboardOverview() {
  const t = useTranslations("dashboard");
  const fmt = useFmt();
  const a = useQuery(api.dashboard.analytics, { days: 30 });
  const mine = useQuery(api.listings.mine);
  if (!a || mine === undefined) return <div className="h-96 animate-pulse rounded-2xl bg-muted" />;
  if (mine.length === 0) return <PostLandEmpty />;
  const mins = (s: number) => `${fmt.digits(Math.round(s / 60))}m`;
  const todo = mine.filter((l) => l.status === "draft" || l.status === "rejected" || l.status === "expired").slice(0, 3);
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-3xl border bg-card p-5 shadow-soft sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <h2 className="font-heading text-xl font-bold">{t("heroTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("heroBody")}</p>
        </div>
        <Link href="/dashboard/listings/new" className={cn(buttonVariants({ size: "lg" }), "h-12 rounded-xl px-6 text-base font-semibold")}>
          <Plus className="size-5" /> {t("postLand")}
        </Link>
      </div>
      {todo.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-heading text-lg font-semibold">{t("needsAttention")}</h2>
          <ul className="grid gap-2 md:grid-cols-3">
            {todo.map((l) => (
              <li key={l._id}>
                <Link href={l.status === "expired" ? "/dashboard/listings" : `/dashboard/listings/${l._id}/edit`} className="flex items-center gap-3 rounded-2xl border bg-card p-3 transition hover:border-primary/50">
                  <div className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-muted">{l.coverUrl && <Image src={l.coverUrl} alt="" fill sizes="56px" className="object-cover" />}</div>
                  <div className="min-w-0 flex-1">
                    <StatusChip status={l.status} />
                    <p className="mt-0.5 truncate text-sm font-medium">{l.title}</p>
                  </div>
                  {l.status === "expired" ? <ArrowRight className="size-4 text-muted-foreground" /> : <Pencil className="size-4 text-muted-foreground" />}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatTile label={t("active")} value={fmt.digits(a.counts.active)} />
        <StatTile label={t("pending")} value={fmt.digits(a.counts.pending)} />
        <StatTile label={t("drafts")} value={fmt.digits(a.counts.drafts)} />
        <StatTile label={t("sold")} value={fmt.digits(a.counts.sold)} />
        <StatTile label={t("newInquiries")} value={fmt.digits(a.counts.newInquiries)} />
      </div>
      <h2 className="font-heading text-lg font-semibold">
        {t("analytics")} · <span className="text-muted-foreground">{t("last30")}</span>
      </h2>
      <div className="grid grid-cols-3 gap-3">
        <StatTile label={t("views")} value={fmt.digits(a.totals.views)} />
        <StatTile label={t("inquiries")} value={fmt.digits(a.totals.inquiries)} />
        <StatTile label={t("watchTime")} value={mins(a.totals.videoWatchSec)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <TimeSeriesChart title={t("views")} data={a.series.map((d) => ({ day: d.day, value: d.views }))} format={(n) => fmt.digits(Math.round(n))} />
        <TimeSeriesChart title={t("inquiries")} data={a.series.map((d) => ({ day: d.day, value: d.inquiries }))} format={(n) => fmt.digits(Math.round(n))} />
        <TimeSeriesChart title={t("watchTime")} data={a.series.map((d) => ({ day: d.day, value: d.videoWatchSec }))} format={mins} />
        {a.top.length ? (
          <div className="space-y-2">
            <BarList title={t("topListings")} rows={a.top.map((x) => ({ label: x.title, value: x.views }))} format={(n) => fmt.digits(n)} />
            <ul className="text-xs text-muted-foreground">
              {a.top.map((x) =>
                x.slug && x.areaSlug && x.landType ? (
                  <li key={x.listingId}>
                    <Link className="hover:text-foreground hover:underline" href={listingHref({ slug: x.slug, areaSlug: x.areaSlug, landType: x.landType })}>
                      {x.title}
                    </Link>{" "}
                    · {fmt.digits(x.inquiries)} {t("inquiries").toLowerCase()}
                  </li>
                ) : null,
              )}
            </ul>
          </div>
        ) : (
          <div className="grid place-items-center rounded-2xl border border-dashed p-8 text-sm text-muted-foreground">{t("noData")}</div>
        )}
      </div>
    </div>
  );
}
