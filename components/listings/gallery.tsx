"use client";

import { ChevronLeft, ChevronRight, Expand, X, ZoomIn, ZoomOut } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { BLUR } from "@/components/listings/listing-card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useFmt } from "@/hooks/use-fmt";
import { cn } from "@/lib/utils";

/** Photo mosaic + full-screen lightbox with keyboard, swipe and zoom. */
export function Gallery({ images, title }: { images: string[]; title: string }) {
  const t = useTranslations("listing");
  const fmt = useFmt();
  const [open, setOpen] = useState<number | null>(null);
  const [zoom, setZoom] = useState<{ on: boolean; x: number; y: number }>({ on: false, x: 50, y: 50 });
  const touch = useRef<number | null>(null);
  const n = images.length;

  const go = useCallback((d: number) => {
    setZoom({ on: false, x: 50, y: 50 });
    setOpen((i) => (i === null ? i : (i + d + n) % n));
  }, [n]);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key.toLowerCase() === "z") setZoom((z) => ({ ...z, on: !z.on }));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, go]);

  if (n === 0) return <div className="aspect-[16/9] rounded-2xl bg-muted" />;

  return (
    <>
      <div className="grid h-[260px] grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-2xl sm:h-[420px]">
        {images.slice(0, 5).map((src, i) => (
          <button
            key={src}
            type="button"
            onClick={() => setOpen(i)}
            aria-label={t("gallery", { n: fmt.digits(i + 1), total: fmt.digits(n) })}
            className={cn(
              "group relative overflow-hidden bg-muted focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none",
              i === 0 ? "col-span-4 row-span-2 sm:col-span-2" : "hidden sm:block",
              n === 2 && i === 1 && "sm:col-span-2 sm:row-span-2",
              n === 3 && i > 0 && "sm:col-span-2",
              n === 4 && i === 1 && "sm:col-span-2",
            )}
          >
            <Image
              src={src}
              alt={i === 0 ? title : ""}
              fill
              priority={i === 0}
              sizes={i === 0 ? "(min-width: 640px) 50vw, 100vw" : "25vw"}
              className="object-cover transition duration-500 group-hover:scale-105"
              placeholder="blur"
              blurDataURL={BLUR}
            />
            {i === 4 && n > 5 && <span className="absolute inset-0 grid place-items-center bg-black/45 text-lg font-semibold text-white">+{fmt.digits(n - 5)}</span>}
            {i === 0 && (
              <span className="absolute right-3 bottom-3 inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white">
                <Expand className="size-3.5" /> {fmt.digits(n)}
              </span>
            )}
          </button>
        ))}
      </div>

      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent showCloseButton={false} className="h-[100dvh] max-w-none rounded-none bg-black p-0 text-white ring-0 sm:max-w-none">
          <DialogTitle className="sr-only">{title}</DialogTitle>
          {open !== null && (
            <div
              className="relative h-full w-full select-none"
              onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
              onTouchEnd={(e) => {
                if (touch.current === null || zoom.on) return;
                const dx = e.changedTouches[0].clientX - touch.current;
                if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
                touch.current = null;
              }}
            >
              <div
                className={cn("absolute inset-0 overflow-hidden", zoom.on ? "cursor-zoom-out" : "cursor-zoom-in")}
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setZoom((z) => ({ on: !z.on, x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }));
                }}
              >
                <Image
                  src={images[open]}
                  alt={`${title} — ${open + 1}`}
                  fill
                  sizes="100vw"
                  className="object-contain transition-transform duration-300"
                  style={{ transform: zoom.on ? "scale(2.2)" : "scale(1)", transformOrigin: `${zoom.x}% ${zoom.y}%` }}
                />
              </div>
              <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent p-3">
                <span className="text-sm">{t("gallery", { n: fmt.digits(open + 1), total: fmt.digits(n) })}</span>
                <div className="flex gap-1">
                  <button type="button" onClick={() => setZoom((z) => ({ ...z, on: !z.on }))} className="grid size-10 place-items-center rounded-full hover:bg-white/15" aria-label={t("zoom")}>
                    {zoom.on ? <ZoomOut className="size-5" /> : <ZoomIn className="size-5" />}
                  </button>
                  <button type="button" onClick={() => setOpen(null)} className="grid size-10 place-items-center rounded-full hover:bg-white/15" aria-label="Close">
                    <X className="size-5" />
                  </button>
                </div>
              </div>
              {n > 1 && (
                <>
                  <button type="button" onClick={() => go(-1)} className="absolute top-1/2 left-3 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 backdrop-blur hover:bg-white/25" aria-label="Previous">
                    <ChevronLeft />
                  </button>
                  <button type="button" onClick={() => go(1)} className="absolute top-1/2 right-3 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 backdrop-blur hover:bg-white/25" aria-label="Next">
                    <ChevronRight />
                  </button>
                  <div className="scrollbar-none absolute inset-x-0 bottom-0 flex justify-center gap-2 overflow-x-auto bg-gradient-to-t from-black/70 to-transparent p-3">
                    {images.map((src, i) => (
                      <button key={src} type="button" onClick={() => setOpen(i)} className={cn("relative h-12 w-16 shrink-0 overflow-hidden rounded-md ring-2", i === open ? "ring-warm" : "ring-transparent opacity-60")}>
                        <Image src={src} alt="" fill sizes="64px" className="object-cover" />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
