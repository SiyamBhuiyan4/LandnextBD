"use client";

import { useQuery } from "convex/react";
import { ChevronLeft, ChevronRight, Globe2, MapPin, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useFmt } from "@/hooks/use-fmt";
import type { BrowseFilters } from "@/lib/urls";
import { districtName, divisionName } from "@/lib/places";
import { cn } from "@/lib/utils";

type Sel = Pick<BrowseFilters, "division" | "district" | "area">;

/**
 * Drill-down location picker (Division → District → Area) with counts and a quick search,
 * similar to classifieds sites. Commits a single level: division, district or area.
 */
export function LocationPicker({ value, onChange }: { value: Sel; onChange: (v: Sel) => void }) {
  const t = useTranslations("browse");
  const tc = useTranslations("common");
  const locale = useLocale();
  const fmt = useFmt();
  const tree = useQuery(api.areas.hierarchy);
  const [open, setOpen] = useState(false);
  const [division, setDivision] = useState<string | null>(null);
  const [district, setDistrict] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const allAreas = useMemo(() => (tree ?? []).flatMap((d) => d.districts.flatMap((x) => x.areas)), [tree]);
  const areaName = (a: { areaName: string; areaNameBn?: string }) => (locale === "bn" && a.areaNameBn ? a.areaNameBn : a.areaName);
  const currentArea = allAreas.find((a) => a.slug === value.area);
  const dn = (d: string) => districtName(d, locale);
  const vn = (d: string) => divisionName(d, locale);
  const label = currentArea
    ? `${areaName(currentArea)}, ${dn(currentArea.district)}`
    : value.district
      ? dn(value.district)
      : value.division
        ? vn(value.division)
        : t("allBangladesh");

  const commit = (v: Sel) => {
    onChange({ division: undefined, district: undefined, area: undefined, ...v });
    setOpen(false);
  };
  const openPicker = () => {
    const divOfDistrict = value.district ? tree?.find((d) => d.districts.some((x) => x.name === value.district))?.name : undefined;
    setDivision(currentArea?.division ?? value.division ?? divOfDistrict ?? null);
    setDistrict(currentArea?.district ?? value.district ?? null);
    setQ("");
    setOpen(true);
  };

  const div = tree?.find((d) => d.name === division);
  const dist = div?.districts.find((d) => d.name === district);
  const query = q.trim().toLowerCase();
  const matches = query ? allAreas.filter((a) => a.areaName.toLowerCase().includes(query) || a.areaNameBn?.includes(q.trim()) || a.district.toLowerCase().includes(query) || dn(a.district).includes(q.trim())).slice(0, 30) : [];

  const row = (key: string, text: string, count: number, onClick: () => void, opts: { drill?: boolean; active?: boolean; sub?: string; strong?: boolean } = {}) => (
    <li key={key}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted",
          opts.active && "bg-secondary font-semibold text-secondary-foreground",
          opts.strong && "font-semibold text-primary",
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate">{text}</span>
          {opts.sub && <span className="block truncate text-xs text-muted-foreground">{opts.sub}</span>}
        </span>
        <span className="rounded-full bg-muted px-2 text-xs text-muted-foreground tabular-nums">{fmt.digits(count)}</span>
        {opts.drill && <ChevronRight className="size-4 text-muted-foreground" aria-hidden />}
      </button>
    </li>
  );

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        className="flex h-11 w-full items-center gap-2 rounded-xl border bg-background px-3 text-left text-sm transition-colors hover:border-primary/50"
        aria-haspopup="dialog"
      >
        <MapPin className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] leading-none text-muted-foreground">{t("pickLocation")}</span>
          <span className="mt-0.5 block truncate font-semibold">{label}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[min(36rem,85vh)] flex-col gap-0 p-0 sm:max-w-md">
          <div className="border-b p-4 pb-3">
            <DialogTitle className="flex items-center gap-2 font-heading">
              {(division || district) && !query && (
                <button
                  type="button"
                  className="-ml-1 grid size-8 place-items-center rounded-full hover:bg-muted"
                  aria-label={tc("back")}
                  onClick={() => (district ? setDistrict(null) : setDivision(null))}
                >
                  <ChevronLeft className="size-4" />
                </button>
              )}
              {query ? t("pickLocation") : district ? dn(district) : division ? vn(division) : t("pickLocation")}
            </DialogTitle>
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("searchAreaPlaceholder")}
                aria-label={t("searchAreaPlaceholder")}
                className="h-10 w-full rounded-xl border bg-background pr-3 pl-9 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
              />
            </div>
          </div>
          <ul className="flex-1 overflow-y-auto p-2">
            {tree === undefined && Array.from({ length: 6 }, (_, i) => <li key={i} className="m-1 h-10 animate-pulse rounded-xl bg-muted" />)}
            {query ? (
              matches.length ? (
                matches.map((a) => row(a._id, areaName(a), a.activeCount, () => commit({ area: a.slug }), { sub: `${dn(a.district)}, ${vn(a.division)}`, active: a.slug === value.area }))
              ) : (
                <li className="px-3 py-8 text-center text-sm text-muted-foreground">{t("emptyTitle")}</li>
              )
            ) : dist ? (
              <>
                {row("all", t("allOf", { place: dn(dist.name) }), dist.count, () => commit({ district: dist.name }), { strong: true, active: !value.area && value.district === dist.name })}
                {dist.areas.map((a) => row(a._id, areaName(a), a.activeCount, () => commit({ area: a.slug }), { active: a.slug === value.area }))}
              </>
            ) : div ? (
              <>
                {row("all", t("allOf", { place: vn(div.name) }), div.count, () => commit({ division: div.name }), { strong: true, active: !value.district && !value.area && value.division === div.name })}
                {div.districts.map((d) => row(d.name, dn(d.name), d.count, () => setDistrict(d.name), { drill: true, active: d.name === (currentArea?.district ?? value.district) }))}
              </>
            ) : (
              tree && (
                <>
                  <li>
                    <button
                      type="button"
                      onClick={() => commit({})}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-primary hover:bg-muted",
                        !value.division && !value.district && !value.area && "bg-secondary",
                      )}
                    >
                      <Globe2 className="size-4" aria-hidden /> {t("allBangladesh")}
                    </button>
                  </li>
                  {tree.map((d) => row(d.name, vn(d.name), d.count, () => setDivision(d.name), { drill: true, active: d.name === (currentArea?.division ?? value.division) }))}
                </>
              )
            )}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
