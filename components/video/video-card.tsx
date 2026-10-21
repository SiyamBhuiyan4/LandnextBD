"use client";

import type { FunctionReturnType } from "convex/server";
import { Play } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import type { api } from "@/convex/_generated/api";
import { BLUR } from "@/components/listings/listing-card";
import { useFmt } from "@/hooks/use-fmt";
import { cn } from "@/lib/utils";

export type VideoData = FunctionReturnType<typeof api.videos.latest>[number];

export function VideoThumb({
  v,
  onClick,
  active,
  className,
  compact,
  progressSec,
}: {
  v: VideoData;
  onClick?: () => void;
  active?: boolean;
  className?: string;
  compact?: boolean;
  progressSec?: number;
}) {
  const fmt = useFmt();
  const tl = useTranslations("landType");
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={cn(
        "group block w-full overflow-hidden rounded-xl border bg-card text-left transition hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        active && "ring-2 ring-primary",
        className,
      )}
    >
      <div className="relative aspect-video bg-muted">
        {v.thumbnailUrl && (
          <Image src={v.thumbnailUrl} alt="" fill sizes="(min-width: 768px) 320px, 60vw" className="object-cover" loading="lazy" placeholder="blur" blurDataURL={BLUR} />
        )}
        <span className="absolute inset-0 grid place-items-center bg-black/10 transition group-hover:bg-black/25">
          <span className="grid size-11 place-items-center rounded-full bg-white/90 text-primary shadow-md transition group-hover:scale-110">
            <Play className="ml-0.5 size-5 fill-current" />
          </span>
        </span>
        {v.durationSec ? <span className="absolute right-2 bottom-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] text-white">{fmt.duration(v.durationSec)}</span> : null}
        {progressSec && v.durationSec ? (
          <span className="absolute inset-x-0 bottom-0 h-1 bg-black/30">
            <span className="block h-full bg-warm" style={{ width: `${Math.min(100, (progressSec / v.durationSec) * 100)}%` }} />
          </span>
        ) : null}
      </div>
      {!compact && (
        <div className="p-3">
          <p className="line-clamp-1 text-sm font-semibold">{v.title}</p>
          {v.listing && (
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
              {tl(v.listing.landType)} · {v.listing.areaName} · {fmt.price(v.listing.price)}
            </p>
          )}
        </div>
      )}
    </button>
  );
}
