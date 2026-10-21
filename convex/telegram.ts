import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";

// Telegram is the byte store for photos, videos and documents. Files are posted
// to a private channel (TELEGRAM_CHAT_ID) by the bot (TELEGRAM_BOT_TOKEN) and
// referenced by file_id. The token only ever lives in Convex env vars; every
// error message and log line is scrubbed of it, and browsers are never given
// a Telegram URL (the /media HTTP action proxies the bytes instead).

const API = "https://api.telegram.org";

function token() {
  return process.env.TELEGRAM_BOT_TOKEN ?? "";
}

export function scrub(text: string) {
  const t = token();
  return t ? text.split(t).join("<token>") : text;
}

type TgFile = { file_id: string; file_unique_id?: string; file_size?: number; width?: number; height?: number; duration?: number; thumbnail?: TgFile };
type TgResponse<T> = { ok: boolean; result?: T; error_code?: number; description?: string; parameters?: { retry_after?: number } };

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "application/pdf": "pdf",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

export const push = internalAction({
  args: { mediaId: v.id("media") },
  handler: async (ctx, { mediaId }) => {
    const m = await ctx.runQuery(internal.media.getInternal, { id: mediaId });
    if (!m || m.tgFileId || !m.storageId) return;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token() || !chatId) {
      await ctx.runMutation(internal.media.markLocalReady, { id: mediaId });
      return;
    }
    const blob = await ctx.storage.get(m.storageId);
    if (!blob) {
      await ctx.runMutation(internal.media.markPushFailed, { id: mediaId, error: "Upload missing from storage" });
      return;
    }

    const isVideo = m.kind === "video";
    const form = new FormData();
    form.append("chat_id", chatId);
    form.append("disable_notification", "true");
    form.append("caption", `${m.kind} ${mediaId}`);
    const name = `${mediaId}.${EXT[m.mimeType] ?? "bin"}`;
    if (isVideo) {
      form.append("video", blob, name);
      form.append("supports_streaming", "true");
      if (m.durationSec) form.append("duration", String(Math.round(m.durationSec)));
    } else {
      // sendDocument keeps the original file (sendPhoto would recompress it).
      form.append("document", blob, name);
      form.append("disable_content_type_detection", "true");
    }

    let body: TgResponse<{ message_id: number; video?: TgFile; document?: TgFile; animation?: TgFile }>;
    try {
      const res = await fetch(`${API}/bot${token()}/${isVideo ? "sendVideo" : "sendDocument"}`, { method: "POST", body: form });
      body = await res.json();
    } catch (err) {
      const msg = scrub(err instanceof Error ? err.message : String(err));
      await ctx.runMutation(internal.media.markPushFailed, { id: mediaId, error: msg, retryInSec: 30 });
      return;
    }
    if (!body.ok || !body.result) {
      const error = scrub(`${body.error_code ?? "?"}: ${body.description ?? "unknown error"}`);
      const retryable = body.error_code === 429 || (body.error_code ?? 0) >= 500;
      await ctx.runMutation(internal.media.markPushFailed, {
        id: mediaId,
        error,
        retryInSec: retryable ? (body.parameters?.retry_after ?? 30) + 1 : undefined,
      });
      return;
    }
    const msg = body.result;
    const file = msg.video ?? msg.animation ?? msg.document;
    if (!file) {
      await ctx.runMutation(internal.media.markPushFailed, { id: mediaId, error: "Telegram returned no file" });
      return;
    }
    await ctx.runMutation(internal.media.markPushed, {
      id: mediaId,
      tgFileId: file.file_id,
      tgFileUniqueId: file.file_unique_id,
      tgMessageId: msg.message_id,
      width: file.width,
      height: file.height,
      durationSec: file.duration,
      thumb: isVideo && file.thumbnail ? { fileId: file.thumbnail.file_id, uniqueId: file.thumbnail.file_unique_id, size: file.thumbnail.file_size } : undefined,
    });
  },
});

/** Moves every file still held in Convex storage to Telegram (run after setting TELEGRAM_CHAT_ID). */
export const backfill = internalAction({
  args: {},
  handler: async (ctx): Promise<string> => {
    const ids: Id<"media">[] = await ctx.runQuery(internal.media.notOnTelegram, {});
    // Telegram allows ~20 posts/minute per chat: space them out.
    ids.forEach((id, i) => void ctx.scheduler.runAfter(i * 3200, internal.telegram.push, { mediaId: id }));
    return `${ids.length} files queued (≈${Math.ceil((ids.length * 3.2) / 60)} min).`;
  },
});

export const deleteMessage = internalAction({
  args: { messageId: v.number() },
  handler: async (_ctx, { messageId }) => {
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token() || !chatId) return;
    const res = await fetch(`${API}/bot${token()}/deleteMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
    });
    if (!res.ok) console.warn(`[telegram] deleteMessage ${messageId} failed: ${res.status}`);
  },
});

/** Returns the file's download path (valid for at least one hour). Server-side only. */
export async function resolveFilePath(fileId: string): Promise<string | null> {
  const res = await fetch(`${API}/bot${token()}/getFile?file_id=${encodeURIComponent(fileId)}`);
  const body = (await res.json()) as TgResponse<{ file_path?: string }>;
  return body.ok ? (body.result?.file_path ?? null) : null;
}

export function fileDownloadUrl(path: string) {
  return `${API}/file/bot${token()}/${path}`;
}
