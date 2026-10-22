"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AreaCombobox, type AreaOption } from "@/components/search/area-combobox";
import { Button } from "@/components/ui/button";
import { LAND_TYPES, SIZE_BUCKETS_KATHA, type LandType } from "@/lib/constants";
import { describeBudget, parseBudget } from "@/lib/price-input";
import { toSqft } from "@/lib/units";
import { cn } from "@/lib/utils";

const selectCls =
  "h-12 w-full cursor-pointer rounded-xl border bg-surface px-3 text-[15px] font-medium outline-none transition-colors hover:border-primary/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 lg:border-transparent lg:bg-transparent lg:hover:bg-surface";

export function HeroSearch() {
  const t = useTranslations("home");
  const tl = useTranslations("landType");
  const tsz = useTranslations("sizeBucket");
  const tc = useTranslations("common");
  const router = useRouter();
  const [area, setArea] = useState<AreaOption | null>(null);
  const [type, setType] = useState<LandType | "">("");
  const [price, setPrice] = useState("");
  const parsedBudget = parseBudget(price);
  const [size, setSize] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const sp = new URLSearchParams();
    if (area) sp.set("area", area.slug);
    if (type) sp.set("landType", type);
    const budget = parseBudget(price);
    if (budget) sp.set("maxPrice", String(budget));
    const sb = SIZE_BUCKETS_KATHA.find((b) => b.key === size);
    if (sb?.min) sp.set("minSqft", String(toSqft(sb.min, "katha")));
    if (sb?.max) sp.set("maxSqft", String(toSqft(sb.max, "katha")));
    router.push(`/browse?${sp}`);
  };

  const field = (label: string, htmlFor: string, child: React.ReactNode, className?: string) => (
    <div className={cn("flex min-w-0 flex-col gap-1 rounded-xl px-1 pt-1 lg:px-3", className)}>
      <label htmlFor={htmlFor} className="px-0.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </label>
      {child}
    </div>
  );

  return (
    <form
      onSubmit={submit}
      className="grid grid-cols-2 gap-x-2 gap-y-2.5 rounded-2xl border border-white/20 bg-card p-3 text-card-foreground shadow-elev-4 sm:gap-3 sm:p-4 lg:grid-cols-[1.7fr_1fr_1fr_1fr_auto] lg:items-end lg:gap-0 lg:divide-x lg:divide-border lg:p-3"
      role="search"
    >
      {field(
        t("searchArea"),
        "hero-area",
        <AreaCombobox id="hero-area" value={area} onChange={setArea} placeholder={t("searchPlaceholder")} inputClassName="h-12 bg-surface font-medium hover:border-primary/40 lg:border-transparent lg:bg-transparent lg:hover:bg-surface" />,
        "col-span-2 lg:col-span-1 lg:pl-1",
      )}
      {field(
        t("searchType"),
        "hero-type",
        <select id="hero-type" className={selectCls} value={type} onChange={(e) => setType(e.target.value as LandType | "")}>
          <option value="">{t("anyType")}</option>
          {LAND_TYPES.map((lt) => (
            <option key={lt} value={lt}>
              {tl(lt)}
            </option>
          ))}
        </select>,
        "col-span-2 sm:col-span-1",
      )}
      {field(
        t("searchBudget"),
        "hero-price",
        <div className="relative">
          <input
            id="hero-price"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            className={cn(selectCls, "cursor-text")}
            placeholder={t("budgetPlaceholder")}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            aria-describedby="hero-price-hint"
          />
          <span id="hero-price-hint" className="sr-only">
            {t("budgetHint")}
          </span>
          {parsedBudget && (
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-primary">
              {describeBudget(parsedBudget)}
            </span>
          )}
        </div>,
      )}
      {field(
        t("searchSize"),
        "hero-size",
        <select id="hero-size" className={selectCls} value={size} onChange={(e) => setSize(e.target.value)}>
          <option value="">{t("anySize")}</option>
          {SIZE_BUCKETS_KATHA.map((b) => (
            <option key={b.key} value={b.key}>
              {tsz(b.key)}
            </option>
          ))}
        </select>,
      )}
      <div className="col-span-2 sm:col-span-1 sm:self-end lg:border-0 lg:pl-3">
        <Button type="submit" className="h-12 w-full gap-2 rounded-xl px-7 text-base font-semibold shadow-elev-2">
          <Search className="size-4.5" /> {tc("search")}
        </Button>
      </div>
    </form>
  );
}
