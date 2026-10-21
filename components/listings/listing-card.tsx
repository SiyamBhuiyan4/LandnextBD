"use client";

import { useConvexAuth, useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { motion, useReducedMotion } from "framer-motion";
import { BadgeCheck, Camera, GitCompareArrows, Heart, MapPin, PlayCircle, Ruler, Sparkles } from "lucide-react";
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
        "grid size-9 place-items-center rounded-full bg-background/90 text-foreground shadow-elev-2 backdrop-blur transition hover:scale-105 active:scale-95",
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
        active ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
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
  const tli = useTranslations("listing");
  const reduce = useReducedMotion();
  const Icon = LandTypeIcons[l.landType];
  const href = listingHref(l);
  const list = layout === "list";

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={reduce ? { duration: 0 } : { duration: 0.35, ease: "easeOut" }}
      className={cn(
        "group elev-hover relative flex overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-elev-1 hover:border-primary/30 focus-within:ring-2 focus-within:ring-ring",
        list ? "flex-col sm:flex-row" : "flex-col",
      )}
    >
      <div className={cn("relative aspect-[4/3] shrink-0 overflow-hidden bg-muted", list && "sm:aspect-auto sm:min-h-52 sm:w-80")}>
        {l.coverUrl ? (
          <Image
            src={l.coverUrl}
            alt={l.title}
            fill
            sizes={list ? "(min-width: 640px) 320px, 100vw" : "(min-width: 1280px) 25vw, (min-width: 768px) 33vw, (min-width: 640px) 50vw, 100vw"}
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
            placeholder="blur"
            blurDataURL={BLUR}
            priority={priority}
          />
        ) : (
          <div className="grid h-full place-items-center bg-surface-2 text-muted-foreground">
            <Icon size={48} />
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/45 to-transparent" aria-hidden />
        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2.5">
          <div className="flex flex-wrap gap-1.5">
            {l.isFeatured && (
              <span className="inline-flex items-center gap-1 rounded-full bg-warm px-2 py-0.5 text-[11px] font-semibold text-warm-foreground shadow-elev-1">
                <Sparkles className="size-3" aria-hidden /> {tc("featured")}
              </span>
            )}
            {l.isVerified && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground shadow-elev-1">
                <BadgeCheck className="size-3" aria-hidden /> {tc("verified")}
              </span>
            )}
            {l.status === "sold" && <span className="rounded-full bg-foreground px-2 py-0.5 text-[11px] font-semibold text-background">{tst("sold")}</span>}
          </div>
          <SaveButton listingId={l._id} saved={saved} className="relative z-10" />
        </div>
        <div className="absolute inset-x-2.5 bottom-2.5 flex items-center justify-between gap-2 text-[11px] font-medium text-white">
          {l.hasVideo ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-badge-video px-2 py-0.5 backdrop-blur-sm">
              <PlayCircle className="size-3.5" aria-hidden /> {tc("hasVideo")}
            </span>
          ) : (
            <span />
          )}
          {l.imageCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-badge-video px-2 py-0.5 backdrop-blur-sm">
              <Camera className="size-3.5" aria-hidden /> {fmt.digits(l.imageCount)}
              <span className="sr-only">{tc("photos", { count: fmt.digits(l.imageCount) })}</span>
            </span>
          )}
        </div>
      </div>

      <div className={cn("flex flex-1 flex-col p-4", list && "sm:p-5")}>
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-heading text-xl leading-tight font-extrabold tracking-tight text-price">{fmt.price(l.price)}</p>
          {l.negotiable && <span className="shrink-0 text-[11px] font-medium text-muted-foreground">{tc("negotiable")}</span>}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {fmt.perUnit(l.price, l.sizeSqft, "katha")} / {fmt.locale === "bn" ? "কাঠা" : "katha"}
        </p>
        <h3 className={cn("mt-2.5 line-clamp-2 font-heading text-[15px] leading-snug font-semibold", list && "sm:text-base")}>
          <Link href={href} className="after:absolute after:inset-0 after:z-0 focus:outline-none">
            {l.title}
          </Link>
        </h3>
        <p className="mt-1.5 flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin className="size-3.5 shrink-0 text-primary" aria-hidden /> <span className="truncate">{l.areaName}, {l.district}</span>
        </p>
        <div className="mt-3 mb-3.5 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 font-medium text-secondary-foreground">
            <Icon size={13} /> {tl(l.landType)}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold">
            <Ruler className="size-3" aria-hidden /> {fmt.size(l.sizeValue, l.sizeUnit)}
          </span>
          {l.facing && (
            <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-muted-foreground">
              <CompassIcon size={13} /> {tf(l.facing)}
            </span>
          )}
          {l.roadWidthFt && (
            <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-muted-foreground">
              <RoadIcon size={13} /> {fmt.digits(l.roadWidthFt)} ft
            </span>
          )}
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-dashed pt-3">
          <span className="min-w-0 truncate text-[11px] text-muted-foreground">
            {tli("postedAgo", { time: fmt.ago(l.publishedAt) })} · {ts(l.sellerType)}
          </span>
          <CompareToggle id={l._id} className="relative z-10 shrink-0" />
        </div>
      </div>
    </motion.article>
  );
}

export function ListingCardSkeleton({ layout = "grid" }: { layout?: "grid" | "list" }) {
  return (
    <div className={cn("overflow-hidden rounded-2xl border bg-card shadow-elev-1", layout === "list" && "flex flex-col sm:flex-row")} aria-hidden>
      <div className={cn("aspect-[4/3] animate-pulse bg-muted", layout === "list" && "sm:aspect-auto sm:min-h-52 sm:w-80 sm:shrink-0")} />
      <div className="flex-1 space-y-3 p-4">
        <div className="h-6 w-32 animate-pulse rounded-md bg-muted" />
        <div className="h-3 w-20 animate-pulse rounded bg-muted" />
        <div className="h-4 w-full animate-pulse rounded bg-muted" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
        <div className="flex gap-1.5">
          <div className="h-5 w-20 animate-pulse rounded-full bg-muted" />
          <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
        </div>
        <div className="h-px w-full bg-border" />
        <div className="h-6 w-full animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}
