"use client";

import { ConvexError } from "convex/values";

/** Human message from a Convex error (ConvexError data or a plain Error). */
export function errorMessage(e: unknown, fallback = "Something went wrong. Please try again."): string {
  if (e instanceof ConvexError) {
    const d = e.data as { message?: string } | string;
    return typeof d === "string" ? d : (d?.message ?? fallback);
  }
  if (e instanceof Error) {
    // Convex wraps server errors: "[CONVEX M(...)] ... Uncaught Error: <msg>"
    const m = e.message.match(/Uncaught (?:Convex)?Error: (.*?)(?:\n|$)/);
    return m?.[1] ?? fallback;
  }
  return fallback;
}

const SESSION_KEY = "lnb_session";

/** Anonymous per-browser id used to de-duplicate view counts. */
export function sessionId(): string {
  try {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "ephemeral-" + Math.random().toString(36).slice(2, 12);
  }
}

export function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

export type TelegramUploadResult = {
  ok: boolean;
  tgFileId: string;
  tgFileUniqueId?: string;
  tgMessageId: number;
  mimeType: string;
  size: number;
  fileName: string;
  width?: number;
  height?: number;
  durationSec?: number;
  thumb?: { fileId: string; uniqueId?: string; size?: number };
};

/** Upload a file directly to Telegram CDN via streaming API route, with progress. */
export function uploadTelegramWithProgress(
  file: Blob,
  fileName: string,
  kind: string,
  onProgress: (pct: number) => void,
  durationSec?: number,
): Promise<TelegramUploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/media/upload");
    const fd = new FormData();
    fd.append("file", file, fileName);
    fd.append("kind", kind);
    if (durationSec !== undefined) fd.append("durationSec", String(durationSec));

    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          if (res.ok) resolve(res);
          else reject(new Error(res.error || "Telegram upload failed"));
        } catch {
          reject(new Error("Upload response parsing failed"));
        }
      } else {
        try {
          const res = JSON.parse(xhr.responseText);
          reject(new Error(res.error || `Upload failed (${xhr.status})`));
        } catch {
          reject(new Error(`Upload failed (${xhr.status})`));
        }
      }
    };
    xhr.onerror = () => reject(new Error("Network error during Telegram upload"));
    xhr.send(fd);
  });
}

/** Upload a file (or a slice of one) straight to Convex storage via a signed URL, with progress. */
export function uploadWithProgress(url: string, file: Blob, onProgress: (pct: number) => void, contentType?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Content-Type", contentType || file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText).storageId);
        } catch {
          reject(new Error("Upload failed"));
        }
      } else reject(new Error(`Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(file);
  });
}

/** Reads a video's duration in the browser before upload. */
export async function videoDuration(file: File): Promise<number | undefined> {
  return (await videoInfo(file, false)).durationSec;
}

/**
 * Reads a video's duration and (optionally) grabs a poster frame as a small
 * JPEG, entirely in the browser. Either may be undefined when the browser
 * cannot decode the file (e.g. some .mov codecs).
 */
export function videoInfo(file: File, withPoster = true): Promise<{ durationSec?: number; poster?: Blob }> {
  return new Promise((resolve) => {
    const el = document.createElement("video");
    const src = URL.createObjectURL(file);
    let durationSec: number | undefined;
    let settled = false;
    const finish = (poster?: Blob) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      el.removeAttribute("src");
      el.load();
      URL.revokeObjectURL(src);
      resolve({ durationSec, poster });
    };
    const timer = setTimeout(() => finish(), 10_000);
    el.preload = "metadata";
    el.muted = true;
    el.playsInline = true;
    el.onloadedmetadata = () => {
      durationSec = Number.isFinite(el.duration) ? el.duration : undefined;
      if (!withPoster) return finish();
      el.currentTime = Math.min(1, (durationSec ?? 0) / 2);
    };
    el.onseeked = () => {
      if (!el.videoWidth || !el.videoHeight) return finish();
      try {
        const scale = Math.min(1, 640 / Math.max(el.videoWidth, el.videoHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(el.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(el.videoHeight * scale));
        canvas.getContext("2d")!.drawImage(el, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((b) => finish(b && b.size > 0 ? b : undefined), "image/jpeg", 0.8);
      } catch {
        finish();
      }
    };
    el.onerror = () => finish();
    el.src = src;
  });
}
