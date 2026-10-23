import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const token = "8891159487:AAHca28svvJzlc79zShH2PK6_Mxe9HGZRm4";
const chatId = "-1004372641845";
const outputPath = "/Users/mdyeakubsarker/Documents/LandnestBD/scripts/harvested-telegram-media.json";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function tg(method, params) {
  while (true) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

      const data = await res.json();
      if (data.ok) return data.result;

      if (data.error_code === 429) {
        const retryAfter = data.parameters?.retry_after ?? 2;
        console.log(`[Rate Limit 429] Waiting ${retryAfter}s on ${method}...`);
        await sleep((retryAfter + 0.5) * 1000);
        continue;
      }

      if (data.error_code === 400) {
        // e.g. message to forward not found
        return null;
      }

      console.warn(`[Telegram API warning] ${method}: ${data.error_code} - ${data.description}`);
      return null;
    } catch (err) {
      console.error(`[Network error on ${method}]:`, err.message);
      await sleep(1000);
    }
  }
}

async function harvest() {
  const result = {
    photos: [],
    videos: [],
    documents: [],
  };

  const startId = 2;
  const endId = 260;

  console.log(`Starting media harvest from ID ${startId} to ${endId}...`);

  for (let id = startId; id <= endId; id++) {
    const fwd = await tg("forwardMessage", {
      chat_id: chatId,
      from_chat_id: chatId,
      message_id: id,
      disable_notification: true,
    });

    if (!fwd) {
      // Message doesn't exist or couldn't be forwarded
      // small delay to be gentle
      await sleep(60);
      continue;
    }

    // Immediately delete the forwarded message to keep channel clean
    const forwardedMsgId = fwd.message_id;
    if (forwardedMsgId) {
      await tg("deleteMessage", {
        chat_id: chatId,
        message_id: forwardedMsgId,
      });
    }

    let detected = false;

    // Check Photo
    if (fwd.photo && Array.isArray(fwd.photo) && fwd.photo.length > 0) {
      const best = fwd.photo[fwd.photo.length - 1];
      result.photos.push({
        originalMessageId: id,
        fileId: best.file_id,
        fileUniqueId: best.file_unique_id,
        width: best.width,
        height: best.height,
        fileSize: best.file_size,
        caption: fwd.caption ?? null,
        date: fwd.date,
      });
      console.log(`[MSG ${id}] Photo found: ${best.width}x${best.height} (${best.file_size} bytes)`);
      detected = true;
    }

    // Check Video
    if (fwd.video) {
      const v = fwd.video;
      const thumb = v.thumbnail ?? v.thumb;
      result.videos.push({
        originalMessageId: id,
        fileId: v.file_id,
        fileUniqueId: v.file_unique_id,
        duration: v.duration,
        width: v.width,
        height: v.height,
        fileSize: v.file_size,
        thumbFileId: thumb?.file_id ?? null,
        fileName: v.file_name ?? null,
        mimeType: v.mime_type ?? null,
        caption: fwd.caption ?? null,
        date: fwd.date,
      });
      console.log(`[MSG ${id}] Video found: ${v.width}x${v.height}, ${v.duration}s (${v.file_size} bytes)`);
      detected = true;
    }

    // Check Animation (if not already video)
    if (fwd.animation && !fwd.video) {
      const a = fwd.animation;
      const thumb = a.thumbnail ?? a.thumb;
      result.videos.push({
        originalMessageId: id,
        fileId: a.file_id,
        fileUniqueId: a.file_unique_id,
        duration: a.duration ?? 0,
        width: a.width,
        height: a.height,
        fileSize: a.file_size,
        thumbFileId: thumb?.file_id ?? null,
        fileName: a.file_name ?? null,
        mimeType: a.mime_type ?? "video/mp4",
        caption: fwd.caption ?? null,
        date: fwd.date,
      });
      console.log(`[MSG ${id}] Animation found: ${a.width}x${a.height} (${a.file_size} bytes)`);
      detected = true;
    }

    // Check Document
    if (fwd.document && !fwd.animation) {
      const d = fwd.document;
      const thumb = d.thumbnail ?? d.thumb;
      result.documents.push({
        originalMessageId: id,
        fileId: d.file_id,
        fileUniqueId: d.file_unique_id,
        fileName: d.file_name ?? null,
        mimeType: d.mime_type ?? null,
        fileSize: d.file_size,
        thumbFileId: thumb?.file_id ?? null,
        caption: fwd.caption ?? null,
        date: fwd.date,
      });
      console.log(`[MSG ${id}] Document found: ${d.file_name} (${d.file_size} bytes)`);
      detected = true;
    }

    if (!detected) {
      if (fwd.text) {
        console.log(`[MSG ${id}] Text message (non-media)`);
      } else {
        console.log(`[MSG ${id}] Non-media / other payload type`);
      }
    }

    // Persist progress periodically or on detection
    if (detected || id % 20 === 0) {
      writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf-8");
    }

    // Short sleep between items
    await sleep(80);
  }

  // Final save
  writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf-8");
  console.log("\n--- Harvest Complete ---");
  console.log(`Total Photos: ${result.photos.length}`);
  console.log(`Total Videos: ${result.videos.length}`);
  console.log(`Total Documents: ${result.documents.length}`);
  console.log(`Saved results to: ${outputPath}`);
}

harvest().catch((err) => {
  console.error("Harvesting failed:", err);
  process.exit(1);
});
