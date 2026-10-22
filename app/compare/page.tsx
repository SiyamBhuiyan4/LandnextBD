"use client";

import { useQuery } from "convex/react";
import { BadgeCheck, Check, GitCompareArrows, Minus, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCompare } from "@/components/providers";
import { Button, buttonVariants } from "@/components/ui/button";
import { useFmt } from "@/hooks/use-fmt";
import { areaLabel, districtName } from "@/lib/places";
import { pricePerUnit } from "@/lib/units";
import { listingHref } from "@/lib/urls";
import { cn } from "@/lib/utils";

function CompareInner() {
  const t = useTranslations("compare");
  const tl = useTranslations("landType");
  const tf = useTranslations("facing");
  const tu = useTranslations("utilities");
  const tfa = useTranslations("facilities");
  const ts = useTranslations("sellerType");
  const tls = useTranslations("landStatus");
  const tc = useTranslations("common");
  const fmt = useFmt();
  const sp = useSearchParams();
  const { ids: stored, toggle, clear } = useCompare();
  const ids = (sp.get("ids")?.split(",").filter(Boolean) ?? stored).slice(0, 3) as Id<"listings">[];
  const rows = useQuery(api.listings.getMany, ids.length ? { ids } : "skip");

  if (!ids.length || rows?.length === 0)
    return (
      <div className="mt-8 grid place-items-center rounded-3xl border border-dashed bg-surface px-6 py-16 text-center">
        <span className="grid size-16 place-items-center rounded-2xl bg-card text-primary shadow-elev-1">
          <GitCompareArrows className="size-8" aria-hidden />
        </span>
        <p className="mt-4 max-w-sm text-muted-foreground">{t("empty")}</p>
        <Link href="/browse" className={cn(buttonVariants({ size: "lg" }), "mt-6 h-11 rounded-xl")}>
          {tc("browse")}
        </Link>
      </div>
    );
  if (!rows) return <div className="mt-8 h-96 skeleton rounded-2xl" />;

  const cheapestPerKatha = Math.min(...rows.map((r) => pricePerUnit(r.price, r.sizeSqft, "katha")));
  type Row = NonNullable<typeof rows>[number];
  const line: { label: string; render: (r: Row) => React.ReactNode }[] = [
    { label: t("row.price"), render: (r) => <span className="font-heading font-bold text-primary">{fmt.price(r.price)}</span> },
    { label: t("row.size"), render: (r) => fmt.size(r.sizeValue, r.sizeUnit) },
    {
      label: t("row.pricePerKatha"),
      render: (r) => {
        const v = pricePerUnit(r.price, r.sizeSqft, "katha");
        return <span className={v === cheapestPerKatha && rows.length > 1 ? "font-semibold text-primary" : ""}>{fmt.price(v)}</span>;
      },
    },
    { label: t("row.area"), render: (r) => `${areaLabel(r, fmt.locale)}, ${districtName(r.district, fmt.locale)}` },
    { label: t("row.type"), render: (r) => tl(r.landType) },
    { label: t("row.facing"), render: (r) => (r.facing ? tf(r.facing) : <Minus className="size-4 text-muted-foreground" />) },
    { label: t("row.road"), render: (r) => (r.roadWidthFt ? tc("feet", { n: fmt.digits(r.roadWidthFt) }) : <Minus className="size-4 text-muted-foreground" />) },
    { label: t("row.utilities"), render: (r) => r.utilities.map((u) => tu(u)).join(", ") || "—" },
    { label: t("row.facilities"), render: (r) => r.nearbyFacilities.map((f) => tfa(f)).join(", ") || "—" },
    { label: t("row.documents"), render: (r) => fmt.digits(r.documents.filter((d) => d.verified).length) },
    { label: t("row.status"), render: (r) => tls(r.landStatus) },
    { label: t("row.seller"), render: (r) => ts(r.sellerType) },
    { label: t("row.video"), render: (r) => (r.hasVideo ? <Check className="size-4 text-primary" /> : <Minus className="size-4 text-muted-foreground" />) },
  ];

  return (
    <div className="mt-6 overflow-x-auto rounded-2xl border bg-card shadow-elev-2">
      <table className="w-full min-w-[560px] table-fixed text-sm">
        <thead>
          <tr className="border-b bg-surface">
            <th className="sticky left-0 z-20 w-28 bg-surface p-3 sm:w-36" scope="col">
              <Button variant="ghost" size="sm" onClick={clear}>
                {t("clear")}
              </Button>
            </th>
            {rows.map((r) => (
              <th key={r._id} scope="col" className="p-3 text-left align-top font-normal">
                <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted">
                  {r.coverUrl && <Image src={r.coverUrl} alt="" fill sizes="280px" className="object-cover" />}
                  <button type="button" onClick={() => toggle(r._id)} className="absolute top-2 right-2 grid size-7 place-items-center rounded-full bg-background/90" aria-label={t("remove")}>
                    <X className="size-4" />
                  </button>
                </div>
                <Link href={listingHref(r)} className="mt-2 line-clamp-2 font-semibold hover:underline">
                  {r.title}
                </Link>
                {r.isVerified && <BadgeCheck className="mt-1 size-4 text-primary" aria-label={tc("verified")} />}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {line.map((row) => (
            <tr key={row.label} className="border-b last:border-0 even:bg-muted/30 even:[&>th]:bg-[color-mix(in_oklab,var(--muted)_30%,var(--card))]">
              <th scope="row" className="sticky left-0 z-10 bg-card p-3 text-left text-xs font-medium text-muted-foreground">
                {row.label}
              </th>
              {rows.map((r) => (
                <td key={r._id} className="p-3 align-top">
                  {row.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ComparePage() {
  const t = useTranslations("compare");
  return (
    <div className="container-page py-8">
      <h1 className="font-heading text-2xl font-extrabold tracking-tight sm:text-3xl">{t("title")}</h1>
      <Suspense>
        <CompareInner />
      </Suspense>
    </div>
  );
}
