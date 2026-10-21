"use client";

import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useCallback, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { chunkBounds } from "@/lib/chunks";
import { uploadWithProgress, videoInfo } from "@/lib/client";
import { CONFIG } from "@/lib/constants";

export type UploadKind = "image" | "document" | "video";
export type UploadJob = { key: string; name: string; pct: number; error?: string };

/** Downscale big photos in the browser before upload (saves data on mobile). */
async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/avif") return file;
  try {
    const bmp = await createImageBitmap(file);
    const max = 1920;
    if (bmp.width <= max && bmp.height <= max && file.size < 1.5 * 1024 * 1024) return file;
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".webp", { type: "image/webp" });
  } catch {
    return file;
  }
}

const tooLarge = (msg: string) => new ConvexError({ code: "INVALID_FILE", message: msg });

/**
 * Signed-URL upload: bytes go browser -> Convex storage directly, then the
 * server validates type/size and queues the move to Telegram. Files bigger
 * than CONFIG.telegramChunkBytes (big videos) are sent as consecutive slices,
 * each to its own upload URL, and confirmed together as one media item.
 */
export function useUpload() {
  const gen = useMutation(api.media.generateUploadUrl);
  const confirm = useMutation(api.media.confirmUpload);
  const confirmParts = useMutation(api.media.confirmParts);
  const discard = useMutation(api.media.discardUploads);
  const [jobs, setJobs] = useState<UploadJob[]>([]);

  const upload = useCallback(
    async (raw: File, kind: UploadKind): Promise<{ mediaId: Id<"media">; url: string | null; durationSec?: number }> => {
      const key = `${raw.name}-${raw.size}-${Date.now()}`;
      const setPct = (pct: number) => setJobs((j) => j.map((x) => (x.key === key ? { ...x, pct: Math.min(100, Math.round(pct)) } : x)));
      setJobs((j) => [...j, { key, name: raw.name, pct: 0 }]);
      const uploaded: string[] = [];
      let confirmed = false;
      try {
        if (kind === "video") {
          if (!(CONFIG.videoMimeTypes as readonly string[]).includes(raw.type)) throw tooLarge(`File type ${raw.type || "unknown"} is not allowed.`);
          if (raw.size > CONFIG.maxVideoBytes) throw tooLarge(`Video is too large (max ${CONFIG.maxVideoBytes / 1024 / 1024 / 1024} GB).`);
        }
        const file = kind === "image" ? await compressImage(raw) : raw;
        const info = kind === "video" ? await videoInfo(file) : {};
        const durationSec = info.durationSec;
        if (kind === "video" && durationSec !== undefined && durationSec > CONFIG.maxVideoDurationSec)
          throw tooLarge(`Videos can be at most ${CONFIG.maxVideoDurationSec / 60} minutes.`);

        // One storage upload per slice (single slice for normal files), retried on network errors.
        const sendBlob = async (blob: Blob, onPct: (pct: number) => void, type: string) => {
          for (let attempt = 1; ; attempt++) {
            try {
              const id = await uploadWithProgress(await gen({ kind }), blob, onPct, type);
              uploaded.push(id);
              return id as Id<"_storage">;
            } catch (e) {
              if (attempt >= 3 || e instanceof ConvexError) throw e;
              await new Promise((r) => setTimeout(r, 1500 * attempt));
            }
          }
        };

        let thumbStorageId: Id<"_storage"> | undefined;
        if (info.poster) thumbStorageId = await sendBlob(info.poster, () => {}, "image/jpeg").catch(() => undefined);

        let res: { mediaId: Id<"media">; url: string | null };
        if (file.size <= CONFIG.telegramChunkBytes) {
          const storageId = await sendBlob(file, setPct, file.type);
          res = await confirm({ storageId, kind, fileName: raw.name, durationSec, thumbStorageId });
        } else {
          const storageIds: Id<"_storage">[] = [];
          for (const { start, end } of chunkBounds(file.size, CONFIG.telegramChunkBytes)) {
            storageIds.push(await sendBlob(file.slice(start, end), (pct) => setPct(((start + ((end - start) * pct) / 100) / file.size) * 100), file.type));
          }
          res = await confirmParts({ storageIds, size: file.size, mimeType: file.type, kind, fileName: raw.name, durationSec, thumbStorageId });
        }
        confirmed = true;
        setJobs((j) => j.filter((x) => x.key !== key));
        return { ...res, durationSec };
      } catch (e) {
        setJobs((j) => j.filter((x) => x.key !== key));
        if (!confirmed && uploaded.length) void discard({ storageIds: uploaded as Id<"_storage">[] }).catch(() => {});
        throw e;
      }
    },
    [gen, confirm, confirmParts, discard],
  );

  return { upload, jobs };
}
