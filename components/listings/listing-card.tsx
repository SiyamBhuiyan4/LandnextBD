"use client";

import { useConvexAuth, useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { motion } from "framer-motion";
import { BadgeCheck, GitCompareArrows, Heart, MapPin, PlayCircle, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CompassIcon, LandTypeIcons, RoadIcon } from "@/components/icons";
import { useCompare } from "@/components/providers";
import { useFmt } from "@/hooks/use-fmt";
import { errorMessage } from "@/lib/client";
import { listingHref } from "@/lib/urls";
import { cn } from "@/lib/utils";

export type ListingCardData = FunctionReturnType<typeof api.listings.search>["page"][number];

export const BLUR =
  "data:image/svg+xml;base64," +
  (typeof btoa === "function" ? btoa : (s: string) => Buffer.from(s).toString("base64"))(
    '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="5"><rect width="8" height="5" fill="#cfdcc4"/><rect y="3" width="8" height="2" fill="#a9bf8f"/></svg>',
  );

export function SaveButton({ listingId, saved, className }: { listingId: Id<"listings">; saved: boolean; className?: string }) {
  const toggle = useMutation(api.saves.toggle).withOptimisticUpdate((store) => {
    const ids = store.getQuery(api.saves.mySavedIds, {});
    if (ids) store.setQuery(api.saves.mySavedIds, {}, saved ? ids.filter((x) => x !== listingId) : [...ids, listingId]);
  });
  const { isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const t = useTranslations("common");
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? t("unsave") : t("save")}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isAuthenticated) return router.push(`/signin?next=${encodeURIComponent(location.pathname + location.search)}`);
        try {
          await toggle({ listingId });
        } catch (err) {
          toast.error(errorMessage(err));
        }
      }}
      className={cn(
        "grid size-9 place-items-center rounded-full bg-background/90 text-foreground shadow-sm backdrop-blur transition hover:scale-105 active:scale-95",
        className,
      )}
    >
      <Heart className={cn("size-4.5", saved && "fill-red-500 text-red-500")} />
    </button>
  );
}

export function CompareToggle({ id, className }: { id: string; className?: string }) {
  const { has, toggle } = useCompare();
  const t = useTranslations("listing");
  const active = has(id);
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!toggle(id)) toast.message(t("compareFull"));
      }}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium transition",
        active ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
        className,
      )}
    >
      <GitCompareArrows className="size-3.5" /> {active ? t("inCompare") : t("addCompare")}
    </button>
  );
}

export function ListingCard({
  l,
  saved = false,
  layout = "grid",
  priority = false,
}: {
  l: ListingCardData;
  saved?: boolean;
  layout?: "grid" | "list";
  priority?: boolean;
}) {
  const fmt = useFmt();
  const tl = useTranslations("landType");
  const tf = useTranslations("facing");
  const ts = useTranslations("sellerType");
  const tc = useTranslations("common");
  const tst = useTranslations("status");
  const Icon = LandTypeIcons[l.landType];
  const href = listingHref(l);
  const list = layout === "list";

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className={cn(
        "group relative overflow-hidden rounded-2xl border bg-card shadow-soft transition-shadow hover:shadow-lg focus-within:ring-2 focus-within:ring-ring",
        list && "flex flex-col sm:flex-row",
      )}
    >
      <div className={cn("relative aspect-[4/3] overflow-hidden bg-muted", list && "sm:aspect-auto sm:w-72 sm:shrink-0")}>
        {l.coverUrl ? (
          <Image
            src={l.coverUrl}
            alt={l.title}
            fill
            sizes={list ? "(min-width: 640px) 288px, 100vw" : "(min-width: 1280px) 25vw, (min-width: 768px) 33vw, (min-width: 640px) 50vw, 100vw"}
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            placeholder="blur"
            blurDataURL={BLUR}
            priority={priority}
          />
        ) : (
          <div className="grid h-full place-items-center text-muted-foreground">
            <Icon size={48} />
          </div>
        )}
        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-2.5">
          <div className="flex flex-wrap gap-1.5">
            {l.isFeatured && (
              <span className="inline-flex items-center gap-1 rounded-full bg-warm px-2 py-0.5 text-[11px] font-semibold text-warm-foreground">
                <Sparkles className="size-3" /> {tc("featured")}
              </span>
            )}
            {l.isVerified && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
                <BadgeCheck className="size-3" /> {tc("verified")}
              </span>
            )}
            {l.status === "sold" && <span className="rounded-full bg-foreground px-2 py-0.5 text-[11px] font-semibold text-background">{tst("sold")}</span>}
          </div>
          <SaveButton listingId={l._id} saved={saved} />
        </div>
        {l.hasVideo && (
          <span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 text-[11px] font-medium text-white">
            <PlayCircle className="size-3.5" /> {tc("hasVideo")}
          </span>
        )}
        {l.imageCount > 1 && (
          <span className="absolute right-2.5 bottom-2.5 rounded-full bg-black/55 px-2 py-0.5 text-[11px] text-white">
            {tc("photos", { count: fmt.digits(l.imageCount) })}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
          <Icon size={15} /> {tl(l.landType)}
          <span className="text-muted-foreground">· {ts(l.sellerType)}</span>
        </div>
        <h3 className="line-clamp-2 font-heading text-[15px] leading-snug font-semibold">
          <Link href={href} className="after:absolute after:inset-0 focus:outline-none">
            {l.title}
          </Link>
        </h3>
        <p className="flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" /> {l.areaName}, {l.district}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{fmt.size(l.sizeValue, l.sizeUnit)}</span>
          {l.facing && (
            <span className="inline-flex items-center gap-1">
              <CompassIcon size={14} /> {tf(l.facing)}
            </span>
          )}
          {l.roadWidthFt && (
            <span className="inline-flex items-center gap-1">
              <RoadIcon size={14} /> {fmt.digits(l.roadWidthFt)} ft
            </span>
          )}
        </div>
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <div>
            <p className="font-heading text-lg font-bold text-foreground">{fmt.price(l.price)}</p>
            <p className="text-[11px] text-muted-foreground">
              {fmt.perUnit(l.price, l.sizeSqft, "katha")}/{fmt.locale === "bn" ? "কাঠা" : "katha"}
              {l.negotiable ? ` · ${tc("negotiable")}` : ""}
            </p>
          </div>
          <div className="relative z-10 flex flex-col items-end gap-1.5">
            <CompareToggle id={l._id} />
            <span className="text-[11px] text-muted-foreground">{fmt.ago(l.publishedAt)}</span>
          </div>
        </div>
      </div>
    </motion.article>
  );
}

export function ListingCardSkeleton({ layout = "grid" }: { layout?: "grid" | "list" }) {
  return (
    <div className={cn("overflow-hidden rounded-2xl border bg-card", layout === "list" && "flex")} aria-hidden>
      <div className={cn("aspect-[4/3] animate-pulse bg-muted", layout === "list" && "w-72 shrink-0")} />
      <div className="flex-1 space-y-3 p-4">
        <div className="h-3 w-24 animate-pulse rounded bg-muted" />
        <div className="h-4 w-full animate-pulse rounded bg-muted" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-5 w-28 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}
