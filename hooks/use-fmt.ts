"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useMemo } from "react";
import { usePrefs } from "@/components/providers";
import { formatBDT, formatNumber, localizeDigits, timeAgo, type Locale } from "@/lib/format";
import { fromSqft, pricePerUnit, trimNumber, type SizeUnit } from "@/lib/units";

/** Locale-aware formatters for prices, sizes, numbers and relative time. */
export function useFmt() {
  const locale = (useLocale() === "bn" ? "bn" : "en") as Locale;
  const { fullPrice } = usePrefs();
  const tu = useTranslations("units");

  const price = useCallback((n: number, full?: boolean) => formatBDT(n, { locale, full: full ?? fullPrice }), [locale, fullPrice]);
  const num = useCallback((n: number, digits = 2) => formatNumber(n, locale, digits), [locale]);
  const digits = useCallback((s: string | number) => localizeDigits(s, locale), [locale]);
  const size = useCallback(
    (value: number, unit: SizeUnit) => `${localizeDigits(trimNumber(value, 2), locale)} ${tu(unit)}`,
    [locale, tu],
  );
  const sizeIn = useCallback((sqft: number, unit: SizeUnit) => size(fromSqft(sqft, unit), unit), [size]);
  const perUnit = useCallback(
    (priceTotal: number, sqft: number, unit: SizeUnit) => formatBDT(pricePerUnit(priceTotal, sqft, unit), { locale, full: fullPrice }),
    [locale, fullPrice],
  );
  const ago = useCallback((ts: number) => timeAgo(ts, locale), [locale]);
  const date = useCallback(
    (ts: number) => new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-GB", { month: "short", year: "numeric" }).format(ts),
    [locale],
  );
  const duration = useCallback(
    (sec?: number) => {
      if (!sec) return "";
      const m = Math.floor(sec / 60);
      const s = Math.round(sec % 60);
      return localizeDigits(`${m}:${String(s).padStart(2, "0")}`, locale);
    },
    [locale],
  );

  return useMemo(
    () => ({ locale, price, num, digits, size, sizeIn, perUnit, ago, date, duration }),
    [locale, price, num, digits, size, sizeIn, perUnit, ago, date, duration],
  );
}
