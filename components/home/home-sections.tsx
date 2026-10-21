"use client";

import { useQuery } from "convex/react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, BadgeCheck, ChevronLeft, ChevronRight, Clapperboard, FileCheck2, LayoutList, MapPin, PlayCircle, Plus, ShieldCheck } from "lucide-react";
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

function Section({
  title,
  subtitle,
  href,
  actions,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const t = useTranslations("common");
  return (
    <section className={cn("container-page mt-16 sm:mt-20", className)}>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-heading text-2xl font-extrabold tracking-tight sm:text-[1.75rem]">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground sm:text-base">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {href && (
            <Link href={href} className="group inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm font-semibold text-primary hover:bg-secondary">
              {t("viewAll")} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

/** Fade-up on first view; static when the user prefers reduced motion. */
function Reveal({ children, delay = 0, className, as = "div" }: { children: ReactNode; delay?: number; className?: string; as?: "div" | "li" }) {
  const reduce = useReducedMotion();
  const M = as === "li" ? motion.li : motion.div;
  return (
    <M
      className={className}
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={reduce ? { duration: 0 } : { duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </M>
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
    { label: t("statActive"), value: s?.activeListings, Icon: LayoutList },
    { label: t("statAreas"), value: s?.areasCovered, Icon: MapPin },
    { label: t("statVerified"), value: s?.verifiedListings, Icon: BadgeCheck },
    { label: t("statVideos"), value: s?.videos, Icon: PlayCircle },
  ];
  return (
    <div className="container-page relative z-10 -mt-10">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border shadow-elev-3 sm:grid-cols-4">
        {items.map(({ label, value, Icon }) => (
          <div key={label} className="flex items-center gap-3 bg-card px-4 py-4 sm:px-5">
            <span className="hidden size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary sm:grid">
              <Icon className="size-5" aria-hidden />
            </span>
            <div className="flex flex-col-reverse">
              <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
              <dd className="font-heading text-2xl font-extrabold tracking-tight text-price tabular-nums">
                {value === undefined ? <span className="inline-block h-7 w-12 animate-pulse rounded bg-muted" /> : fmt.digits(value)}
              </dd>
            </div>
          </div>
        ))}
      </dl>
    </div>
  );
}

const CATEGORIES: LandType[] = ["residential", "commercial", "farmland", "industrial", "mixed_use", "quarry"];

export function Categories() {
  const t = useTranslations("home");
  const tl = useTranslations("landType");
  const th = useTranslations("landTypeHint");
  return (
    <Section title={t("categories")}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {CATEGORIES.map((lt, i) => {
          const Icon = LandTypeIcons[lt];
          return (
            <Reveal key={lt} delay={i * 0.04}>
              <Link
                href={`/browse?landType=${lt}`}
                className="group elev-hover relative flex h-full flex-col gap-4 overflow-hidden rounded-2xl border bg-card p-4 shadow-elev-1 hover:border-primary/40 sm:p-5"
              >
                <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-secondary to-surface-2 text-primary ring-1 ring-primary/10 transition-colors group-hover:from-primary group-hover:to-primary group-hover:text-primary-foreground">
                  <Icon size={26} />
                </span>
                <span>
                  <span className="flex items-center justify-between gap-1 font-heading font-bold">
                    {tl(lt)}
                    <ArrowRight className="size-4 -translate-x-1 text-primary opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100" aria-hidden />
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{th(lt)}</span>
                </span>
              </Link>
            </Reveal>
          );
        })}
      </div>
    </Section>
  );
}

export function FeaturedCarousel() {
  const t = useTranslations("home");
  const tc = useTranslations("common");
  const rows = useQuery(api.listings.featured, { limit: 12 });
  const saved = useSavedSet();
  const scroller = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => scroller.current?.scrollBy({ left: dir * scroller.current.clientWidth * 0.9, behavior: "smooth" });
  if (rows?.length === 0) return null;
  const nav = (
    <div className="hidden gap-1.5 sm:flex">
      <button type="button" onClick={() => scroll(-1)} className={cn(buttonVariants({ variant: "outline", size: "icon" }), "rounded-full")} aria-label={tc("previous")}>
        <ChevronLeft />
      </button>
      <button type="button" onClick={() => scroll(1)} className={cn(buttonVariants({ variant: "outline", size: "icon" }), "rounded-full")} aria-label={tc("next")}>
        <ChevronRight />
      </button>
    </div>
  );
  return (
    <Section title={t("featured")} href="/browse?sort=newest" actions={nav}>
      <div ref={scroller} className="scrollbar-none -mx-4 -my-3 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 py-3">
        {(rows ?? Array.from({ length: 4 }, () => null)).map((l, i) => (
          <div key={l?._id ?? i} className="w-[84%] shrink-0 snap-start sm:w-[calc(50%-0.5rem)] lg:w-[calc(25%-0.75rem)]">
            {l ? <ListingCard l={l} saved={saved.has(l._id)} priority={i < 2} /> : <ListingCardSkeleton />}
          </div>
        ))}
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
        {(rows ?? Array.from({ length: 8 }, () => null)).map((l, i) => (
          <div key={l?._id ?? i} className={cn(i >= 4 && "hidden sm:block")}>
            {l ? <ListingCard l={l} saved={saved.has(l._id)} /> : <ListingCardSkeleton />}
          </div>
        ))}
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
              <div key={i} className="aspect-video w-64 shrink-0 animate-pulse rounded-xl bg-muted sm:w-72" />
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
          <Link key={s._id} href={`/seller/${s._id}`} className="elev-hover flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-elev-1 hover:border-primary/30">
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-brand-deep font-heading text-lg font-bold text-primary-foreground ring-2 ring-card">{s.name.slice(0, 1)}</span>
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
    <Section title={t("popularAreas")} href="/browse">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tree === undefined
          ? Array.from({ length: 8 }, (_, i) => <div key={i} className="h-[76px] animate-pulse rounded-2xl bg-muted" />)
          : areas.map((a, i) => (
              <Reveal key={a._id} delay={i * 0.03}>
                <Link
                  href={`/land/${a.slug}`}
                  className="group elev-hover flex h-full items-center gap-3 rounded-2xl border bg-card p-3.5 shadow-elev-1 hover:border-primary/40 sm:p-4"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
                    <MapPin className="size-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-heading font-bold">{locale === "bn" && a.areaNameBn ? a.areaNameBn : a.areaName}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {a.district} · {t("listingsCount", { count: fmt.digits(a.activeCount) })}
                    </span>
                  </span>
                  <ArrowRight className="hidden size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary sm:block" aria-hidden />
                </Link>
              </Reveal>
            ))}
      </div>
    </Section>
  );
}

export function TrustSection() {
  const t = useTranslations("home");
  const trust = [
    { Icon: ShieldCheck, title: t("trustVerifiedTitle"), body: t("trustVerifiedBody") },
    { Icon: FileCheck2, title: t("trustDocsTitle"), body: t("trustDocsBody") },
    { Icon: Clapperboard, title: t("trustVideoTitle"), body: t("trustVideoBody") },
  ];
  const steps = [
    { title: t("howStep1Title"), body: t("howStep1Body") },
    { title: t("howStep2Title"), body: t("howStep2Body") },
    { title: t("howStep3Title"), body: t("howStep3Body") },
  ];
  const fmt = useFmt();
  return (
    <section className="mt-16 border-y bg-surface py-14 sm:mt-20 sm:py-20">
      <div className="container-page">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-heading text-2xl font-extrabold tracking-tight sm:text-3xl">{t("trustTitle")}</h2>
          <p className="mt-2 text-muted-foreground">{t("trustSubtitle")}</p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {trust.map(({ Icon, title, body }, i) => (
            <Reveal key={title} delay={i * 0.06} className="h-full">
              <div className="h-full rounded-2xl border bg-card p-6 shadow-elev-1">
                <span className="grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-elev-2">
                  <Icon className="size-6" aria-hidden />
                </span>
                <h3 className="mt-4 font-heading text-lg font-bold">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <h3 className="mt-14 text-center font-heading text-xl font-bold">{t("howTitle")}</h3>
        <ol className="mt-6 grid gap-4 md:grid-cols-3">
          {steps.map((s, i) => (
            <Reveal key={s.title} delay={i * 0.06} as="li" className="flex gap-4 rounded-2xl p-2">
                <span className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-warm font-heading font-extrabold text-foreground" aria-hidden>
                  {fmt.digits(i + 1)}
                </span>
                <span>
                  <span className="block font-heading font-bold">{s.title}</span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">{s.body}</span>
                </span>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function SellCta() {
  const t = useTranslations("home");
  return (
    <section className="container-page mt-16 sm:mt-20">
      <div className="relative isolate overflow-hidden rounded-3xl bg-brand-deep px-6 py-10 text-brand-deep-foreground shadow-elev-3 sm:px-12 sm:py-14">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(40rem_20rem_at_100%_0%,color-mix(in_oklch,var(--warm)_35%,transparent),transparent_70%)]" aria-hidden />
        <div className="bg-noise absolute inset-0 -z-10 opacity-60 mix-blend-overlay" aria-hidden />
        <svg className="absolute -right-8 -bottom-12 -z-10 h-64 w-64 text-warm opacity-25 sm:right-10" viewBox="0 0 200 200" aria-hidden>
          <path d="M20 140 100 100l80 40-80 40-80-40Z" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="8 6" />
          <path d="M20 100 100 60l80 40-80 40-80-40Z" fill="currentColor" />
          <path d="M100 60V20" stroke="currentColor" strokeWidth="3" />
          <path d="M100 20l24 9-24 9Z" fill="currentColor" />
        </svg>
        <p className="text-xs font-semibold tracking-wide text-warm uppercase">{t("ctaFree")}</p>
        <h2 className="mt-2 font-heading text-3xl font-extrabold tracking-tight sm:text-4xl">{t("ctaTitle")}</h2>
        <p className="mt-3 max-w-xl text-brand-deep-foreground/80">{t("ctaBody")}</p>
        <Link href="/dashboard/listings/new" className={cn(buttonVariants({ size: "lg" }), "mt-7 h-12 gap-2 rounded-xl bg-warm px-6 text-base font-semibold text-warm-foreground shadow-elev-2 hover:bg-warm/90")}>
          <Plus className="size-5" /> {t("ctaButton")}
        </Link>
      </div>
    </section>
  );
}
