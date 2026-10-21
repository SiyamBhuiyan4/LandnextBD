import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import { fileDownloadUrl, resolveFilePath, scrub } from "./telegram";
import { hmacHex, safeEqual } from "../lib/signature";

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

  const range = req.headers.get("range");
  let upstream: Response | null = null;
  try {
    if (m.tgFileId) {
      let path = m.tgFilePath ?? (await resolveFilePath(m.tgFileId));
      if (path) {
        upstream = await fetch(fileDownloadUrl(path), { headers: range ? { Range: range } : {} });
        if (upstream.status === 404 || upstream.status === 401) {
          // cached path expired: resolve once more
          path = await resolveFilePath(m.tgFileId);
          upstream = path ? await fetch(fileDownloadUrl(path), { headers: range ? { Range: range } : {} }) : null;
        }
        if (path && upstream?.ok) await ctx.runMutation(internal.media.cacheFilePath, { id: m._id, path });
      }
    } else if (m.storageUrl) {
      upstream = await fetch(m.storageUrl, { headers: range ? { Range: range } : {} });
    }
  } catch (err) {
    console.error(`[media] fetch failed media=${m._id}: ${scrub(String(err))}`);
    return new Response("Upstream error", { status: 502 });
  }
  if (!upstream || !upstream.ok) {
    console.error(`[media] upstream ${upstream?.status ?? "none"} media=${m._id}`);
    return new Response("Not available", { status: 502 });
  }

  const headers = new Headers({
    "Content-Type": m.mimeType,
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": isDoc ? "private, no-store" : "public, max-age=31536000, immutable",
    "Content-Disposition": `${isDoc ? "attachment" : "inline"}; filename="${(m.fileName ?? m._id).replace(/[^\w.\- ]/g, "_")}"`,
  });
  for (const h of ["content-length", "content-range"]) {
    const val = upstream.headers.get(h);
    if (val) headers.set(h, val);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
});

http.route({ pathPrefix: "/media/", method: "GET", handler: serveMedia });

export default http;
