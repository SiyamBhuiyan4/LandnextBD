"use client";

import { useMutation } from "convex/react";
import { ChevronLeft, ChevronRight, Gauge, Maximize, PictureInPicture2, Settings2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import type Hls from "hls.js";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

export type PlayableVideo = {
  _id: Id<"videos">;
  hlsUrl?: string | null;
  mp4Url?: string | null;
  thumbnailUrl?: string | null;
  durationSec?: number;
  title: string;
};

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

/**
 * HLS (adaptive, via hls.js loaded on demand) or MP4 playback with speed, quality,
 * picture-in-picture, keyboard shortcuts and horizontal swipe for next/previous.
 * Nothing is downloaded until this component mounts, and it only mounts when the
 * viewer opens a video.
 */
export function VideoPlayer({
  video,
  startAt,
  onNext,
  onPrev,
  className,
}: {
  video: PlayableVideo;
  startAt?: number | null;
  onNext?: () => void;
  onPrev?: () => void;
  className?: string;
}) {
  const t = useTranslations("video");
  const ref = useRef<HTMLVideoElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [levels, setLevels] = useState<{ index: number; label: string }[]>([]);
  const [level, setLevel] = useState(-1);
  const [speed, setSpeed] = useState(1);
  const [menu, setMenu] = useState<"speed" | "quality" | null>(null);
  const record = useMutation(api.videos.recordProgress);
  const lastSent = useRef({ at: 0, pos: 0 });

  // Attach source
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    setLevels([]);
    setLevel(-1);
    const src = video.hlsUrl ?? video.mp4Url ?? "";
    const start = () => {
      if (startAt && startAt > 3) el.currentTime = startAt;
      el.playbackRate = speed;
      void el.play().catch(() => {});
    };
    const playNative = () => {
      el.src = src;
      el.addEventListener("loadedmetadata", start, { once: true });
    };
    const hasMse = typeof window !== "undefined" && "MediaSource" in window;
    if (video.hlsUrl && hasMse) {
      // hls.js whenever MediaSource exists (adaptive quality menu); native HLS only on iOS.
      import("hls.js").then(({ default: HlsCtor }) => {
        if (cancelled) return;
        if (!HlsCtor.isSupported()) return playNative();
        const hls = new HlsCtor({ capLevelToPlayerSize: true, startLevel: -1 });
        hlsRef.current = hls;
        hls.loadSource(video.hlsUrl!);
        hls.attachMedia(el);
        hls.on(HlsCtor.Events.MANIFEST_PARSED, (_e, data) => {
          setLevels(
            data.levels
              .map((l, index) => ({ index, label: l.height ? `${l.height}p` : `${Math.round(l.bitrate / 1000)} kbps` }))
              .reverse(),
          );
          start();
        });
        hls.on(HlsCtor.Events.ERROR, (_e, data) => {
          if (data.fatal) console.error("[video] hls fatal error", data.type, data.details);
        });
      });
    } else {
      playNative();
    }
    lastSent.current = { at: Date.now(), pos: startAt ?? 0 };
    return () => {
      cancelled = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
      el.removeAttribute("src");
      el.load();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video._id]);

  // Progress -> watch history + seller analytics, every 10s of playback
  const flush = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const delta = Math.max(0, el.currentTime - lastSent.current.pos);
    lastSent.current = { at: Date.now(), pos: el.currentTime };
    void record({ videoId: video._id, progressSec: el.currentTime, watchedDeltaSec: Math.min(delta, 60) }).catch(() => {});
  }, [record, video._id]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onTime = () => Date.now() - lastSent.current.at > 10_000 && flush();
    const onPause = () => flush();
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("pause", onPause);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("pause", onPause);
    };
  }, [flush]);

  // Keyboard controls (when focus is inside the player)
  const onKey = (e: React.KeyboardEvent) => {
    const el = ref.current;
    if (!el) return;
    const k = e.key.toLowerCase();
    if (k === " " || k === "k") {
      if (el.paused) void el.play();
      else el.pause();
    }
    else if (k === "arrowright") el.currentTime += 5;
    else if (k === "arrowleft") el.currentTime -= 5;
    else if (k === "arrowdown" && onNext) onNext();
    else if (k === "arrowup" && onPrev) onPrev();
    else if (k === "f") void toggleFullscreen();
    else if (k === "m") el.muted = !el.muted;
    else if (k === ">" ) changeSpeed(1);
    else if (k === "<") changeSpeed(-1);
    else return;
    e.preventDefault();
  };

  const changeSpeed = (dir: 1 | -1) => {
    const i = SPEEDS.indexOf(speed);
    const next = SPEEDS[Math.min(SPEEDS.length - 1, Math.max(0, i + dir))];
    applySpeed(next);
  };
  const applySpeed = (s: number) => {
    setSpeed(s);
    if (ref.current) ref.current.playbackRate = s;
    setMenu(null);
  };
  const applyLevel = (i: number) => {
    setLevel(i);
    if (hlsRef.current) hlsRef.current.currentLevel = i;
    setMenu(null);
  };
  const toggleFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await wrap.current?.requestFullscreen?.().catch(() => {});
  };
  const togglePip = async () => {
    const el = ref.current;
    if (!el) return;
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    else await el.requestPictureInPicture?.().catch(() => {});
  };

  // Mobile swipe: horizontal swipe on the video switches videos
  const touch = useRef<{ x: number; y: number } | null>(null);

  const btn = "grid size-9 place-items-center rounded-full bg-black/55 text-white backdrop-blur transition hover:bg-black/75 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none";

  return (
    <div
      ref={wrap}
      tabIndex={0}
      onKeyDown={onKey}
      onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchEnd={(e) => {
        if (!touch.current) return;
        const dx = e.changedTouches[0].clientX - touch.current.x;
        const dy = e.changedTouches[0].clientY - touch.current.y;
        touch.current = null;
        if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) (dx < 0 ? onNext : onPrev)?.();
      }}
      className={cn("group relative overflow-hidden rounded-xl bg-black outline-none focus-visible:ring-3 focus-visible:ring-ring", className)}
      aria-label={`${video.title} — ${t("keyboardHint")}`}
    >
      <video ref={ref} className="aspect-video w-full bg-black" controls playsInline preload="metadata" poster={video.thumbnailUrl ?? undefined} />
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-2 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
        <div className="pointer-events-auto flex gap-1.5">
          {onPrev && (
            <button type="button" className={btn} onClick={onPrev} aria-label={t("prevVideo")}>
              <ChevronLeft className="size-4" />
            </button>
          )}
          {onNext && (
            <button type="button" className={btn} onClick={onNext} aria-label={t("nextVideo")}>
              <ChevronRight className="size-4" />
            </button>
          )}
        </div>
        <div className="pointer-events-auto relative flex gap-1.5">
          <button type="button" className={cn(btn, "w-auto px-2.5 text-xs font-semibold")} onClick={() => setMenu(menu === "speed" ? null : "speed")} aria-label={t("speed")} aria-expanded={menu === "speed"}>
            <Gauge className="mr-1 size-3.5" /> {speed}×
          </button>
          {levels.length > 1 && (
            <button type="button" className={btn} onClick={() => setMenu(menu === "quality" ? null : "quality")} aria-label="Quality" aria-expanded={menu === "quality"}>
              <Settings2 className="size-4" />
            </button>
          )}
          <button type="button" className={btn} onClick={togglePip} aria-label={t("pip")}>
            <PictureInPicture2 className="size-4" />
          </button>
          <button type="button" className={btn} onClick={toggleFullscreen} aria-label={t("fullscreen")}>
            <Maximize className="size-4" />
          </button>
          {menu && (
            <ul className="absolute top-11 right-0 z-10 min-w-28 rounded-lg bg-black/85 p-1 text-sm text-white shadow-lg backdrop-blur" role="menu">
              {menu === "speed"
                ? SPEEDS.map((s) => (
                    <li key={s}>
                      <button type="button" role="menuitemradio" aria-checked={s === speed} onClick={() => applySpeed(s)} className={cn("w-full rounded px-3 py-1.5 text-left hover:bg-white/15", s === speed && "font-bold text-warm")}>
                        {s}×
                      </button>
                    </li>
                  ))
                : [{ index: -1, label: "Auto" }, ...levels].map((l) => (
                    <li key={l.index}>
                      <button type="button" role="menuitemradio" aria-checked={l.index === level} onClick={() => applyLevel(l.index)} className={cn("w-full rounded px-3 py-1.5 text-left hover:bg-white/15", l.index === level && "font-bold text-warm")}>
                        {l.label}
                      </button>
                    </li>
                  ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
