"use client";

import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import { ArrowRight, BadgeCheck, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { LandTypeIcons } from "@/components/icons";
import { ListingCard, ListingCardSkeleton } from "@/components/listings/listing-card";
import { buttonVariants } from "@/components/ui/button";
import { VideoThumb } from "@/components/video/video-card";
import { VideoGalleryDialog } from "@/components/video/video-gallery";
import { useFmt } from "@/hooks/use-fmt";
import type { LandType } from "@/lib/constants";
import { cn } from "@/lib/utils";

function Section({ title, href, children, className }: { title: string; href?: string; children: ReactNode; className?: string }) {
  const t = useTranslations("common");
  return (
    <section className={cn("container-page mt-14", className)}>
      <div className="mb-5 flex items-end justify-between gap-4">
        <h2 className="font-heading text-2xl font-bold tracking-tight">{title}</h2>
        {href && (
          <Link href={href} className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
            {t("viewAll")} <ArrowRight className="size-4" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function useSavedSet() {
  const ids = useQuery(api.saves.mySavedIds);
  return new Set<string>(ids ?? []);
}

export function StatsStrip() {
  const s = useQuery(api.listings.stats);
  const t = useTranslations("home");
  const fmt = useFmt();
  const items = [
    { label: t("statActive"), value: s?.activeListings },
    { label: t("statAreas"), value: s?.areasCovered },
    { label: t("statVerified"), value: s?.verifiedListings },
    { label: t("statVideos"), value: s?.videos },
  ];
  return (
    <div className="container-page -mt-6 relative z-10">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border shadow-soft sm:grid-cols-4">
        {items.map((i) => (
          <div key={i.label} className="bg-card px-5 py-4">
            <dt className="text-xs font-medium text-muted-foreground">{i.label}</dt>
            <dd className="mt-1 font-heading text-2xl font-bold text-primary">{i.value === undefined ? <span className="inline-block h-7 w-12 animate-pulse rounded bg-muted" /> : fmt.digits(i.value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const CATEGORIES: LandType[] = ["residential", "commercial", "farmland", "industrial", "mixed_use"];

export function Categories() {
  const t = useTranslations("home");
  const tl = useTranslations("landType");
  const th = useTranslations("landTypeHint");
  return (
    <Section title={t("categories")}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {CATEGORIES.map((lt, i) => {
          const Icon = LandTypeIcons[lt];
          return (
            <motion.div key={lt} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}>
              <Link
                href={`/browse?landType=${lt}`}
                className="group flex h-full flex-col gap-3 rounded-2xl border bg-card p-4 shadow-soft transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
              >
                <span className="grid size-11 place-items-center rounded-xl bg-secondary text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon size={24} />
                </span>
                <span>
                  <span className="block font-heading font-semibold">{tl(lt)}</span>
                  <span className="text-xs text-muted-foreground">{th(lt)}</span>
                </span>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </Section>
  );
}

export function FeaturedCarousel() {
  const t = useTranslations("home");
  const rows = useQuery(api.listings.featured, { limit: 12 });
  const saved = useSavedSet();
  const scroller = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => scroller.current?.scrollBy({ left: dir * scroller.current.clientWidth * 0.9, behavior: "smooth" });
  if (rows?.length === 0) return null;
  return (
    <Section title={t("featured")} href="/browse?sort=newest">
      <div className="relative">
        <div ref={scroller} className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2">
          {(rows ?? Array.from({ length: 4 }, () => null)).map((l, i) => (
            <div key={l?._id ?? i} className="w-[82%] shrink-0 snap-start sm:w-[45%] lg:w-[23.5%]">
              {l ? <ListingCard l={l} saved={saved.has(l._id)} priority={i < 2} /> : <ListingCardSkeleton />}
            </div>
          ))}
        </div>
        <div className="mt-3 hidden justify-end gap-2 sm:flex">
          <button type="button" onClick={() => scroll(-1)} className={buttonVariants({ variant: "outline", size: "icon" })} aria-label="Previous">
            <ChevronLeft />
          </button>
          <button type="button" onClick={() => scroll(1)} className={buttonVariants({ variant: "outline", size: "icon" })} aria-label="Next">
            <ChevronRight />
          </button>
        </div>
      </div>
    </Section>
  );
}

export function NewestGrid() {
  const t = useTranslations("home");
  const rows = useQuery(api.listings.newest, { limit: 8 });
  const saved = useSavedSet();
  return (
    <Section title={t("newest")} href="/browse">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(rows ?? Array.from({ length: 8 }, () => null)).map((l, i) => (l ? <ListingCard key={l._id} l={l} saved={saved.has(l._id)} /> : <ListingCardSkeleton key={i} />))}
      </div>
    </Section>
  );
}

export function VideosStrip() {
  const t = useTranslations("home");
  const latest = useQuery(api.videos.latest, { limit: 10 });
  const continueWatching = useQuery(api.videos.continueWatching);
  const [open, setOpen] = useState<{ listingId: Id<"listings">; videoId: Id<"videos"> } | null>(null);
  return (
    <>
      {continueWatching && continueWatching.length > 0 && (
        <Section title={t("continueWatching")}>
          <div className="scrollbar-none -mx-4 flex gap-4 overflow-x-auto px-4 pb-2">
            {continueWatching.map((v) => (
              <VideoThumb key={v._id} v={v} progressSec={v.progressSec} onClick={() => setOpen({ listingId: v.listingId, videoId: v._id })} className="w-64 shrink-0" />
            ))}
          </div>
        </Section>
      )}
      <Section title={t("latestVideos")} href="/videos">
        <div className="scrollbar-none -mx-4 flex gap-4 overflow-x-auto px-4 pb-2">
          {(latest ?? Array.from({ length: 4 }, () => null)).map((v, i) =>
            v ? (
              <VideoThumb key={v._id} v={v} onClick={() => setOpen({ listingId: v.listingId, videoId: v._id })} className="w-64 shrink-0 sm:w-72" />
            ) : (
              <div key={i} className="aspect-video w-64 shrink-0 animate-pulse rounded-xl bg-muted" />
            ),
          )}
        </div>
      </Section>
      <VideoGalleryDialog listingId={open?.listingId ?? null} initialVideoId={open?.videoId} open={!!open} onOpenChange={(o) => !o && setOpen(null)} />
    </>
  );
}

export function VerifiedSellers() {
  const t = useTranslations("home");
  const tl = useTranslations("listing");
  const ts = useTranslations("sellerType");
  const rows = useQuery(api.users.verifiedSellers, { limit: 8 });
  const fmt = useFmt();
  if (rows?.length === 0) return null;
  return (
    <Section title={t("verifiedSellers")}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(rows ?? []).map((s) => (
          <Link key={s._id} href={`/seller/${s._id}`} className="flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-soft transition hover:shadow-md">
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-secondary font-heading text-lg font-bold text-primary">{s.name.slice(0, 1)}</span>
            <span className="min-w-0">
              <span className="flex items-center gap-1 font-semibold">
                <span className="truncate">{s.name}</span> <BadgeCheck className="size-4 shrink-0 text-primary" aria-label="Verified" />
              </span>
              <span className="block text-xs text-muted-foreground">
                {ts(s.accountType)} · {t("activeListings", { count: fmt.digits(s.activeListings) })}
              </span>
              <span className="block text-xs text-muted-foreground">{s.responseRate !== null ? tl("responseRate", { rate: fmt.digits(s.responseRate) }) : tl("noResponseData")}</span>
            </span>
          </Link>
        ))}
      </div>
    </Section>
  );
}

export function PopularAreas() {
  const t = useTranslations("home");
  const locale = useLocale();
  const tree = useQuery(api.areas.hierarchy);
  const fmt = useFmt();
  const areas = (tree ?? []).flatMap((d) => d.districts.flatMap((x) => x.areas)).sort((a, b) => b.activeCount - a.activeCount).slice(0, 8);
  return (
    <Section title={t("popularAreas")}>
      <div className="flex flex-wrap gap-2">
        {areas.map((a) => (
          <Link key={a._id} href={`/land/${a.slug}`} className="inline-flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm font-medium shadow-soft transition hover:border-primary/50 hover:text-primary">
            <MapPin className="size-4 text-primary" />
            {locale === "bn" && a.areaNameBn ? a.areaNameBn : a.areaName}
            <span className="rounded-full bg-secondary px-2 text-xs text-secondary-foreground">{fmt.digits(a.activeCount)}</span>
          </Link>
        ))}
      </div>
    </Section>
  );
}

export function SellCta() {
  const t = useTranslations("home");
  return (
    <section className="container-page mt-16">
      <div className="relative overflow-hidden rounded-3xl bg-primary px-6 py-10 text-primary-foreground sm:px-12">
        <svg className="absolute -right-10 -bottom-10 h-56 w-56 opacity-15" viewBox="0 0 200 200" aria-hidden>
          <path d="M20 140 100 100l80 40-80 40-80-40Z" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="8 6" />
          <path d="M20 100 100 60l80 40-80 40-80-40Z" fill="currentColor" />
        </svg>
        <h2 className="font-heading text-2xl font-bold sm:text-3xl">{t("ctaTitle")}</h2>
        <p className="mt-2 max-w-xl text-primary-foreground/85">{t("ctaBody")}</p>
        <Link href="/dashboard/listings/new" className={cn(buttonVariants({ size: "lg" }), "mt-6 bg-warm px-5 text-warm-foreground hover:bg-warm/90")}>
          {t("ctaButton")} <ArrowRight />
        </Link>
      </div>
    </section>
  );
}
