import { NextRequest, NextResponse } from "next/server";
import { CONFIG } from "@/lib/constants";

export const runtime = "nodejs";

const API = "https://api.telegram.org";

export async function POST(req: NextRequest) {
  const token = process.env.BOT_TOKEN ?? process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return NextResponse.json({ error: "Telegram storage is not configured." }, { status: 500 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const kind = ((formData.get("kind") as string) || "image") as "image" | "document" | "video" | "thumbnail";
    const durationSec = formData.get("durationSec") ? Number(formData.get("durationSec")) : undefined;

    if (!file) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    // Telegram Bot API getFile limit is 20MB. Keep chunks <= 19MB.
    if (file.size > CONFIG.telegramChunkBytes && kind !== "video") {
      return NextResponse.json({ error: `File exceeds maximum chunk size (${CONFIG.telegramChunkBytes / 1024 / 1024}MB).` }, { status: 400 });
    }

    const isVideo = kind === "video";
    const tgForm = new FormData();
    tgForm.append("chat_id", chatId);
    tgForm.append("disable_notification", "true");
    tgForm.append("caption", `${kind} ${file.name}`);

    if (isVideo) {
      tgForm.append("video", file, file.name);
      tgForm.append("supports_streaming", "true");
      if (durationSec) {
        tgForm.append("duration", String(Math.round(durationSec)));
      }
    } else {
      tgForm.append("document", file, file.name);
      tgForm.append("disable_content_type_detection", "true");
    }

    const endpoint = isVideo ? "sendVideo" : "sendDocument";
    const res = await fetch(`${API}/bot${token}/${endpoint}`, {
      method: "POST",
      body: tgForm,
    });

    const body = await res.json();
    if (!body.ok || !body.result) {
      const msg = body.description ?? "Telegram upload failed";
      console.error(`[telegram-upload] error:`, msg);
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    const msg = body.result;
    const tgFile = msg.video ?? msg.animation ?? msg.document;

    if (!tgFile) {
      return NextResponse.json({ error: "Telegram returned no file metadata." }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      tgFileId: tgFile.file_id,
      tgFileUniqueId: tgFile.file_unique_id,
      tgMessageId: msg.message_id,
      mimeType: file.type || (isVideo ? "video/mp4" : "application/octet-stream"),
      size: file.size,
      fileName: file.name,
      width: tgFile.width,
      height: tgFile.height,
      durationSec: tgFile.duration ?? durationSec,
      thumb: isVideo && tgFile.thumbnail ? {
        fileId: tgFile.thumbnail.file_id,
        uniqueId: tgFile.thumbnail.file_unique_id,
        size: tgFile.thumbnail.file_size,
      } : undefined,
    });
  } catch (err) {
    console.error("[telegram-upload] exception:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Upload failed" }, { status: 500 });
  }
}
