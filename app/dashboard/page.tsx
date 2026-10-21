"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { BarList, StatTile, TimeSeriesChart } from "@/components/dashboard/charts";
import { useFmt } from "@/hooks/use-fmt";
import { listingHref } from "@/lib/urls";

export default function DashboardOverview() {
  const t = useTranslations("dashboard");
  const fmt = useFmt();
  const a = useQuery(api.dashboard.analytics, { days: 30 });
  if (!a) return <div className="h-96 animate-pulse rounded-2xl bg-muted" />;
  const mins = (s: number) => `${fmt.digits(Math.round(s / 60))}m`;
  return (
    <div className="space-y-6">
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
