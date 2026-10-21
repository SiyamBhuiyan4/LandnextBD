"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AreaCombobox, type AreaOption } from "@/components/search/area-combobox";
import { Button } from "@/components/ui/button";
import { LAND_TYPES, PRICE_BUCKETS, SIZE_BUCKETS_KATHA, type LandType } from "@/lib/constants";
import { toSqft } from "@/lib/units";

const selectCls =
  "h-11 w-full rounded-xl border bg-background px-3 text-[15px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40";

export function HeroSearch() {
  const t = useTranslations("home");
  const tl = useTranslations("landType");
  const tp = useTranslations("priceBucket");
  const tsz = useTranslations("sizeBucket");
  const tc = useTranslations("common");
  const router = useRouter();
  const [area, setArea] = useState<AreaOption | null>(null);
  const [type, setType] = useState<LandType | "">("");
  const [price, setPrice] = useState("");
  const [size, setSize] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const sp = new URLSearchParams();
    if (area) sp.set("area", area.slug);
    if (type) sp.set("landType", type);
    const pb = PRICE_BUCKETS.find((b) => b.key === price);
    if (pb?.min) sp.set("minPrice", String(pb.min));
    if (pb?.max) sp.set("maxPrice", String(pb.max));
    const sb = SIZE_BUCKETS_KATHA.find((b) => b.key === size);
    if (sb?.min) sp.set("minSqft", String(toSqft(sb.min, "katha")));
    if (sb?.max) sp.set("maxSqft", String(toSqft(sb.max, "katha")));
    router.push(`/browse?${sp}`);
  };

  return (
    <form onSubmit={submit} className="glass grid gap-2.5 rounded-2xl p-3 shadow-xl sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr_auto]" role="search">
      <label className="sr-only" htmlFor="hero-area">
        {t("searchPlaceholder")}
      </label>
      <AreaCombobox id="hero-area" value={area} onChange={setArea} placeholder={t("searchPlaceholder")} className="sm:col-span-2 lg:col-span-1" />
      <select aria-label={tl("residential")} className={selectCls} value={type} onChange={(e) => setType(e.target.value as LandType | "")}>
        <option value="">{t("anyType")}</option>
        {LAND_TYPES.map((lt) => (
          <option key={lt} value={lt}>
            {tl(lt)}
          </option>
        ))}
      </select>
      <select aria-label={t("anyPrice")} className={selectCls} value={price} onChange={(e) => setPrice(e.target.value)}>
        <option value="">{t("anyPrice")}</option>
        {PRICE_BUCKETS.map((b) => (
          <option key={b.key} value={b.key}>
            {tp(b.key)}
          </option>
        ))}
      </select>
      <select aria-label={t("anySize")} className={selectCls} value={size} onChange={(e) => setSize(e.target.value)}>
        <option value="">{t("anySize")}</option>
        {SIZE_BUCKETS_KATHA.map((b) => (
          <option key={b.key} value={b.key}>
            {tsz(b.key)}
          </option>
        ))}
      </select>
      <Button type="submit" className="h-11 gap-2 rounded-xl px-6 text-[15px] sm:col-span-2 lg:col-span-1">
        <Search className="size-4" /> {tc("search")}
      </Button>
    </form>
  );
}
