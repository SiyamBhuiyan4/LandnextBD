"use client";

import { ConvexError } from "convex/values";
import { AlertCircle, ArrowLeft, ArrowRight, Camera, CheckCircle2, Clock, ImagePlus, Loader2, RotateCcw, Send, Star, Trash2, Video, X } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import type { UploadJob } from "@/hooks/use-upload";
import { useFmt } from "@/hooks/use-fmt";
import { errorMessage } from "@/lib/client";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Upload queue: files upload one at a time (kinder to slow mobile links), each
// with its own status so a failure can be retried without touching the rest.
// ---------------------------------------------------------------------------

export type QueueItem = {
  id: string;
  file: File;
  name: string;
  size: number;
  preview?: string;
  durationSec?: number;
  status: "queued" | "uploading" | "saving" | "failed";
  error?: string;
};

/** Plain-language message for an upload error (Convex errors carry their own message). */
export function uploadError(e: unknown): string {
  if (e instanceof ConvexError) return errorMessage(e);
  if (e instanceof Error && e.message && !e.message.includes("[CONVEX")) return e.message;
  return errorMessage(e);
}

export function useFileQueue(worker: (item: QueueItem, patch: (p: Partial<QueueItem>) => void) => Promise<void>) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const ref = useRef<QueueItem[]>([]);
  const running = useRef(false);
  const workerRef = useRef(worker);
  useEffect(() => {
    workerRef.current = worker;
  });

  const update = useCallback((fn: (xs: QueueItem[]) => QueueItem[]) => {
    ref.current = fn(ref.current);
    setItems(ref.current);
  }, []);
  const patchItem = useCallback((id: string, p: Partial<QueueItem>) => update((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x))), [update]);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      for (;;) {
        const next = ref.current.find((x) => x.status === "queued");
        if (!next) break;
        patchItem(next.id, { status: "uploading", error: undefined });
        try {
          await workerRef.current(next, (p) => patchItem(next.id, p));
          update((xs) => xs.filter((x) => x.id !== next.id));
        } catch (e) {
          patchItem(next.id, { status: "failed", error: uploadError(e) });
        }
      }
    } finally {
      running.current = false;
    }
  }, [patchItem, update]);

  const add = useCallback(
    (files: (Omit<QueueItem, "id" | "status" | "name" | "size"> & { status?: QueueItem["status"] })[]) => {
      update((xs) => [
        ...xs,
        ...files.map((f) => ({ ...f, id: `${f.file.name}-${f.file.size}-${Math.random().toString(36).slice(2, 8)}`, name: f.file.name, size: f.file.size, status: f.status ?? ("queued" as const) })),
      ]);
      void run();
    },
    [run, update],
  );
  const retry = useCallback(
    (id: string) => {
      patchItem(id, { status: "queued", error: undefined });
      void run();
    },
    [patchItem, run],
  );
  const remove = useCallback((id: string) => update((xs) => xs.filter((x) => x.id !== id)), [update]);
  const busy = items.some((x) => x.status !== "failed");
  return { items, add, retry, remove, busy };
}

/** Progress (0–100) of a queue item, read from the upload hook's jobs by file name. */
export function jobPct(jobs: UploadJob[], item: QueueItem) {
  if (item.status === "saving") return 100;
  if (item.status !== "uploading") return 0;
  return jobs.find((j) => j.name === item.name)?.pct ?? 0;
}

export function formatBytes(bytes: number, digits: (s: string | number) => string) {
  const mb = bytes / 1024 / 1024;
  const trim = (s: string) => s.replace(/\.0$/, "");
  if (mb >= 1024) return `${digits(trim((mb / 1024).toFixed(mb >= 10240 ? 0 : 1)))} GB`;
  if (mb >= 1) return `${digits(trim(mb.toFixed(mb >= 100 ? 0 : 1)))} MB`;
  return `${digits(Math.max(1, Math.round(bytes / 1024)))} KB`;
}

// ---------------------------------------------------------------------------
// Pickers
// ---------------------------------------------------------------------------

function DropArea({ onFiles, children, className }: { onFiles: (f: File[]) => void; children: React.ReactNode; className?: string }) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        if (![...e.dataTransfer.types].includes("Files")) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setOver(false);
        onFiles([...e.dataTransfer.files]);
      }}
      className={cn("rounded-2xl border-2 border-dashed p-4 text-center transition sm:p-6", over ? "border-primary bg-secondary" : "border-border", className)}
    >
      {children}
    </div>
  );
}

function PickButton({
  accept,
  multiple,
  capture,
  onFiles,
  children,
  testId,
  variant = "primary",
}: {
  accept: string;
  multiple?: boolean;
  capture?: "environment";
  onFiles: (f: File[]) => void;
  children: React.ReactNode;
  testId?: string;
  variant?: "primary" | "outline";
}) {
  return (
    <label
      className={cn(
        "inline-flex h-12 min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-semibold transition focus-within:ring-3 focus-within:ring-ring/40 sm:flex-none",
        variant === "primary" ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border bg-background hover:bg-muted",
      )}
    >
      {children}
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        capture={capture}
        data-testid={testId}
        className="sr-only"
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

export type Photo = { mediaId: string; url: string };

export function PhotoUploader<P extends Photo>({
  images,
  onChange,
  queue,
  jobs,
  max,
  maxMB,
  onFiles,
  previews,
}: {
  previews?: Record<string, string>;
  images: P[];
  onChange: (next: P[]) => void;
  queue: ReturnType<typeof useFileQueue>;
  jobs: UploadJob[];
  max: number;
  maxMB: number;
  onFiles: (files: File[]) => void;
}) {
  const t = useTranslations("wizard.media");
  const tc = useTranslations("common");
  const fmt = useFmt();
  const [drag, setDrag] = useState<number | null>(null);
  const pending = queue.items.filter((x) => x.status !== "failed").length;
  const full = images.length + pending >= max;

  const move = (from: number, to: number) => {
    if (to < 0 || to >= images.length || from === to) return;
    const next = [...images];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    onChange(next);
  };

  return (
    <section className="space-y-3" aria-labelledby="photos-h">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="photos-h" className="font-heading text-lg font-semibold">
          {t("photosTitle")} <span className="text-sm font-normal text-destructive">*</span>
        </h3>
        <span className={cn("rounded-full px-2.5 py-0.5 text-sm font-semibold tabular-nums", images.length ? "bg-secondary text-foreground" : "bg-muted text-muted-foreground")} aria-live="polite">
          {fmt.digits(images.length)} / {fmt.digits(max)}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">{t("photosHelp", { mb: fmt.digits(maxMB) })}</p>

      {!full && (
        <DropArea onFiles={onFiles}>
          <ImagePlus className="mx-auto hidden size-9 text-primary sm:block" aria-hidden />
          <p className="mb-3 hidden text-sm text-muted-foreground sm:block">{t("dropPhotos")}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <PickButton accept="image/*" capture="environment" onFiles={onFiles} testId="photo-camera" variant="outline">
              <Camera className="size-5" /> {t("takePhoto")}
            </PickButton>
            <PickButton accept="image/*" multiple onFiles={onFiles} testId="photo-input">
              <ImagePlus className="size-5" /> {t("choosePhotos")}
            </PickButton>
          </div>
        </DropArea>
      )}
      {full && <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">{t("photosFull", { max: fmt.digits(max) })}</p>}

      {(images.length > 0 || queue.items.length > 0) && (
        <>
          {images.length > 1 && <p className="text-xs text-muted-foreground">{t("reorderHint")}</p>}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="photo-grid">
            {images.map((img, i) => (
              <li
                key={img.mediaId}
                draggable
                onDragStart={(e) => {
                  setDrag(i);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => drag !== null && e.preventDefault()}
                onDrop={(e) => {
                  if (drag === null) return;
                  e.preventDefault();
                  move(drag, i);
                  setDrag(null);
                }}
                onDragEnd={() => setDrag(null)}
                className={cn("group relative aspect-[4/3] cursor-grab overflow-hidden rounded-xl border bg-muted active:cursor-grabbing", drag === i && "opacity-50", i === 0 && "ring-2 ring-warm")}
              >
                {/* Show the local copy when we have it: instant, and no re-download on slow links. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previews?.[img.mediaId] ?? img.url} alt={t("photoAlt", { n: fmt.digits(i + 1) })} className="pointer-events-none absolute inset-0 size-full object-cover" />
                <span className="absolute top-2 left-2 rounded-full bg-black/65 px-2 py-0.5 text-[11px] font-semibold text-white tabular-nums">{fmt.digits(i + 1)}</span>
                {i === 0 ? (
                  <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-warm px-2 py-0.5 text-[11px] font-semibold text-warm-foreground">
                    <Star className="size-3 fill-current" /> {t("cover")}
                  </span>
                ) : (
                  <button type="button" onClick={() => move(i, 0)} className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-[11px] font-medium text-white hover:bg-black/80">
                    <Star className="size-3" /> {t("makeCover")}
                  </button>
                )}
                <div className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-1">
                  <div className="flex gap-1">
                    <button type="button" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label={t("moveEarlier")} className="grid size-8 place-items-center rounded-full bg-black/65 text-white disabled:opacity-30">
                      <ArrowLeft className="size-4" />
                    </button>
                    <button type="button" disabled={i === images.length - 1} onClick={() => move(i, i + 1)} aria-label={t("moveLater")} className="grid size-8 place-items-center rounded-full bg-black/65 text-white disabled:opacity-30">
                      <ArrowRight className="size-4" />
                    </button>
                  </div>
                  <button type="button" onClick={() => onChange(images.filter((x) => x.mediaId !== img.mediaId))} aria-label={t("removePhoto", { n: fmt.digits(i + 1) })} className="grid size-8 place-items-center rounded-full bg-black/65 text-white hover:bg-destructive">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </li>
            ))}
            {queue.items.map((q) => {
              const pct = jobPct(jobs, q);
              return (
                <li key={q.id} className={cn("relative aspect-[4/3] overflow-hidden rounded-xl border bg-muted", q.status === "failed" && "border-destructive")}>
                  {q.preview && (
                    // Local blob preview: next/image can't optimise object URLs.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={q.preview} alt="" className="absolute inset-0 size-full object-cover opacity-60" />
                  )}
                  <div className="absolute inset-0 grid place-items-center bg-black/35 p-2 text-center text-white">
                    {q.status === "failed" ? (
                      <div className="space-y-1.5">
                        <AlertCircle className="mx-auto size-5" />
                        <p className="line-clamp-2 text-[11px] leading-tight">{q.error}</p>
                        <div className="flex justify-center gap-1">
                          <button type="button" onClick={() => queue.retry(q.id)} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-black">
                            <RotateCcw className="size-3" /> {tc("retry")}
                          </button>
                          <button type="button" onClick={() => queue.remove(q.id)} aria-label={tc("delete")} className="grid size-6 place-items-center rounded-full bg-white/90 text-black">
                            <X className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="w-4/5 space-y-1.5">
                        {q.status === "queued" ? <Clock className="mx-auto size-5" /> : <Loader2 className="mx-auto size-5 animate-spin" />}
                        <p className="text-xs font-semibold tabular-nums">{q.status === "queued" ? t("waiting") : `${fmt.digits(pct)}%`}</p>
                        <div className="h-1.5 overflow-hidden rounded-full bg-white/30">
                          <div className="h-full rounded-full bg-white transition-[width]" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Videos
// ---------------------------------------------------------------------------

export type ServerVideo = {
  _id: string;
  title: string;
  status: "processing" | "ready" | "failed";
  moderation: string;
  durationSec?: number;
  thumbnailUrl: string | null;
  errorMessage?: string;
};

function VideoSteps({ stage }: { stage: 0 | 1 | 2 }) {
  // 0 uploading, 1 sending to Telegram, 2 ready
  const t = useTranslations("wizard.media");
  const labels = [t("stageUpload"), t("stageTelegram"), t("stageReady")];
  return (
    <ol className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px]">
      {labels.map((l, i) => {
        const done = stage > i || stage === 2;
        const now = stage === i && stage < 2;
        return (
          <li key={l} className="flex items-center gap-1.5">
            {i > 0 && <span className={cn("h-px w-3", done || now ? "bg-primary" : "bg-border")} />}
            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium", done ? "bg-primary/10 text-primary" : now ? "bg-secondary text-foreground" : "bg-muted text-muted-foreground")}>
              {done ? <CheckCircle2 className="size-3" /> : now ? <Loader2 className="size-3 animate-spin" /> : i === 1 ? <Send className="size-3" /> : null}
              {l}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function VideoUploader({
  videos,
  queue,
  jobs,
  maxCount,
  maxBytes,
  maxDurationSec,
  onFiles,
  onRemove,
}: {
  videos: ServerVideo[] | undefined;
  queue: ReturnType<typeof useFileQueue>;
  jobs: UploadJob[];
  maxCount: number;
  maxBytes: number;
  maxDurationSec: number;
  onFiles: (files: File[]) => void;
  onRemove: (id: string) => void;
}) {
  const t = useTranslations("wizard.media");
  const tv = useTranslations("video");
  const tc = useTranslations("common");
  const fmt = useFmt();
  const used = (videos?.filter((v) => v.status !== "failed").length ?? 0) + queue.items.filter((x) => x.status !== "failed").length;
  const full = used >= maxCount;
  const mins = Math.round(maxDurationSec / 60);

  return (
    <section className="space-y-3" aria-labelledby="videos-h">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="videos-h" className="font-heading text-lg font-semibold">
          {t("videosTitle")} <span className="text-sm font-normal text-muted-foreground">({tc("optional")})</span>
        </h3>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-sm font-semibold text-muted-foreground tabular-nums">
          {fmt.digits(used)} / {fmt.digits(maxCount)}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">{t("videosHelp", { size: formatBytes(maxBytes, fmt.digits), min: fmt.digits(mins) })}</p>

      {!full && (
        <DropArea onFiles={onFiles}>
          <Video className="mx-auto hidden size-9 text-primary sm:block" aria-hidden />
          <p className="mb-3 hidden text-sm text-muted-foreground sm:block">{t("dropVideos")}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <PickButton accept="video/*" capture="environment" onFiles={onFiles} testId="video-camera" variant="outline">
              <Camera className="size-5" /> {t("recordVideo")}
            </PickButton>
            <PickButton accept="video/*" multiple onFiles={onFiles} testId="video-input">
              <Video className="size-5" /> {t("chooseVideos")}
            </PickButton>
          </div>
        </DropArea>
      )}

      {(queue.items.length > 0 || (videos?.length ?? 0) > 0) && (
        <ul className="space-y-2" data-testid="video-list" aria-live="polite">
          {queue.items.map((q) => {
            const pct = jobPct(jobs, q);
            return (
              <li key={q.id} className={cn("rounded-xl border p-3 text-sm", q.status === "failed" && "border-destructive/60 bg-destructive/5")}>
                <div className="flex items-start gap-3">
                  <Video className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{q.name}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {formatBytes(q.size, fmt.digits)}
                      {q.durationSec ? ` · ${fmt.duration(q.durationSec)}` : ""}
                    </p>
                  </div>
                  {q.status === "failed" ? (
                    <div className="flex shrink-0 gap-1">
                      <button type="button" onClick={() => queue.retry(q.id)} className="inline-flex h-8 items-center gap-1 rounded-lg border bg-background px-2.5 text-xs font-semibold hover:bg-muted">
                        <RotateCcw className="size-3.5" /> {tc("retry")}
                      </button>
                      <button type="button" onClick={() => queue.remove(q.id)} aria-label={tc("delete")} className="grid size-8 place-items-center rounded-lg hover:bg-muted">
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  ) : (
                    <span className="shrink-0 text-sm font-semibold tabular-nums">{q.status === "queued" ? t("waiting") : `${fmt.digits(pct)}%`}</span>
                  )}
                </div>
                {q.status === "failed" ? (
                  <p className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
                    <AlertCircle className="mt-px size-3.5 shrink-0" /> {q.error}
                  </p>
                ) : (
                  <>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                      {q.status === "queued" ? t("waitingHint") : t("uploadedOf", { done: formatBytes((q.size * pct) / 100, fmt.digits), total: formatBytes(q.size, fmt.digits) })}
                    </p>
                    <VideoSteps stage={0} />
                  </>
                )}
              </li>
            );
          })}
          {videos?.map((v) => (
            <li key={v._id} data-status={v.status} className={cn("flex items-start gap-3 rounded-xl border p-3 text-sm", v.status === "failed" && "border-destructive/60 bg-destructive/5")}>
              <div className="relative grid h-12 w-20 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted">
                {v.thumbnailUrl ? <Image src={v.thumbnailUrl} alt="" fill sizes="80px" className="object-cover" unoptimized /> : <Video className="size-5 text-muted-foreground" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{v.title}</p>
                <p className="text-xs text-muted-foreground">
                  {v.durationSec ? fmt.duration(v.durationSec) : ""}
                  {v.status === "ready" && v.moderation === "pending" ? ` · ${tv("pendingModeration")}` : ""}
                </p>
                {v.status === "failed" ? (
                  <p className="mt-1 flex items-start gap-1.5 text-xs text-destructive">
                    <AlertCircle className="mt-px size-3.5 shrink-0" /> {tv("failed")}
                    {v.errorMessage ? `: ${v.errorMessage}` : ""} — {t("failedHint")}
                  </p>
                ) : (
                  <VideoSteps stage={v.status === "ready" ? 2 : 1} />
                )}
              </div>
              <button type="button" onClick={() => onRemove(v._id)} aria-label={tc("delete")} className="grid size-8 shrink-0 place-items-center rounded-lg hover:bg-muted">
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
