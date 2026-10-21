import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";

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
    if (!m) return;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (m.parts) {
      if (!token() || !chatId) {
        if (m.status !== "ready") await ctx.runMutation(internal.media.markLocalReady, { id: mediaId });
        return;
      }
      await pushNextPart(ctx, mediaId, m.kind, chatId);
      return;
    }
    if (m.tgFileId || !m.storageId) return;
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

/**
 * Sends one part of a multi-part file (big video) with sendDocument. Each
 * scheduled run handles a single part (≤ 19 MB in memory); markPartPushed
 * queues the next run 3.2 s later, so a 1 GB video takes ~54 runs.
 */
async function pushNextPart(ctx: ActionCtx, mediaId: Id<"media">, kind: string, chatId: string) {
  const claim = await ctx.runMutation(internal.media.claimNextPart, { id: mediaId });
  if (!claim) return; // done, or another run is on it
  const label = `part${String(claim.index + 1).padStart(2, "0")}`;
  const blob = claim.storageId ? await ctx.storage.get(claim.storageId) : null;
  if (!blob) {
    await ctx.runMutation(internal.media.markPushFailed, { id: mediaId, error: `Upload ${label} missing from storage` });
    return;
  }
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("disable_notification", "true");
  form.append("caption", `${kind} ${mediaId} part ${claim.index + 1}/${claim.count}`);
  form.append("document", blob, `${mediaId}.${label}`);
  form.append("disable_content_type_detection", "true");
  let body: TgResponse<{ message_id: number; document?: TgFile }>;
  try {
    const res = await fetch(`${API}/bot${token()}/sendDocument`, { method: "POST", body: form });
    body = await res.json();
  } catch (err) {
    const msg = scrub(err instanceof Error ? err.message : String(err));
    await ctx.runMutation(internal.media.markPushFailed, { id: mediaId, error: `${label}: ${msg}`, retryInSec: 30 });
    return;
  }
  if (!body.ok || !body.result?.document) {
    const error = scrub(`${label} ${body.error_code ?? "?"}: ${body.description ?? "Telegram returned no file"}`);
    const retryable = body.error_code === 429 || (body.error_code ?? 0) >= 500;
    await ctx.runMutation(internal.media.markPushFailed, {
      id: mediaId,
      error,
      retryInSec: retryable ? (body.parameters?.retry_after ?? 30) + 1 : undefined,
    });
    return;
  }
  const doc = body.result.document;
  await ctx.runMutation(internal.media.markPartPushed, {
    id: mediaId,
    index: claim.index,
    tgFileId: doc.file_id,
    tgFileUniqueId: doc.file_unique_id,
    tgMessageId: body.result.message_id,
  });
}

/** Moves every file still held in Convex storage to Telegram (run after setting TELEGRAM_CHAT_ID). */
export const backfill = internalAction({
  args: {},
  handler: async (ctx): Promise<string> => {
    const queue: { id: Id<"media">; posts: number }[] = await ctx.runQuery(internal.media.pushQueue, {});
    // Telegram allows ~20 posts/minute per chat: space them out. A multi-part
    // file chains its own parts 3.2 s apart, so the next file starts after it.
    let at = 0;
    for (const { id, posts } of queue) {
      await ctx.scheduler.runAfter(at, internal.telegram.push, { mediaId: id });
      at += posts * 3200;
    }
    const parts = queue.reduce((s, q) => s + q.posts, 0);
    return `${queue.length} files (${parts} posts) queued (≈${Math.ceil((parts * 3.2) / 60)} min).`;
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
