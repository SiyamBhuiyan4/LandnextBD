"use client";

import { useMutation } from "convex/react";
import { useCallback, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { uploadWithProgress, videoDuration } from "@/lib/client";

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

/**
 * Signed-URL upload: bytes go browser -> Convex storage directly, then the
 * server validates type/size and queues the move to Telegram.
 */
export function useUpload() {
  const gen = useMutation(api.media.generateUploadUrl);
  const confirm = useMutation(api.media.confirmUpload);
  const [jobs, setJobs] = useState<UploadJob[]>([]);

  const upload = useCallback(
    async (raw: File, kind: UploadKind): Promise<{ mediaId: Id<"media">; url: string | null; durationSec?: number }> => {
      const key = `${raw.name}-${raw.size}-${Date.now()}`;
      setJobs((j) => [...j, { key, name: raw.name, pct: 0 }]);
      try {
        const file = kind === "image" ? await compressImage(raw) : raw;
        const durationSec = kind === "video" ? await videoDuration(file) : undefined;
        const url = await gen({ kind });
        const storageId = await uploadWithProgress(url, file, (pct) => setJobs((j) => j.map((x) => (x.key === key ? { ...x, pct } : x))));
        const res = await confirm({ storageId: storageId as Id<"_storage">, kind, fileName: raw.name, durationSec });
        setJobs((j) => j.filter((x) => x.key !== key));
        return { ...res, durationSec };
      } catch (e) {
        setJobs((j) => j.filter((x) => x.key !== key));
        throw e;
      }
    },
    [gen, confirm],
  );

  return { upload, jobs };
}
