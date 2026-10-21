"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { FacilityIcon, LandTypeIcons, UtilityIcons } from "@/components/icons";
import { LocationPicker } from "@/components/search/location-picker";
import { Slider } from "@/components/ui/slider";
import { useFmt } from "@/hooks/use-fmt";
import { FACILITIES, FACINGS, LAND_TYPES, PRICE_SLIDER_MAX, SIZE_SLIDER_MAX_KATHA, UTILITIES } from "@/lib/constants";
import { fromSqft, toSqft } from "@/lib/units";
import type { BrowseFilters } from "@/lib/urls";
import { cn } from "@/lib/utils";

const selectCls = "h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 disabled:opacity-50";

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-b border-dashed py-4 first:pt-0 last:border-0">
      <legend className="mb-2.5 font-heading text-[13px] font-bold tracking-wide">{title}</legend>
      {children}
    </fieldset>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition",
        active ? "border-primary bg-primary text-primary-foreground shadow-elev-1" : "bg-background hover:border-primary/40 hover:bg-secondary/60",
      )}
    >
      {children}
    </button>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1.5 text-sm">
      {label}
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="relative h-5 w-9 rounded-full bg-muted transition peer-checked:bg-primary peer-focus-visible:ring-3 peer-focus-visible:ring-ring/40 after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4" />
    </label>
  );
}

/** Debounced range slider that commits on release. */
function RangeSlider({
  min,
  max,
  step,
  value,
  onCommit,
  format,
  label,
}: {
  min: number;
  max: number;
  step: number;
  value: [number, number];
  onCommit: (v: [number, number]) => void;
  format: (n: number, isMax: boolean) => string;
  label: string;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value[0], value[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="px-1">
      <Slider
        min={min}
        max={max}
        step={step}
        value={local}
        onValueChange={(v) => setLocal(v as [number, number])}
        onValueCommitted={(v) => onCommit(v as [number, number])}
        aria-label={label}
      />
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span>{format(local[0], false)}</span>
        <span>{format(local[1], true)}</span>
      </div>
    </div>
  );
}

export function FilterPanel({
  filters,
  set,
  lockArea,
  lockType,
}: {
  filters: BrowseFilters;
  set: (patch: Partial<BrowseFilters>) => void;
  lockArea?: boolean;
  lockType?: boolean;
}) {
  const t = useTranslations("browse");
  const tl = useTranslations("landType");
  const tf = useTranslations("facing");
  const tu = useTranslations("utilities");
  const tfa = useTranslations("facilities");
  const fmt = useFmt();
  const locale = useLocale();
  const toggleIn = <T extends string>(arr: T[] | undefined, v: T) => (arr?.includes(v) ? arr.filter((x) => x !== v) : [...(arr ?? []), v]);

  return (
    <div className="text-sm">
      {!lockArea && (
        <Group title={t("location")}>
          <LocationPicker value={{ division: filters.division, district: filters.district, area: filters.area }} onChange={(v) => set(v)} />
        </Group>
      )}

      {!lockType && (
        <Group title={t("landType")}>
          <div className="flex flex-wrap gap-1.5">
            {LAND_TYPES.map((lt) => {
              const Icon = LandTypeIcons[lt];
              return (
                <Chip key={lt} active={filters.landType === lt} onClick={() => set({ landType: filters.landType === lt ? undefined : lt })}>
                  <Icon size={14} /> {tl(lt)}
                </Chip>
              );
            })}
          </div>
        </Group>
      )}

      <Group title={t("price")}>
        <RangeSlider
          label={t("price")}
          min={0}
          max={PRICE_SLIDER_MAX}
          step={500_000}
          value={[filters.minPrice ?? 0, filters.maxPrice ?? PRICE_SLIDER_MAX]}
          onCommit={([a, b]) => set({ minPrice: a > 0 ? a : undefined, maxPrice: b < PRICE_SLIDER_MAX ? b : undefined })}
          format={(n, isMax) => (isMax && n >= PRICE_SLIDER_MAX ? `${fmt.price(n, false)}+` : fmt.price(n, false))}
        />
      </Group>

      <Group title={`${t("size")} (${locale === "bn" ? "কাঠা" : "katha"})`}>
        <RangeSlider
          label={t("size")}
          min={0}
          max={SIZE_SLIDER_MAX_KATHA}
          step={1}
          value={[filters.minSqft ? Math.round(fromSqft(filters.minSqft, "katha")) : 0, filters.maxSqft ? Math.round(fromSqft(filters.maxSqft, "katha")) : SIZE_SLIDER_MAX_KATHA]}
          onCommit={([a, b]) => set({ minSqft: a > 0 ? toSqft(a, "katha") : undefined, maxSqft: b < SIZE_SLIDER_MAX_KATHA ? toSqft(b, "katha") : undefined })}
          format={(n, isMax) => `${fmt.digits(n)}${isMax && n >= SIZE_SLIDER_MAX_KATHA ? "+" : ""}`}
        />
      </Group>

      <Group title={t("facing")}>
        <select aria-label={t("facing")} className={selectCls} value={filters.facing ?? ""} onChange={(e) => set({ facing: (e.target.value || undefined) as BrowseFilters["facing"] })}>
          <option value="">{t("anyFacing")}</option>
          {FACINGS.map((f) => (
            <option key={f} value={f}>
              {tf(f)}
            </option>
          ))}
        </select>
      </Group>

      <Group title={t("roadWidth")}>
        <div className="flex flex-wrap gap-1.5">
          {[undefined, 12, 20, 30, 40, 60].map((w) => (
            <Chip key={w ?? 0} active={filters.minRoadWidth === w} onClick={() => set({ minRoadWidth: w })}>
              {w ? t("feet", { n: fmt.digits(w) }) : t("anyRoad")}
            </Chip>
          ))}
        </div>
      </Group>

      <Group title={t("filters")}>
        <Toggle label={t("verifiedOnly")} checked={!!filters.verifiedOnly} onChange={(v) => set({ verifiedOnly: v || undefined })} />
        <Toggle label={t("hasVideo")} checked={!!filters.hasVideo} onChange={(v) => set({ hasVideo: v || undefined })} />
        <Toggle label={t("negotiable")} checked={!!filters.negotiable} onChange={(v) => set({ negotiable: v || undefined })} />
      </Group>

      <Group title={t("utilities")}>
        <div className="flex flex-wrap gap-1.5">
          {UTILITIES.map((u) => {
            const Icon = UtilityIcons[u];
            return (
              <Chip key={u} active={!!filters.utilities?.includes(u)} onClick={() => set({ utilities: toggleIn(filters.utilities, u) })}>
                <Icon size={14} /> {tu(u)}
              </Chip>
            );
          })}
        </div>
      </Group>

      <Group title={t("facilities")}>
        <div className="flex flex-wrap gap-1.5">
          {FACILITIES.map((f) => (
            <Chip key={f} active={!!filters.facilities?.includes(f)} onClick={() => set({ facilities: toggleIn(filters.facilities, f) })}>
              <FacilityIcon facility={f} size={14} /> {tfa(f)}
            </Chip>
          ))}
        </div>
      </Group>
    </div>
  );
}
