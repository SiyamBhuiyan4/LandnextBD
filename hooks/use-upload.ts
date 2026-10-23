"use client";

import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useCallback, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { chunkBounds } from "@/lib/chunks";
import { uploadTelegramWithProgress, videoInfo } from "@/lib/client";
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
 * Direct Telegram CDN Upload: bytes stream directly to Telegram Bot channel
 * via the Next.js /api/media/upload streaming gateway, bypassing Convex storage
 * completely. The Telegram file_id is registered directly into the Convex media table.
 */
export function useUpload() {
  const registerUpload = useMutation(api.media.registerDirectUpload);
  const registerParts = useMutation(api.media.registerDirectParts);
  const [jobs, setJobs] = useState<UploadJob[]>([]);

  const upload = useCallback(
    async (raw: File, kind: UploadKind): Promise<{ mediaId: Id<"media">; url: string | null; durationSec?: number }> => {
      const key = `${raw.name}-${raw.size}-${Date.now()}`;
      const setPct = (pct: number) => setJobs((j) => j.map((x) => (x.key === key ? { ...x, pct: Math.min(100, Math.round(pct)) } : x)));
      setJobs((j) => [...j, { key, name: raw.name, pct: 0 }]);
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

        let thumb: { fileId: string; uniqueId?: string; size?: number } | undefined;
        if (info.poster) {
          try {
            const posterRes = await uploadTelegramWithProgress(info.poster, "poster.jpg", "image", () => {});
            thumb = {
              fileId: posterRes.tgFileId,
              uniqueId: posterRes.tgFileUniqueId,
              size: posterRes.size,
            };
          } catch {
            /* optional poster */
          }
        }

        let res: { mediaId: Id<"media">; url: string | null };
        if (file.size <= CONFIG.telegramChunkBytes) {
          const up = await uploadTelegramWithProgress(file, raw.name, kind, setPct, durationSec);
          res = await registerUpload({
            kind,
            tgFileId: up.tgFileId,
            tgFileUniqueId: up.tgFileUniqueId,
            tgMessageId: up.tgMessageId,
            mimeType: up.mimeType || file.type || "application/octet-stream",
            size: up.size || file.size,
            fileName: raw.name,
            width: up.width,
            height: up.height,
            durationSec,
            thumb: thumb || up.thumb,
          });
        } else {
          // Multi-part video upload: slice into <= 19MB chunks directly to Telegram
          const bounds = chunkBounds(file.size, CONFIG.telegramChunkBytes);
          const parts: { size: number; tgFileId: string; tgFileUniqueId?: string; tgMessageId: number }[] = [];
          for (const [idx, { start, end }] of bounds.entries()) {
            const slice = file.slice(start, end);
            const partName = `${raw.name}.part${idx + 1}`;
            const up = await uploadTelegramWithProgress(
              slice,
              partName,
              kind,
              (pct) => setPct(((start + ((end - start) * pct) / 100) / file.size) * 100),
              durationSec,
            );
            parts.push({
              size: up.size || slice.size,
              tgFileId: up.tgFileId,
              tgFileUniqueId: up.tgFileUniqueId,
              tgMessageId: up.tgMessageId,
            });
          }
          res = await registerParts({
            kind,
            parts,
            size: file.size,
            mimeType: file.type || "video/mp4",
            fileName: raw.name,
            durationSec,
            thumb,
          });
        }
        setJobs((j) => j.filter((x) => x.key !== key));
        return { ...res, durationSec };
      } catch (e) {
        setJobs((j) => j.filter((x) => x.key !== key));
        throw e;
      }
    },
    [registerUpload, registerParts],
  );

  return { upload, jobs };
}
