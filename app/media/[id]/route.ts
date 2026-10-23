// Same-origin proxy for listing photos: /media/<id> -> Convex /media/<id>.
// Lets next/image optimize them (AVIF/WebP) and lets the Vercel CDN cache them,
// so Telegram is only hit once per file. Videos stream from Convex directly.

const CONVEX_SITE = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[a-z0-9]{20,40}$/.test(id) || !CONVEX_SITE) return new Response("Not found", { status: 404 });
  const range = req.headers.get("range");
  const url = new URL(req.url);
  try {
    const upstream = await fetch(`${CONVEX_SITE}/media/${id}${url.search}`, {
      headers: range ? { Range: range } : {},
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
    const headers = new Headers();
    for (const h of [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "cache-control",
      "x-content-type-options",
      "content-disposition",
      "access-control-allow-origin",
    ]) {
      const v = upstream.headers.get(h);
      if (v) headers.set(h, v);
    }
    const upstreamCc = upstream.headers.get("cache-control") ?? "";
    if (upstream.status === 200 && !upstreamCc.includes("no-store") && !upstreamCc.includes("private")) {
      headers.set("CDN-Cache-Control", "public, max-age=31536000, immutable");
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return new Response("Media storage temporarily unavailable", {
      status: 503,
      headers: { "Retry-After": "5", "Cache-Control": "no-store" },
    });
  }
}
