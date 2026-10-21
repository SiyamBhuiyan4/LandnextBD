"use client";

import { useMutation } from "convex/react";
import { AlertTriangle, ChevronLeft, ChevronRight, Gauge, Loader2, Maximize, PictureInPicture2, Play, RotateCcw, Settings2, Volume2, VolumeX } from "lucide-react";
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
const isHlsUrl = (u: string) => /\.m3u8(\?|#|$)/i.test(u);

/**
 * Pick the sources to try, in order. HLS playlists go through hls.js (or native HLS
 * on iOS); everything else (MP4 / WebM served with Range requests, e.g. our
 * `/media/<id>` route that answers with 206 parts) is handed straight to the native
 * <video> element so the browser does progressive playback itself.
 */
function sourcesFor(v: PlayableVideo): string[] {
  const out: string[] = [];
  if (v.hlsUrl) out.push(v.hlsUrl);
  if (v.mp4Url && v.mp4Url !== v.hlsUrl) out.push(v.mp4Url);
  return out;
}

/**
 * Video player: poster + big play button, loading spinner, "Video unavailable" state
 * with retry, speed / quality / PiP / mute / fullscreen, keyboard shortcuts and
 * horizontal swipe for next/previous. Nothing is downloaded beyond metadata until
 * the viewer presses play (or `autoPlay` is set because they already chose a video).
 */
export function VideoPlayer({
  video,
  startAt,
  onNext,
  onPrev,
  autoPlay = true,
  className,
  videoClassName,
}: {
  video: PlayableVideo;
  startAt?: number | null;
  onNext?: () => void;
  onPrev?: () => void;
  autoPlay?: boolean;
  className?: string;
  videoClassName?: string;
}) {
  const t = useTranslations("video");
  const td = useTranslations("listingDetail");
  const ref = useRef<HTMLVideoElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [levels, setLevels] = useState<{ index: number; label: string }[]>([]);
  const [level, setLevel] = useState(-1);
  const [speed, setSpeed] = useState(1);
  const [menu, setMenu] = useState<"speed" | "quality" | null>(null);
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [muted, setMuted] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const wantPlay = useRef(autoPlay);
  const resumeAt = useRef<number>(startAt && startAt > 3 ? startAt : 0);
  const record = useMutation(api.videos.recordProgress);
  const lastSent = useRef({ at: 0, pos: 0 });

  // Attach source (re-run on retry). Falls through the source list on errors.
  useEffect(() => {
    const maybeEl = ref.current;
    if (!maybeEl) return;
    const el: HTMLVideoElement = maybeEl;
    let cancelled = false;
    const sources = sourcesFor(video);
    let si = 0;
    setLevels([]);
    setLevel(-1);
    setError(false);

    const start = () => {
      if (resumeAt.current > 0 && Number.isFinite(el.duration) && resumeAt.current < el.duration - 2) el.currentTime = resumeAt.current;
      el.playbackRate = speed;
      if (wantPlay.current) {
        setLoading(true);
        el.play().then(
          () => setStarted(true),
          () => setLoading(false), // autoplay blocked: keep the big play button
        );
      }
    };

    const fail = () => {
      if (cancelled) return;
      hlsRef.current?.destroy();
      hlsRef.current = null;
      si += 1;
      if (si < sources.length) attach();
      else {
        setLoading(false);
        setError(true);
      }
    };

    const attachNative = (src: string) => {
      el.addEventListener("loadedmetadata", start, { once: true });
      el.src = src;
      el.load();
    };

    function attach() {
      const src = sources[si];
      if (!src) return fail();
      const hasMse = typeof window !== "undefined" && "MediaSource" in window;
      if (isHlsUrl(src) && hasMse) {
        // hls.js whenever MediaSource exists (adaptive quality menu); native HLS only on iOS.
        import("hls.js").then(({ default: HlsCtor }) => {
          if (cancelled) return;
          if (!HlsCtor.isSupported()) return attachNative(src);
          const hls = new HlsCtor({ capLevelToPlayerSize: true, startLevel: -1 });
          hlsRef.current = hls;
          hls.loadSource(src);
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
            if (!data.fatal) return;
            console.error("[video] hls fatal error", data.type, data.details);
            fail();
          });
        }, fail);
      } else {
        attachNative(src);
      }
    }

    const onError = () => {
      // hls.js reports its own errors; native element errors mean this source failed.
      if (!hlsRef.current) fail();
    };
    el.addEventListener("error", onError);
    attach();
    lastSent.current = { at: Date.now(), pos: resumeAt.current };
    return () => {
      cancelled = true;
      el.removeEventListener("error", onError);
      el.removeEventListener("loadedmetadata", start);
      hlsRef.current?.destroy();
      hlsRef.current = null;
      el.removeAttribute("src");
      el.load();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video._id, attempt]);

  // Loading spinner + state from media events
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const busy = () => setLoading(true);
    const idle = () => setLoading(false);
    const playing = () => {
      setLoading(false);
      setStarted(true);
      setError(false);
    };
    const vol = () => setMuted(el.muted);
    el.addEventListener("waiting", busy);
    el.addEventListener("seeking", busy);
    el.addEventListener("playing", playing);
    el.addEventListener("canplay", idle);
    el.addEventListener("seeked", idle);
    el.addEventListener("pause", idle);
    el.addEventListener("volumechange", vol);
    return () => {
      el.removeEventListener("waiting", busy);
      el.removeEventListener("seeking", busy);
      el.removeEventListener("playing", playing);
      el.removeEventListener("canplay", idle);
      el.removeEventListener("seeked", idle);
      el.removeEventListener("pause", idle);
      el.removeEventListener("volumechange", vol);
    };
  }, []);

  // Progress -> watch history + seller analytics, every 10s of playback
  const flush = useCallback(() => {
    const el = ref.current;
    if (!el || !el.currentTime) return;
    const delta = Math.max(0, el.currentTime - lastSent.current.pos);
    lastSent.current = { at: Date.now(), pos: el.currentTime };
    void record({ videoId: video._id, progressSec: el.currentTime, watchedDeltaSec: Math.min(delta, 60) }).catch(() => {});
  }, [record, video._id]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onTime = () => {
      resumeAt.current = el.currentTime;
      if (Date.now() - lastSent.current.at > 10_000) flush();
    };
    const onPause = () => flush();
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("pause", onPause);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("pause", onPause);
    };
  }, [flush]);

  const play = () => {
    const el = ref.current;
    if (!el) return;
    wantPlay.current = true;
    setLoading(true);
    el.play().then(
      () => setStarted(true),
      () => setLoading(false),
    );
  };
  const retry = () => {
    wantPlay.current = true;
    setError(false);
    setLoading(true);
    setAttempt((a) => a + 1);
  };

  // Keyboard controls (when focus is inside the player)
  const onKey = (e: React.KeyboardEvent) => {
    const el = ref.current;
    if (!el) return;
    if ((e.target as HTMLElement).closest("button") && (e.key === " " || e.key === "Enter")) return;
    const k = e.key.toLowerCase();
    if (k === " " || k === "k") {
      if (el.paused) play();
      else el.pause();
    } else if (k === "arrowright") el.currentTime += 5;
    else if (k === "arrowleft") el.currentTime -= 5;
    else if (k === "arrowdown" && onNext) onNext();
    else if (k === "arrowup" && onPrev) onPrev();
    else if (k === "f") void toggleFullscreen();
    else if (k === "m") el.muted = !el.muted;
    else if (k === ">") changeSpeed(1);
    else if (k === "<") changeSpeed(-1);
    else return;
    e.preventDefault();
  };

  const changeSpeed = (dir: 1 | -1) => {
    const i = SPEEDS.indexOf(speed);
    applySpeed(SPEEDS[Math.min(SPEEDS.length - 1, Math.max(0, i + dir))]);
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
    const el = ref.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (wrap.current?.requestFullscreen) await wrap.current.requestFullscreen().catch(() => {});
    else el?.webkitEnterFullscreen?.(); // iOS Safari
  };
  const togglePip = async () => {
    const el = ref.current;
    if (!el) return;
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    else await el.requestPictureInPicture?.().catch(() => {});
  };
  const toggleMute = () => {
    if (ref.current) ref.current.muted = !ref.current.muted;
  };

  // Mobile swipe: horizontal swipe on the video switches videos
  const touch = useRef<{ x: number; y: number } | null>(null);

  const btn = "grid size-9 place-items-center rounded-full bg-black/55 text-white backdrop-blur transition hover:bg-black/75 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none";

  return (
    <div
      ref={wrap}
      data-video-player=""
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
      role="region"
      aria-label={`${video.title} — ${t("keyboardHint")}`}
    >
      <video
        ref={ref}
        className={cn("aspect-video w-full bg-black", videoClassName)}
        controls={started && !error}
        playsInline
        preload="metadata"
        poster={video.thumbnailUrl ?? undefined}
        aria-label={video.title}
      />

      {/* Poster state: big play button */}
      {!started && !error && (
        <button
          type="button"
          onClick={play}
          aria-label={`${t("play")}: ${video.title}`}
          className="absolute inset-0 grid place-items-center bg-gradient-to-t from-black/50 via-black/10 to-black/20 focus-visible:outline-none"
        >
          {loading ? (
            <Loader2 className="size-12 animate-spin text-white drop-shadow" aria-hidden />
          ) : (
            <span className="grid size-16 place-items-center rounded-full bg-white/95 text-primary shadow-xl ring-8 ring-white/20 transition group-hover:scale-110 sm:size-20">
              <Play className="ml-1 size-7 fill-current sm:size-9" aria-hidden />
            </span>
          )}
        </button>
      )}

      {/* Buffering spinner during playback */}
      {started && loading && !error && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center" role="status" aria-live="polite">
          <Loader2 className="size-12 animate-spin text-white drop-shadow" aria-hidden />
          <span className="sr-only">{td("videoLoading")}</span>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="absolute inset-0 grid place-items-center bg-black/80 p-4 text-center text-white" role="alert">
          <div className="max-w-xs space-y-3">
            <AlertTriangle className="mx-auto size-9 text-warm" aria-hidden />
            <p className="font-heading text-lg font-semibold">{td("videoUnavailable")}</p>
            <p className="text-sm text-white/75">{td("videoUnavailableHint")}</p>
            <button
              type="button"
              onClick={retry}
              className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-white/90 focus-visible:ring-3 focus-visible:ring-warm focus-visible:outline-none"
            >
              <RotateCcw className="size-4" aria-hidden /> {td("retry")}
            </button>
          </div>
        </div>
      )}

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
          <button type="button" className={btn} onClick={toggleMute} aria-label={muted ? t("unmute") : t("mute")} aria-pressed={muted}>
            {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </button>
          <button type="button" className={cn(btn, "hidden sm:grid")} onClick={togglePip} aria-label={t("pip")}>
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
