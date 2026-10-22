"use client";

import { ChevronLeft, ChevronRight, Images, Loader2, Play, Video, X, ZoomIn, ZoomOut } from "lucide-react";
import dynamic from "next/dynamic";
import Image, { getImageProps } from "next/image";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BLUR } from "@/components/listings/listing-card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { VideoData } from "@/components/video/video-card";
import { useFmt } from "@/hooks/use-fmt";
import { cn } from "@/lib/utils";

// The player (and hls.js for .m3u8 sources) is only downloaded when a video is opened.
const VideoPlayer = dynamic(() => import("@/components/video/video-player").then((m) => m.VideoPlayer), {
  ssr: false,
  loading: () => (
    <div className="grid aspect-video w-full place-items-center rounded-xl bg-black text-white/70">
      <Loader2 className="size-8 animate-spin" />
    </div>
  ),
});

export type MediaItem = { kind: "photo"; src: string; key: string } | { kind: "video"; video: VideoData; key: string };

function buildItems(images: string[], videos: VideoData[]): MediaItem[] {
  return [
    ...images.map((src, i) => ({ kind: "photo" as const, src, key: `p${i}:${src}` })),
    ...videos.map((v) => ({ kind: "video" as const, video: v, key: `v:${v._id}` })),
  ];
}

/** Small badge shown on video tiles: play icon + duration. */
function PlayBadge({ duration, size = "md" }: { duration?: string; size?: "sm" | "md" | "lg" }) {
  return (
    <>
      <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/15 transition group-hover:bg-black/30">
        <span
          className={cn(
            "grid place-items-center rounded-full bg-white/95 text-primary shadow-lg ring-4 ring-white/25 transition group-hover:scale-110",
            size === "sm" ? "size-6 ring-2" : size === "lg" ? "size-16" : "size-11",
          )}
        >
          <Play className={cn("ml-0.5 fill-current", size === "sm" ? "size-3" : size === "lg" ? "size-7" : "size-5")} aria-hidden />
        </span>
      </span>
      {duration && size !== "sm" && (
        <span className="pointer-events-none absolute right-2 bottom-2 rounded-md bg-black/75 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums">{duration}</span>
      )}
    </>
  );
}

/** Matches the `sm:` breakpoint split between the mobile carousel and the desktop mosaic. */
const MOBILE_MQ = "(max-width: 639.98px)";

/**
 * Item 0 is the hero in BOTH layouts (one is hidden by CSS). Both copies get the same `sizes`, so
 * the browser resolves them to the same URL and downloads it once, whichever layout is showing —
 * the hero can be eager + high priority without wasting a download on the hidden copy.
 */
function Thumb({ item, sizes, hero, alt }: { item: MediaItem; sizes: string; hero?: boolean; alt: string }) {
  const src = item.kind === "photo" ? item.src : item.video.thumbnailUrl;
  if (!src) return <span className="absolute inset-0 bg-gradient-to-br from-primary/40 to-primary/80" aria-hidden />;
  return (
    <Image
      src={src}
      alt={alt}
      fill
      loading={hero ? "eager" : "lazy"}
      fetchPriority={hero ? "high" : undefined}
      sizes={sizes}
      className="object-cover transition duration-500 group-hover:scale-[1.03]"
      placeholder="blur"
      blurDataURL={BLUR}
    />
  );
}

/** `sizes` for a mosaic tile: the grid is 4 columns (max ~1280px wide); spans mirror the classes below. */
function tileSizes(tileCount: number, pos: number) {
  const cols = tileCount === 1 ? 4 : pos === 0 || (tileCount === 2 && pos === 1) || (tileCount === 3 && pos > 0) || (tileCount === 4 && pos === 1) ? 2 : 1;
  return `(min-width: 1280px) ${cols * 320}px, ${cols * 25}vw`;
}

/**
 * One gallery for a listing's photos AND videos.
 * Desktop: mosaic (hero + 4 tiles, a video always surfaces in the tiles).
 * Mobile: edge-to-edge swipeable carousel with a counter.
 * Both open a full-screen lightbox (keyboard, swipe, pinch/double-tap zoom, inline video).
 */
export function MediaGallery({
  images,
  videos = [],
  title,
  openVideo,
}: {
  images: string[];
  videos?: VideoData[];
  title: string;
  /** Request to open the lightbox on a video (e.g. from a "Videos" section elsewhere on the page); `n` makes repeat requests distinct. */
  openVideo?: { id: string; n: number } | null;
}) {
  const t = useTranslations("listingDetail");
  const fmt = useFmt();
  const items = useMemo(() => buildItems(images, videos), [images, videos]);
  const [open, setOpen] = useState<number | null>(null);
  const [slide, setSlide] = useState(0);
  const [seenRequest, setSeenRequest] = useState<number | null>(null);
  const strip = useRef<HTMLDivElement>(null);
  const n = items.length;
  const photoCount = images.length;
  const videoCount = videos.length;
  const firstVideo = items.findIndex((i) => i.kind === "video");

  // Adjust state while rendering when a new open-video request arrives.
  if (openVideo && openVideo.n !== seenRequest) {
    const i = items.findIndex((x) => x.kind === "video" && x.video._id === openVideo.id);
    if (i >= 0) {
      setSeenRequest(openVideo.n);
      setOpen(i);
    }
  }

  const altFor = (item: MediaItem, i: number) =>
    item.kind === "photo" ? t("photoAlt", { title, n: fmt.digits(i + 1) }) : t("videoAlt", { title: item.video.title });
  const labelFor = (item: MediaItem, i: number) =>
    item.kind === "photo"
      ? t("openPhoto", { n: fmt.digits(i + 1), total: fmt.digits(photoCount) })
      : t("playVideo", { title: item.video.title, duration: fmt.duration(item.video.durationSec) || "" });

  if (n === 0) {
    return (
      <div className="grid aspect-[16/9] place-items-center rounded-2xl bg-muted text-muted-foreground sm:aspect-[21/9]">
        <Images className="size-10 opacity-50" aria-hidden />
      </div>
    );
  }

  // Desktop mosaic tiles: hero + up to 4; make sure the first video is visible.
  const tiles: number[] = [0];
  if (firstVideo > 0) tiles.push(firstVideo);
  for (let i = 1; i < n && tiles.length < 5; i++) if (!tiles.includes(i)) tiles.push(i);
  const rest = n - tiles.length;
  const tileCount = tiles.length;
  const heroSizes = `${MOBILE_MQ} 100vw, ${tileSizes(tileCount, 0)}`;

  const counters = (
    <div className="flex flex-wrap gap-2">
      {photoCount > 0 && (
        <button
          type="button"
          onClick={() => setOpen(0)}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-background/95 px-3.5 text-sm font-semibold text-foreground shadow-md ring-1 ring-black/5 backdrop-blur transition hover:bg-background focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Images className="size-4" aria-hidden /> {t("photosCount", { count: photoCount })}
        </button>
      )}
      {videoCount > 0 && (
        <button
          type="button"
          onClick={() => setOpen(firstVideo)}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-3.5 text-sm font-semibold text-primary-foreground shadow-md transition hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Video className="size-4" aria-hidden /> {t("videosCount", { count: videoCount })}
        </button>
      )}
    </div>
  );

  return (
    <section aria-label={t("mediaGallery")}>
      {/* Mobile: edge-to-edge swipeable carousel */}
      <div className="relative -mx-4 sm:hidden">
        <div
          ref={strip}
          className="scrollbar-none flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
          onScroll={(e) => {
            const el = e.currentTarget;
            setSlide(Math.round(el.scrollLeft / el.clientWidth));
          }}
        >
          {items.map((item, i) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setOpen(i)}
              aria-label={labelFor(item, i)}
              className="group relative aspect-[4/3] w-full shrink-0 snap-center overflow-hidden bg-muted focus-visible:outline-none"
            >
              <Thumb item={item} sizes={i === 0 ? heroSizes : `${MOBILE_MQ} 100vw, 640px`} hero={i === 0} alt={i === 0 ? altFor(item, i) : ""} />
              {item.kind === "video" && <PlayBadge size="lg" duration={fmt.duration(item.video.durationSec)} />}
            </button>
          ))}
        </div>
        <span className="pointer-events-none absolute top-3 right-3 rounded-full bg-black/65 px-2.5 py-1 text-xs font-semibold text-white tabular-nums" aria-live="polite">
          {fmt.digits(Math.min(slide, n - 1) + 1)} / {fmt.digits(n)}
        </span>
        <div className="absolute bottom-3 left-3">{counters}</div>
        {n > 1 && n <= 12 && (
          <div className="pointer-events-none absolute right-0 bottom-4 left-0 flex justify-center gap-1.5" aria-hidden>
            {items.map((it, i) => (
              <span key={it.key} className={cn("h-1.5 rounded-full bg-white/70 shadow transition-all", i === slide ? "w-4 bg-white" : "w-1.5")} />
            ))}
          </div>
        )}
      </div>

      {/* Desktop: mosaic */}
      <div className="relative hidden sm:block">
        <div className={cn("grid h-[420px] gap-2 overflow-hidden rounded-2xl lg:h-[480px]", tileCount === 1 ? "grid-cols-1" : "grid-cols-4 grid-rows-2")}>
          {tiles.map((idx, pos) => {
            const item = items[idx];
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setOpen(idx)}
                aria-label={labelFor(item, idx)}
                className={cn(
                  "group relative overflow-hidden bg-muted focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
                  pos === 0 && tileCount > 1 && "col-span-2 row-span-2",
                  tileCount === 2 && pos === 1 && "col-span-2 row-span-2",
                  tileCount === 3 && pos > 0 && "col-span-2",
                  tileCount === 4 && pos === 1 && "col-span-2",
                )}
              >
                <Thumb item={item} sizes={pos === 0 ? heroSizes : tileSizes(tileCount, pos)} hero={pos === 0} alt={pos === 0 ? altFor(item, idx) : ""} />
                {item.kind === "video" && <PlayBadge size={pos === 0 ? "lg" : "md"} duration={fmt.duration(item.video.durationSec)} />}
                {pos === tileCount - 1 && rest > 0 && (
                  <span className="absolute inset-0 grid place-items-center bg-black/50 text-lg font-semibold text-white">+{fmt.digits(rest)}</span>
                )}
              </button>
            );
          })}
        </div>
        <div className="absolute bottom-4 left-4">{counters}</div>
      </div>

      <Lightbox items={items} index={open} onIndex={setOpen} title={title} altFor={altFor} photoCount={photoCount} videoCount={videoCount} />
    </section>
  );
}

/** Kept for any older import sites: photos only. */
export function Gallery({ images, title }: { images: string[]; title: string }) {
  return <MediaGallery images={images} title={title} />;
}

type Zoom = { s: number; x: number; y: number };
const NO_ZOOM: Zoom = { s: 1, x: 0, y: 0 };

function Lightbox({
  items,
  index,
  onIndex,
  title,
  altFor,
  photoCount,
  videoCount,
}: {
  items: MediaItem[];
  index: number | null;
  onIndex: (i: number | null) => void;
  title: string;
  altFor: (item: MediaItem, i: number) => string;
  photoCount: number;
  videoCount: number;
}) {
  const t = useTranslations("listingDetail");
  const fmt = useFmt();
  const n = items.length;
  const [zoom, setZoom] = useState<Zoom>(NO_ZOOM);
  const gesture = useRef<{ x: number; y: number; dist?: number; s0?: number; zx?: number; zy?: number; t: number } | null>(null);
  const lastTap = useRef(0);
  const thumbs = useRef<HTMLDivElement>(null);
  const item = index !== null ? items[index] : null;

  // Sliding is for steps between neighbours. A wrap (last -> first) or a
  // thumbnail jump would otherwise sweep across every slide, so those land
  // instantly and sliding resumes on the next frame.
  const [slideAnim, setSlideAnim] = useState(true);
  const lastIndex = useRef(index);
  useEffect(() => {
    const prev = lastIndex.current;
    lastIndex.current = index;
    if (index === null || prev === null) return;
    if (Math.abs(index - prev) <= 1) return;
    setSlideAnim(false);
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setSlideAnim(true)));
    return () => cancelAnimationFrame(id);
  }, [index]);

  const go = useCallback(
    (d: number) => {
      setZoom(NO_ZOOM);
      if (index === null) return;
      onIndex((index + d + n) % n);
    },
    [index, n, onIndex],
  );
  const jump = (i: number) => {
    setZoom(NO_ZOOM);
    onIndex(i);
  };

  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      // Arrow keys inside the video player seek; the player marks those as handled.
      if ((e.target as HTMLElement | null)?.closest?.("[data-video-player]")) return;
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key.toLowerCase() === "z" && items[index]?.kind === "photo") setZoom((z) => (z.s > 1 ? NO_ZOOM : { s: 2.2, x: 0, y: 0 }));
    };
    // Capture phase: the dialog popup stops arrow-key propagation.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [index, go, items]);

  // Warm the browser cache for the neighbouring photos.
  useEffect(() => {
    if (index === null || n < 2) return;
    for (const i of [(index + 1) % n, (index - 1 + n) % n]) {
      const it = items[i];
      if (it?.kind !== "photo") continue;
      const { props } = getImageProps({ src: it.src, alt: "", fill: true, sizes: "100vw" });
      const img = new window.Image();
      img.sizes = "100vw";
      if (props.srcSet) img.srcset = props.srcSet;
      img.src = props.src;
    }
  }, [index, items, n]);

  // Keep the active thumbnail in view.
  useEffect(() => {
    if (index === null) return;
    thumbs.current?.querySelector<HTMLElement>(`[data-i="${index}"]`)?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [index]);

  const toggleZoomAt = (clientX: number, clientY: number, rect: DOMRect) => {
    setZoom((z) => {
      if (z.s > 1) return NO_ZOOM;
      const s = 2.4;
      // Zoom towards the tapped point.
      const dx = clientX - (rect.left + rect.width / 2);
      const dy = clientY - (rect.top + rect.height / 2);
      return { s, x: -dx * (s - 1), y: -dy * (s - 1) };
    });
  };

  const firstVideo = items.findIndex((i) => i.kind === "video");

  const iconBtn = "grid size-11 place-items-center rounded-full text-white transition hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none";

  return (
    <Dialog open={index !== null} onOpenChange={(o) => !o && (setZoom(NO_ZOOM), onIndex(null))}>
      <DialogContent
        showCloseButton={false}
        className="top-0 left-0 flex h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none bg-neutral-950 p-0 text-white ring-0 sm:max-w-none"
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{t("lightboxHint")}</DialogDescription>
        {item && index !== null && (
          <>
            {/* Top bar */}
            <div className="flex items-center justify-between gap-2 px-2 pt-[max(env(safe-area-inset-top),0.5rem)] pb-1 sm:px-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="rounded-full bg-white/10 px-3 py-1 text-sm font-semibold tabular-nums" aria-live="polite">
                  {fmt.digits(index + 1)} / {fmt.digits(n)}
                </span>
                {photoCount > 0 && videoCount > 0 && (
                  <div className="hidden gap-1 sm:flex" role="tablist" aria-label={t("mediaGallery")}>
                    <button type="button" role="tab" aria-selected={item.kind === "photo"} onClick={() => jump(0)} className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm transition", item.kind === "photo" ? "bg-white text-black" : "text-white/80 hover:bg-white/10")}>
                      <Images className="size-4" aria-hidden /> {t("photosCount", { count: photoCount })}
                    </button>
                    <button type="button" role="tab" aria-selected={item.kind === "video"} onClick={() => jump(firstVideo)} className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm transition", item.kind === "video" ? "bg-white text-black" : "text-white/80 hover:bg-white/10")}>
                      <Video className="size-4" aria-hidden /> {t("videosCount", { count: videoCount })}
                    </button>
                  </div>
                )}
                <p className="hidden truncate text-sm text-white/70 lg:block">{item.kind === "video" ? item.video.title : title}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                {item.kind === "photo" && (
                  <button type="button" onClick={() => setZoom((z) => (z.s > 1 ? NO_ZOOM : { s: 2.2, x: 0, y: 0 }))} className={iconBtn} aria-label={zoom.s > 1 ? t("zoomOut") : t("zoomIn")}>
                    {zoom.s > 1 ? <ZoomOut className="size-5" /> : <ZoomIn className="size-5" />}
                  </button>
                )}
                <button type="button" onClick={() => onIndex(null)} className={iconBtn} aria-label={t("close")}>
                  <X className="size-6" />
                </button>
              </div>
            </div>

            {/* Stage */}
            <div className="relative min-h-0 flex-1 select-none">
              {item.kind === "photo" ? (
                <div
                  className={cn("absolute inset-0 touch-none overflow-hidden", zoom.s > 1 ? "cursor-zoom-out" : "cursor-zoom-in")}
                  onClick={(e) => toggleZoomAt(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())}
                  onTouchStart={(e) => {
                    const [a, b] = [e.touches[0], e.touches[1]];
                    if (b) gesture.current = { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2, dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), s0: zoom.s, t: Date.now() };
                    else gesture.current = { x: a.clientX, y: a.clientY, zx: zoom.x, zy: zoom.y, t: Date.now() };
                  }}
                  onTouchMove={(e) => {
                    const g = gesture.current;
                    if (!g) return;
                    const [a, b] = [e.touches[0], e.touches[1]];
                    if (b && g.dist) {
                      const s = Math.min(4, Math.max(1, (g.s0 ?? 1) * (Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / g.dist)));
                      setZoom((z) => (s === 1 ? NO_ZOOM : { ...z, s }));
                    } else if (!b && zoom.s > 1 && g.zx !== undefined) {
                      setZoom((z) => ({ ...z, x: (g.zx ?? 0) + (a.clientX - g.x), y: (g.zy ?? 0) + (a.clientY - g.y) }));
                    }
                  }}
                  onTouchEnd={(e) => {
                    const g = gesture.current;
                    if (!g || e.touches.length > 0) return;
                    gesture.current = null;
                    if (g.dist) return; // pinch ended
                    const c = e.changedTouches[0];
                    const dx = c.clientX - g.x;
                    const dy = c.clientY - g.y;
                    if (zoom.s === 1 && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
                      e.preventDefault();
                      go(dx < 0 ? 1 : -1);
                    } else if (zoom.s === 1 && dy > 110 && Math.abs(dy) > Math.abs(dx) * 1.5) {
                      e.preventDefault();
                      onIndex(null); // swipe down to close
                    } else if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
                      e.preventDefault(); // handle taps here (no synthetic click)
                      const now = Date.now();
                      if (now - lastTap.current < 300) toggleZoomAt(c.clientX, c.clientY, e.currentTarget.getBoundingClientRect());
                      lastTap.current = now;
                    }
                  }}
                >
                  {/* All slides sit side by side and the strip slides, so photos
                      glide in instead of the old image unmounting and the new
                      one flashing its placeholder. */}
                  <div
                    className="flex h-full w-full"
                    style={{
                      transform: `translateX(-${index * 100}%)`,
                      transition: slideAnim ? "transform 320ms cubic-bezier(0.22, 1, 0.36, 1)" : "none",
                    }}
                  >
                    {items.map((it, i) => (
                      <div key={it.key} className="relative h-full w-full shrink-0">
                        {it.kind === "photo" && Math.abs(i - index) <= 1 && (
                          <div
                            className="absolute inset-0 transition-transform duration-200 ease-out"
                            style={i === index ? { transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.s})` } : undefined}
                          >
                            <Image
                              src={it.src}
                              alt={i === index ? altFor(it, i) : ""}
                              fill
                              sizes="100vw"
                              loading="eager"
                              fetchPriority={i === index ? "high" : "low"}
                              className="object-contain"
                              placeholder="blur"
                              blurDataURL={BLUR}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center px-0 sm:px-16">
                  <VideoPlayer
                    key={item.video._id}
                    video={item.video}
                    onNext={n > 1 ? () => go(1) : undefined}
                    onPrev={n > 1 ? () => go(-1) : undefined}
                    className="w-full max-w-[min(100%,calc((100dvh-11rem)*16/9))] rounded-none sm:rounded-xl"
                    videoClassName="max-h-[calc(100dvh-11rem)]"
                  />
                </div>
              )}

              {n > 1 && (
                <>
                  <button type="button" onClick={() => go(-1)} className="absolute top-1/2 left-3 z-10 hidden size-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/25 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none sm:grid" aria-label={t("previous")}>
                    <ChevronLeft className="size-6" />
                  </button>
                  <button type="button" onClick={() => go(1)} className="absolute top-1/2 right-3 z-10 hidden size-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/25 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none sm:grid" aria-label={t("next")}>
                    <ChevronRight className="size-6" />
                  </button>
                </>
              )}
            </div>

            {/* Thumbnails */}
            {n > 1 && (
              <div ref={thumbs} className="scrollbar-none flex gap-2 overflow-x-auto px-3 pt-2 pb-[max(env(safe-area-inset-bottom),0.75rem)] sm:justify-center">
                {items.map((it, i) => (
                  <button
                    key={it.key}
                    data-i={i}
                    type="button"
                    onClick={() => jump(i)}
                    aria-label={it.kind === "photo" ? t("openPhoto", { n: fmt.digits(i + 1), total: fmt.digits(photoCount) }) : t("videoAlt", { title: it.video.title })}
                    aria-current={i === index ? "true" : undefined}
                    className={cn(
                      "group relative h-14 w-20 shrink-0 overflow-hidden rounded-lg ring-2 transition focus-visible:ring-white focus-visible:outline-none",
                      i === index ? "opacity-100 ring-warm" : "opacity-55 ring-transparent hover:opacity-90",
                    )}
                  >
                    <Thumb item={it} sizes="80px" alt="" />
                    {it.kind === "video" && <PlayBadge size="sm" />}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
