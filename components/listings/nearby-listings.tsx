"use client";

import { useQuery } from "convex/react";
import { MapPin, Navigation } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ListingCard, ListingCardSkeleton } from "@/components/listings/listing-card";
import { LAND_TYPES, type LandType } from "@/lib/constants";
import { useFmt } from "@/hooks/use-fmt";
import { cn } from "@/lib/utils";

// Mirrors NEARBY_RADII_KM in convex/listings.ts.
const RADII = [5, 10, 20, 40, 80] as const;

/**
 * Land around this plot, by straight-line distance. The buyer picks how far
 * they are willing to look and which kind of land they want.
 */
export function NearbyListings({ listingId, savedIds }: { listingId: Id<"listings">; savedIds?: string[] }) {
  const t = useTranslations("listingDetail");
  const tl = useTranslations("landType");
  const fmt = useFmt();
  const locale = useLocale();
  const [radiusKm, setRadiusKm] = useState<number>(20);
  const [landType, setLandType] = useState<LandType | undefined>(undefined);

  const counts = useQuery(api.listings.nearbyCounts, { listingId, landType });
  const rows = useQuery(api.listings.nearby, { listingId, radiusKm, landType, limit: 8 });

  // The listing has no coordinates, so there is nothing to measure from.
  if (counts === null) return null;

  const chip = "rounded-full border px-3 py-1.5 text-xs font-medium transition hover:border-primary/50 hover:bg-muted";
  const on = "border-primary bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground";

  return (
    <section className="mt-14" aria-labelledby="nearby">
      <h2 id="nearby" className="flex items-center gap-2 font-heading text-xl font-bold sm:text-2xl">
        <Navigation className="size-5 text-primary" aria-hidden /> {t("nearbyTitle")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("nearbyBody")}</p>

      <div className="mt-4 space-y-2.5">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("nearbyRadius")}>
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("nearbyRadius")}</span>
          {RADII.map((r) => (
            <button key={r} type="button" onClick={() => setRadiusKm(r)} aria-pressed={r === radiusKm} className={cn(chip, r === radiusKm && on)}>
              {t("nearbyKm", { n: fmt.digits(r) })}
              {counts?.[r] !== undefined && <span className="ml-1 opacity-70">({fmt.digits(counts[r])})</span>}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("nearbyType")}>
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("nearbyType")}</span>
          <button type="button" onClick={() => setLandType(undefined)} aria-pressed={landType === undefined} className={cn(chip, landType === undefined && on)}>
            {t("nearbyAnyType")}
          </button>
          {LAND_TYPES.map((lt) => (
            <button key={lt} type="button" onClick={() => setLandType(lt)} aria-pressed={lt === landType} className={cn(chip, lt === landType && on)}>
              {tl(lt)}
            </button>
          ))}
        </div>
      </div>

      {rows === undefined ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <ListingCardSkeleton key={i} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-5 rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("nearbyEmpty", { n: fmt.digits(radiusKm) })}
        </p>
      ) : (
        <ul className="stagger-in mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {rows.map((r) => (
            <li key={r._id} className="flex flex-col gap-1.5">
              <ListingCard l={r} saved={!!savedIds?.includes(r._id)} />
              <p className="flex items-center gap-1 px-1 text-xs font-medium text-muted-foreground">
                <MapPin className="size-3.5 text-primary" aria-hidden />
                {t("nearbyAway", { km: fmt.digits(r.distanceKm), place: locale === "bn" && r.areaNameBn ? r.areaNameBn : r.areaName })}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
