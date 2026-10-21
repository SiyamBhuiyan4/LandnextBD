"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { BarList, StatTile, TimeSeriesChart } from "@/components/dashboard/charts";
import { useFmt } from "@/hooks/use-fmt";

export default function AdminOverview() {
  const t = useTranslations("admin");
  const tst = useTranslations("status");
  const tr = useTranslations("account.roles");
  const td = useTranslations("dashboard");
  const fmt = useFmt();
  const o = useQuery(api.admin.overview);
  if (!o) return <div className="h-96 animate-pulse rounded-2xl bg-muted" />;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Link href="/admin/review">
          <StatTile label={t("queue")} value={fmt.digits(o.byStatus.pending_review ?? 0)} />
        </Link>
        <Link href="/admin/reports">
          <StatTile label={t("openReports")} value={fmt.digits(o.openReports)} />
        </Link>
        <Link href="/admin/videos">
          <StatTile label={t("pendingVideos")} value={fmt.digits(o.pendingVideos)} />
        </Link>
        <Link href="/admin/users">
          <StatTile label={t("pendingSellers")} value={fmt.digits(o.pendingSellers)} />
        </Link>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <BarList title={t("listingsByStatus")} rows={Object.entries(o.byStatus).map(([k, v]) => ({ label: tst(k as never), value: v }))} format={(n) => fmt.digits(n)} />
        <BarList title={t("usersByRole")} rows={Object.entries(o.byRole).map(([k, v]) => ({ label: tr(k as never), value: v }))} format={(n) => fmt.digits(n)} />
        <TimeSeriesChart title={`${td("views")} · ${t("activity")}`} data={o.series.map((d) => ({ day: d.day, value: d.views }))} format={(n) => fmt.digits(Math.round(n))} />
        <TimeSeriesChart title={`${td("inquiries")} · ${t("activity")}`} data={o.series.map((d) => ({ day: d.day, value: d.inquiries }))} format={(n) => fmt.digits(Math.round(n))} />
      </div>
    </div>
  );
}
