"use client";

import { useQuery } from "convex/react";
import { ExternalLink, Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { buttonVariants } from "@/components/ui/button";
import { VideoThumb, type VideoData } from "@/components/video/video-card";
import { listingHref } from "@/lib/urls";

// The player (and hls.js) is only downloaded when a gallery is opened.
const VideoPlayer = dynamic(() => import("@/components/video/video-player").then((m) => m.VideoPlayer), {
  ssr: false,
  loading: () => (
    <div className="grid aspect-video w-full place-items-center rounded-xl bg-black text-white/70">
      <Loader2 className="size-6 animate-spin" />
    </div>
  ),
});

/** Main player + this listing's videos + related videos (same area / type / price band). */
export function VideoGalleryBody({ listingId, initialVideoId }: { listingId: Id<"listings">; initialVideoId?: Id<"videos"> }) {
  const t = useTranslations("video");
  const [currentListing, setCurrentListing] = useState(listingId);
  const [currentId, setCurrentId] = useState<Id<"videos"> | undefined>(initialVideoId);
  const own = useQuery(api.videos.byListing, { listingId: currentListing });
  const related = useQuery(api.videos.related, { listingId: currentListing, limit: 12 });
  const playable = useMemo(() => (own ?? []).filter((v) => v.status === "ready"), [own]);
  const current = playable.find((v) => v._id === currentId) ?? playable[0];
  const progress = useQuery(api.videos.myProgress, current ? { videoId: current._id } : "skip");

  useEffect(() => {
    if (!currentId && playable[0]) setCurrentId(playable[0]._id);
  }, [currentId, playable]);

  const index = current ? playable.findIndex((v) => v._id === current._id) : -1;
  const queue: VideoData[] = [...playable, ...(related ?? [])];
  const qIndex = current ? queue.findIndex((v) => v._id === current._id) : -1;
  const go = (v: VideoData | undefined) => {
    if (!v) return;
    if (v.listingId !== currentListing) setCurrentListing(v.listingId);
    setCurrentId(v._id);
  };

  const pending = (own ?? []).filter((v) => v.status !== "ready");

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-3">
        {own === undefined ? (
          <div className="aspect-video animate-pulse rounded-xl bg-muted" />
        ) : current ? (
          <>
            <VideoPlayer
              key={current._id}
              video={current}
              startAt={progress}
              onNext={qIndex < queue.length - 1 ? () => go(queue[qIndex + 1]) : undefined}
              onPrev={qIndex > 0 ? () => go(queue[qIndex - 1]) : undefined}
            />
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-heading font-semibold">{current.title}</h3>
                {current.listing && <p className="text-sm text-muted-foreground">{current.listing.title}</p>}
                <p className="mt-1 hidden text-xs text-muted-foreground sm:block">{t("keyboardHint")}</p>
              </div>
              {current.listing && (
                <Link href={listingHref(current.listing)} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  <ExternalLink /> {t("openListing")}
                </Link>
              )}
            </div>
          </>
        ) : (
          <div className="grid aspect-video place-items-center rounded-xl bg-muted text-sm text-muted-foreground">{t("noVideos")}</div>
        )}
        {pending.map((v) => (
          <div key={v._id} className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
            {v.status === "processing" && <Loader2 className="size-4 animate-spin" />}
            {v.status === "failed" ? t("failed") : v.moderation === "pending" ? t("pendingModeration") : t("processingHint")}
          </div>
        ))}
        {playable.length > 1 && (
          <div>
            <p className="mb-2 text-sm font-semibold">{t("thisListing")}</p>
            <div className="scrollbar-none flex gap-2 overflow-x-auto pb-1">
              {playable.map((v, i) => (
                <VideoThumb key={v._id} v={v} compact active={i === index} onClick={() => go(v)} className="w-40 shrink-0" />
              ))}
            </div>
          </div>
        )}
      </div>
      <aside className="min-w-0">
        <p className="mb-2 text-sm font-semibold">{t("related")}</p>
        <div className="scrollbar-none flex gap-3 overflow-x-auto pb-1 lg:max-h-[60vh] lg:flex-col lg:overflow-y-auto">
          {related === undefined
            ? Array.from({ length: 3 }, (_, i) => <div key={i} className="aspect-video w-56 shrink-0 animate-pulse rounded-xl bg-muted lg:w-full" />)
            : related.map((v) => <VideoThumb key={v._id} v={v} onClick={() => go(v)} className="w-56 shrink-0 lg:w-full" />)}
          {related?.length === 0 && <p className="text-sm text-muted-foreground">{t("noVideos")}</p>}
        </div>
      </aside>
    </div>
  );
}

export function VideoGalleryDialog({
  listingId,
  initialVideoId,
  open,
  onOpenChange,
}: {
  listingId: Id<"listings"> | null;
  initialVideoId?: Id<"videos">;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const t = useTranslations("video");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] overflow-y-auto p-3 sm:max-w-6xl sm:p-5">
        <DialogTitle className="pr-8">{t("gallery")}</DialogTitle>
        {open && listingId && <VideoGalleryBody key={`${listingId}:${initialVideoId ?? ""}`} listingId={listingId} initialVideoId={initialVideoId} />}
      </DialogContent>
    </Dialog>
  );
}
