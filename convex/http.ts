import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { httpAction, type ActionCtx } from "./_generated/server";
import { auth } from "./auth";
import { fileDownloadUrl, resolveFilePath, scrub } from "./telegram";
import { hmacHex, safeEqual } from "../lib/signature";
import { mapRangeToPart, parseRange } from "../lib/chunks";

const http = httpRouter();
auth.addHttpRoutes(http);

/**
 * GET /media/<id> — streams a photo, video or thumbnail. Bytes come from
 * Telegram (or Convex storage while an upload is still being moved there).
 * We proxy instead of redirecting because Telegram download URLs contain the
 * bot token. Documents additionally need a valid signature (?exp=&sig=).
 * Range requests are passed through so videos can seek.
 */
const serveMedia = httpAction(async (ctx, req) => {
  const url = new URL(req.url);
  const id = url.pathname.slice("/media/".length).split("/")[0];
  const m = await ctx.runQuery(internal.media.lookup, { id });
  if (!m || m.status === "failed") return new Response("Not found", { status: 404 });

  const isDoc = m.kind === "document";
  if (isDoc) {
    const exp = Number(url.searchParams.get("exp"));
    const sig = url.searchParams.get("sig") ?? "";
    const secret = process.env.MEDIA_SIGNING_SECRET;
    const valid = !!secret && Number.isFinite(exp) && exp > Date.now() / 1000 && safeEqual(await hmacHex(secret, `${m._id}:${exp}`), sig);
    if (!valid) return new Response("Link expired", { status: 403 });
  }

  const asciiName = (m.fileName ?? m._id).replace(/[^\w.\- ]/g, "_");
  const encodedName = encodeURIComponent(m.fileName ?? m._id);
  const headers = new Headers({
    "Content-Type": m.mimeType,
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": isDoc ? "private, no-store" : "public, max-age=31536000, immutable",
    "Content-Disposition": `${isDoc ? "attachment" : "inline"}; filename="${asciiName}"; filename*=UTF-8''${encodedName}`,
  });

  const range = req.headers.get("range");
  const parts: Part[] = m.parts ?? [
    {
      size: m.size,
      storageId: m.storageId,
      storageUrl: m.storageUrl,
      tgFileId: m.tgFileId,
      tgFilePath: m.tgFilePath,
    },
  ];

  return servePart(ctx, m._id, parts, range, headers, !!m.parts);
});

type Part = {
  size: number;
  storageId?: Id<"_storage">;
  storageUrl?: string | null;
  tgFileId?: string;
  tgFilePath?: string;
};

/**
 * Multi-part or single-part media file. Byte-range requests (videos seeking,
 * Safari streaming probe, PDF viewing) return 206 Partial Content with
 * Content-Range and sliced stream. Requests without Range get status 200
 * when the file is one part (or part 0 when multi-part).
 */
async function servePart(
  ctx: ActionCtx,
  id: Id<"media">,
  parts: Part[],
  rangeHeader: string | null,
  headers: Headers,
  isMulti: boolean = true,
) {
  const sizes = parts.map((p) => p.size);
  const total = sizes.reduce((a, b) => a + b, 0);
  const range = parseRange(rangeHeader, total);
  if (range === "unsatisfiable") {
    headers.set("Content-Range", `bytes */${total}`);
    return new Response(null, { status: 416, headers });
  }
  const slice = mapRangeToPart(sizes, range?.start ?? 0, range?.end ?? total - 1);
  if (!slice) return new Response("Not found", { status: 404 });
  const part = parts[slice.index];
  const length = slice.partEnd - slice.partStart + 1;
  const wholePart = slice.partStart === 0 && slice.partEnd === part.size - 1;
  const partRange = `bytes=${slice.partStart}-${slice.partEnd}`;

  let body: ReadableStream<Uint8Array> | Blob | null = null;
  try {
    if (part.tgFileId) {
      const get = (path: string) => fetch(fileDownloadUrl(path), { headers: wholePart ? {} : { Range: partRange } });
      let path = part.tgFilePath ?? (await resolveFilePath(part.tgFileId));
      let upstream = path ? await get(path) : null;
      if (upstream && (upstream.status === 404 || upstream.status === 401)) {
        // cached path expired: resolve once more
        path = await resolveFilePath(part.tgFileId);
        upstream = path ? await get(path) : null;
      }
      if (!path || !upstream?.ok || !upstream.body) {
        console.error(`[media] upstream ${upstream?.status ?? "none"} media=${id} part=${slice.index}`);
        return new Response("Not available", { status: 502 });
      }
      if (path !== part.tgFilePath) {
        if (isMulti) await ctx.runMutation(internal.media.cachePartPath, { id, index: slice.index, path });
        else await ctx.runMutation(internal.media.cacheFilePath, { id, path });
      }
      // Telegram ignored the Range header: cut the requested bytes out of the full part.
      body = upstream.status === 206 || wholePart ? upstream.body : sliceStream(upstream.body, slice.partStart, length);
    } else if (part.storageId) {
      const blob = await ctx.storage.get(part.storageId);
      body = blob ? (wholePart ? blob : blob.slice(slice.partStart, slice.partEnd + 1)) : null;
    } else if (part.storageUrl) {
      const upstream = await fetch(part.storageUrl, { headers: wholePart ? {} : { Range: partRange } });
      if (upstream?.ok && upstream.body) {
        body = upstream.status === 206 || wholePart ? upstream.body : sliceStream(upstream.body, slice.partStart, length);
      }
    }
  } catch (err) {
    console.error(`[media] fetch failed media=${id} part=${slice.index}: ${scrub(String(err))}`);
    return new Response("Upstream error", { status: 502 });
  }
  if (!body) {
    console.error(`[media] part missing media=${id} part=${slice.index}`);
    return new Response("Not available", { status: 502 });
  }

  headers.set("Content-Length", String(length));
  if (!range && parts.length === 1) return new Response(body, { status: 200, headers });
  headers.set("Content-Range", `bytes ${slice.start}-${slice.end}/${total}`);
  return new Response(body, { status: 206, headers });
}

/** Skips `skip` bytes of a stream and passes on the next `length` bytes. */
function sliceStream(src: ReadableStream<Uint8Array>, skip: number, length: number) {
  let pos = 0;
  const end = skip + length;
  const reader = src.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done || pos >= end) {
          controller.close();
          await reader.cancel().catch(() => {});
          return;
        }
        const from = Math.max(0, skip - pos);
        const to = Math.min(value.length, end - pos);
        pos += value.length;
        if (to > from) {
          controller.enqueue(value.subarray(from, to));
          if (pos >= end) {
            controller.close();
            await reader.cancel().catch(() => {});
          }
          return;
        }
      }
    },
    cancel: (reason) => reader.cancel(reason),
  });
}

http.route({ pathPrefix: "/media/", method: "GET", handler: serveMedia });

export default http;
