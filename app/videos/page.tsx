"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { LandTypeIcons } from "@/components/icons";
import { Button } from "@/components/ui/button";
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
      <h1 className="font-heading text-3xl font-bold tracking-tight">{t("feedTitle")}</h1>
      <p className="mt-1 text-muted-foreground">{t("feedSubtitle")}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t("dataSaver")}</p>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <select
          aria-label={tb("area")}
          value={areaId ?? ""}
          onChange={(e) => setAreaId((e.target.value || undefined) as Id<"areas"> | undefined)}
          className="h-9 rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/40"
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
              className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium", landType === lt ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
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
      {status === "Exhausted" && results.length === 0 && <p className="mt-6 rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">{t("noVideos")}</p>}
      <div ref={sentinel} className="h-8" />
      {status === "CanLoadMore" && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => loadMore(12)}>
            {tb("loadMore")}
          </Button>
        </div>
      )}
      <VideoGalleryDialog listingId={open?.listingId ?? null} initialVideoId={open?.videoId} open={!!open} onOpenChange={(o) => !o && setOpen(null)} />
    </div>
  );
}
