"use client";

import { Calculator } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFmt } from "@/hooks/use-fmt";

// Rough share of the price that buyers usually pay on top for registration and
// mutation (namjari). Shown as an estimate only; the sub-registry office sets the real amount.
export const REGISTRATION_RATE = 0.04;

export function CostEstimate({ price }: { price: number }) {
  const t = useTranslations("listingDetail");
  const fmt = useFmt();
  const fees = Math.round(price * REGISTRATION_RATE);
  return (
    <aside className="mt-3 rounded-xl border bg-card px-4 py-3 text-sm" aria-labelledby="cost-estimate-title">
      <p id="cost-estimate-title" className="flex items-center gap-2 font-medium">
        <Calculator className="size-4 text-primary" aria-hidden /> {t("costTitle")}
      </p>
      <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 tabular-nums">
        <dt className="text-muted-foreground">{t("costPrice")}</dt>
        <dd>{fmt.price(price, true)}</dd>
        <dt className="text-muted-foreground">{t("costFees", { pct: fmt.digits(REGISTRATION_RATE * 100) })}</dt>
        <dd>{fmt.price(fees, true)}</dd>
        <dt className="border-t pt-1 font-semibold">{t("costTotal")}</dt>
        <dd className="border-t pt-1 font-semibold">{fmt.price(price + fees, true)}</dd>
      </dl>
      <p className="mt-2 text-xs text-muted-foreground">{t("costNote")}</p>
    </aside>
  );
}
