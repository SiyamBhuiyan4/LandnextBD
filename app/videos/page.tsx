"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import Link from "next/link";
import { PlayCircle, Wifi } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { LandTypeIcons } from "@/components/icons";
import { Button, buttonVariants } from "@/components/ui/button";
import { VideoThumb } from "@/components/video/video-card";
import { VideoGalleryDialog } from "@/components/video/video-gallery";
import { LAND_TYPES, type LandType } from "@/lib/constants";
import { cn } from "@/lib/utils";

export default function VideosPage() {
  const t = useTranslations("video");
  const tb = useTranslations("browse");
  const tl = useTranslations("landType");
  const locale = useLocale();
  const areas = useQuery(api.areas.all);
  const [areaId, setAreaId] = useState<Id<"areas"> | undefined>();
  const [landType, setLandType] = useState<LandType | undefined>();
  const { results, status, loadMore } = usePaginatedQuery(api.videos.feed, { areaId, landType }, { initialNumItems: 12 });
  const [open, setOpen] = useState<{ listingId: Id<"listings">; videoId: Id<"videos"> } | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && status === "CanLoadMore" && loadMore(12), { rootMargin: "500px" });
    io.observe(el);
    return () => io.disconnect();
  }, [status, loadMore]);

  return (
    <div className="container-page py-8">
      <div className="relative isolate overflow-hidden rounded-3xl bg-brand-deep px-6 py-8 text-brand-deep-foreground shadow-elev-2 sm:px-10 sm:py-10">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(36rem_18rem_at_100%_0%,color-mix(in_oklch,var(--warm)_32%,transparent),transparent_70%)]" aria-hidden />
        <div className="bg-noise absolute inset-0 -z-10 opacity-60 mix-blend-overlay" aria-hidden />
        <PlayCircle className="absolute -right-6 -bottom-8 -z-10 size-48 text-white/[0.06]" aria-hidden />
        <h1 className="font-heading text-3xl font-extrabold tracking-tight sm:text-4xl">{t("feedTitle")}</h1>
        <p className="mt-2 max-w-xl text-brand-deep-foreground/80">{t("feedSubtitle")}</p>
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium">
          <Wifi className="size-3.5" aria-hidden /> {t("dataSaver")}
        </p>
      </div>

      <div className="scrollbar-none -mx-4 mt-6 flex items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        <select
          aria-label={tb("area")}
          value={areaId ?? ""}
          onChange={(e) => setAreaId((e.target.value || undefined) as Id<"areas"> | undefined)}
          className="h-9 rounded-full border bg-background px-3 text-sm font-medium outline-none hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/40"
        >
          <option value="">{tb("allBangladesh")}</option>
          {areas?.map((a) => (
            <option key={a._id} value={a._id}>
              {locale === "bn" && a.areaNameBn ? a.areaNameBn : a.areaName}
            </option>
          ))}
        </select>
        {LAND_TYPES.map((lt) => {
          const Icon = LandTypeIcons[lt];
          return (
            <button
              key={lt}
              type="button"
              aria-pressed={landType === lt}
              onClick={() => setLandType(landType === lt ? undefined : lt)}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition",
                landType === lt ? "border-primary bg-primary text-primary-foreground shadow-elev-1" : "bg-background hover:border-primary/40 hover:bg-secondary/60",
              )}
            >
              <Icon size={14} /> {tl(lt)}
            </button>
          );
        })}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {results.map((v) => (
          <VideoThumb key={v._id} v={v} onClick={() => setOpen({ listingId: v.listingId, videoId: v._id })} />
        ))}
        {status === "LoadingFirstPage" && Array.from({ length: 8 }, (_, i) => <div key={i} className="aspect-video animate-pulse rounded-xl bg-muted" />)}
      </div>
      {status === "Exhausted" && results.length === 0 && (
        <div className="mt-6 grid place-items-center rounded-3xl border border-dashed bg-surface px-6 py-16 text-center">
          <span className="grid size-16 place-items-center rounded-2xl bg-card text-primary shadow-elev-1">
            <PlayCircle className="size-8" aria-hidden />
          </span>
          <p className="mt-4 max-w-sm text-sm text-muted-foreground">{t("noVideos")}</p>
          <Link href="/browse" className={cn(buttonVariants({ size: "lg" }), "mt-6 h-11 rounded-xl")}>
            {tb("title")}
          </Link>
        </div>
      )}
      <div ref={sentinel} className="h-8" />
      {status === "CanLoadMore" && (
        <div className="flex justify-center">
          <Button variant="outline" size="lg" className="h-11 rounded-full px-8 font-semibold" onClick={() => loadMore(12)}>
            {tb("loadMore")}
          </Button>
        </div>
      )}
      <VideoGalleryDialog listingId={open?.listingId ?? null} initialVideoId={open?.videoId} open={!!open} onOpenChange={(o) => !o && setOpen(null)} />
    </div>
  );
}
