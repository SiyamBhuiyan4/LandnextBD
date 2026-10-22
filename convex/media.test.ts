/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { uploadError } from "./media";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const PART = 1000;

beforeEach(() => {
  vi.useFakeTimers();
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
});

/** Deterministic file content: byte i = i % 251. */
const bytes = (from: number, to: number) => Uint8Array.from({ length: to - from }, (_, i) => (from + i) % 251);

async function setup(sizes = [PART, PART, 500], type = "video/mp4") {
  const t = convexTest(schema, modules);
  const seller = await t.run((ctx) =>
    ctx.db.insert("users", { email: "s@test.test", role: "seller", verificationStatus: "unverified", accountType: "owner", createdAt: Date.now() }),
  );
  let off = 0;
  const storageIds: Id<"_storage">[] = [];
  for (const size of sizes) {
    const b = new Blob([bytes(off, off + size)], { type });
    storageIds.push(await t.run((ctx) => ctx.storage.store(b)));
    off += size;
  }
  const as = t.withIdentity({ subject: `${seller}|session` });
  return { t, as, seller, storageIds, total: off };
}

const body = async (r: Response) => new Uint8Array(await r.arrayBuffer());

describe("upload validation", () => {
  it("gives clear messages", () => {
    expect(uploadError("video", "video/mp4", 1024 * 1024 * 1024 + 1)).toBe("Video is too large (max 1 GB).");
    expect(uploadError("video", "video/mp4", 1024 * 1024 * 1024)).toBeNull();
    expect(uploadError("video", "video/x-matroska", 10)).toBe("File type video/x-matroska is not allowed.");
    expect(uploadError("video", "video/mp4", 10, 31 * 60)).toMatch(/at most 30 minutes/);
    expect(uploadError("image", "image/png", 9 * 1024 * 1024)).toBe("File is too large (max 8 MB).");
  });

  it("confirms a multi-part video from storage metadata", async () => {
    const { t, as, storageIds, total } = await setup();
    const { mediaId } = await as.mutation(api.media.confirmParts, { storageIds, size: total, mimeType: "video/mp4", kind: "video", durationSec: 60 });
    const m = await t.run((ctx) => ctx.db.get(mediaId));
    expect(m?.parts?.map((p) => p.size)).toEqual([PART, PART, 500]);
    expect(m?.size).toBe(total);
    expect(m?.mimeType).toBe("video/mp4");
    expect(m?.storageId).toBeUndefined();
  });

  it("rejects wrong totals, types, durations and anonymous callers", async () => {
    const { t, as, storageIds, total } = await setup();
    await expect(as.mutation(api.media.confirmParts, { storageIds, size: total + 1, mimeType: "video/mp4", kind: "video" })).rejects.toThrow(/incomplete/);
    await expect(t.mutation(api.media.confirmParts, { storageIds, size: total, mimeType: "video/mp4", kind: "video" })).rejects.toThrow();
    await expect(
      as.mutation(api.media.confirmParts, { storageIds, size: total, mimeType: "video/mp4", kind: "video", durationSec: 3600 }),
    ).rejects.toThrow(/at most 30 minutes/);
    const bad = await setup([PART, 10], "application/zip");
    await expect(
      bad.as.mutation(api.media.confirmParts, { storageIds: bad.storageIds, size: bad.total, mimeType: "video/mp4", kind: "video" }),
    ).rejects.toThrow(/application\/zip is not allowed/);
    await expect(
      as.mutation(api.media.confirmParts, { storageIds: [storageIds[0], storageIds[0]], size: 2 * PART, mimeType: "video/mp4", kind: "video" }),
    ).rejects.toThrow(/incomplete/);
  });

  it("discards unconfirmed uploads", async () => {
    const { t, as, storageIds } = await setup();
    expect(await as.mutation(api.media.discardUploads, { storageIds })).toBe(3);
    expect(await t.run((ctx) => ctx.db.system.get(storageIds[0]))).toBeNull();
  });
});

describe("multi-part serving (no Telegram channel)", () => {
  it("answers ranges from one part at a time with the right bytes", async () => {
    const { t, as, storageIds, total } = await setup();
    const { mediaId } = await as.mutation(api.media.confirmParts, { storageIds, size: total, mimeType: "video/mp4", kind: "video" });
    await t.action(internal.telegram.push, { mediaId });
    expect((await t.run((ctx) => ctx.db.get(mediaId)))?.status).toBe("ready");

    let r = await t.fetch(`/media/${mediaId}`);
    expect(r.status).toBe(206);
    expect(r.headers.get("content-range")).toBe(`bytes 0-${PART - 1}/${total}`);
    expect(r.headers.get("content-length")).toBe(String(PART));
    expect(r.headers.get("accept-ranges")).toBe("bytes");
    expect(await body(r)).toEqual(bytes(0, PART));

    // across a boundary: clipped to the end of part 0
    r = await t.fetch(`/media/${mediaId}`, { headers: { Range: "bytes=900-1100" } });
    expect(r.headers.get("content-range")).toBe(`bytes 900-999/${total}`);
    expect(await body(r)).toEqual(bytes(900, 1000));
    // the browser's follow-up request
    r = await t.fetch(`/media/${mediaId}`, { headers: { Range: "bytes=1000-" } });
    expect(r.headers.get("content-range")).toBe(`bytes 1000-1999/${total}`);
    expect(await body(r)).toEqual(bytes(1000, 2000));
    r = await t.fetch(`/media/${mediaId}`, { headers: { Range: "bytes=-100" } });
    expect(r.headers.get("content-range")).toBe(`bytes 2400-2499/${total}`);
    expect(await body(r)).toEqual(bytes(2400, 2500));
    r = await t.fetch(`/media/${mediaId}`, { headers: { Range: `bytes=${total}-` } });
    expect(r.status).toBe(416);
    expect(r.headers.get("content-range")).toBe(`bytes */${total}`);
  });
});

describe("multi-part push to Telegram (mocked Bot API)", () => {
  it("posts each part, drops storage, marks ready and streams parts back", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "TEST_TOKEN";
    process.env.TELEGRAM_CHAT_ID = "-100123";
    const { t, as, storageIds, total } = await setup();
    const stored = new Map<string, Uint8Array>();
    let msg = 0;
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/sendDocument")) {
          const form = init!.body as FormData;
          const file = form.get("document") as File;
          calls.push(file.name);
          const id = `file${++msg}`;
          stored.set(id, new Uint8Array(await file.arrayBuffer()));
          return Response.json({ ok: true, result: { message_id: msg, document: { file_id: id, file_unique_id: `u${msg}` } } });
        }
        if (url.includes("/getFile")) {
          const id = new URL(url).searchParams.get("file_id")!;
          return Response.json({ ok: true, result: { file_path: `documents/${id}` } });
        }
        if (url.includes("/file/bot")) {
          const data = stored.get(url.split("/").pop()!)!;
          const range = new Headers(init?.headers).get("range");
          if (!range) return new Response(new Blob([data as BlobPart]), { status: 200 });
          const [a, b] = range.replace("bytes=", "").split("-").map(Number);
          return new Response(new Blob([data.slice(a, b + 1) as BlobPart]), { status: 206 });
        }
        if (url.endsWith("/deleteMessage")) return Response.json({ ok: true });
        throw new Error(`unexpected fetch ${url}`);
      }),
    );
    const { mediaId } = await as.mutation(api.media.confirmParts, { storageIds, size: total, mimeType: "video/mp4", kind: "video" });
    await t.action(internal.telegram.push, { mediaId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const m = await t.run((ctx) => ctx.db.get(mediaId));
    expect(m?.status).toBe("ready");
    expect(calls).toEqual([`${mediaId}.part01`, `${mediaId}.part02`, `${mediaId}.part03`]);
    expect(m?.parts?.every((p) => p.tgFileId && p.tgMessageId && !p.storageId)).toBe(true);
    for (const sid of storageIds) expect(await t.run((ctx) => ctx.db.system.get(sid))).toBeNull();

    const r = await t.fetch(`/media/${mediaId}`, { headers: { Range: "bytes=1990-2010" } });
    expect(r.status).toBe(206);
    expect(r.headers.get("content-range")).toBe(`bytes 1990-1999/${total}`);
    expect(await body(r)).toEqual(bytes(1990, 2000));
    const r2 = await t.fetch(`/media/${mediaId}`, { headers: { Range: "bytes=2000-" } });
    expect(await body(r2)).toEqual(bytes(2000, 2500));
    expect((await t.run((ctx) => ctx.db.get(mediaId)))?.parts?.[2].tgFilePath).toBe("documents/file3");

    // deleting removes every part's message
    await t.run(async (ctx) => (await import("./media")).deleteMedia(ctx, [mediaId]));
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(vi.mocked(fetch).mock.calls.filter(([u]) => String(u).endsWith("/deleteMessage"))).toHaveLength(3);
  });

  it("single-part uploads still go out with one post and leave no storage copy", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "TEST_TOKEN";
    process.env.TELEGRAM_CHAT_ID = "-100123";
    const { t, as, storageIds } = await setup([PART], "image/png");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ok: true, result: { message_id: 7, document: { file_id: "f1", file_unique_id: "u1" } } })),
    );
    const { mediaId } = await as.mutation(api.media.confirmUpload, { storageId: storageIds[0], kind: "image" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const m = await t.run((ctx) => ctx.db.get(mediaId));
    expect(m).toMatchObject({ status: "ready", tgFileId: "f1", tgMessageId: 7 });
    expect(m?.storageId).toBeUndefined();
    expect(await t.run((ctx) => ctx.db.system.get(storageIds[0]))).toBeNull();
  });
});

describe("robustness", () => {
  it("retries a 429 after retry_after and a failing video surfaces as failed", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "TEST_TOKEN";
    process.env.TELEGRAM_CHAT_ID = "-100123";
    const { t, as, storageIds } = await setup([PART], "image/png");
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        ++n === 1
          ? Response.json({ ok: false, error_code: 429, description: "Too Many Requests: retry after 5", parameters: { retry_after: 5 } })
          : Response.json({ ok: true, result: { message_id: 9, document: { file_id: "f9", file_unique_id: "u9" } } }),
      ),
    );
    const { mediaId } = await as.mutation(api.media.confirmUpload, { storageId: storageIds[0], kind: "image" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(n).toBe(2);
    expect(await t.run((ctx) => ctx.db.get(mediaId))).toMatchObject({ status: "ready", tgFileId: "f9", attempts: 1 });

    // permanent error on a video: media + video row end up "failed" (shown in the dashboard)
    const v = await setup([PART], "video/mp4");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: false, error_code: 400, description: "Bad Request: wrong file" })));
    const { mediaId: vid } = await v.as.mutation(api.media.confirmUpload, { storageId: v.storageIds[0], kind: "video" });
    const { areaId, image } = await v.t.run(async (ctx) => ({
      areaId: await ctx.db.insert("areas", { division: "Dhaka", district: "Dhaka", upazila: "X", areaName: "X", slug: "x", geohash: "wh0rs", centerLat: 23.8, centerLng: 90.4, activeCount: 0 }),
      image: await ctx.db.insert("media", { ownerId: v.seller, kind: "image", status: "ready", attached: false, mimeType: "image/webp", size: 10, attempts: 0, createdAt: Date.now() }),
    }));
    const { id: listingId } = await v.as.mutation(api.listings.upsert, {
      data: {
        title: "Test plot for video failure",
        description: "",
        landType: "residential",
        sizeValue: 5,
        sizeUnit: "katha",
        price: 1_000_000,
        negotiable: false,
        areaId,
        nearbyFacilities: [],
        utilities: [],
        hasBoundaryWall: false,
        landStatus: "ready",
        documents: [],
        imageIds: [image],
      },
    });
    const videoId = await v.as.mutation(api.videos.registerUpload, { listingId, mediaId: vid });
    await v.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await v.t.run((ctx) => ctx.db.get(vid)))?.status).toBe("failed");
    expect(await v.t.run((ctx) => ctx.db.get(videoId))).toMatchObject({ status: "failed", errorMessage: "400: Bad Request: wrong file" });
  });

  it("deleteMessage retries on 429 and stops on 'not found'", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "TEST_TOKEN";
    process.env.TELEGRAM_CHAT_ID = "-100123";
    const { t } = await setup([]);
    const answers = [
      { ok: false, error_code: 429, description: "Too Many Requests", parameters: { retry_after: 2 } },
      { ok: false, error_code: 400, description: "Bad Request: message to delete not found" },
    ];
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(answers.shift())));
    await t.action(internal.telegram.deleteMessage, { messageId: 1 });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
  });

  it("sweeps unconfirmed storage files after a day but keeps referenced ones", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "TEST_TOKEN";
    process.env.TELEGRAM_CHAT_ID = "-100123";
    const { t, as, seller, storageIds } = await setup([PART, PART, 10, 20], "video/mp4");
    // parts 0+1 confirmed as a pending (unpushed) multi-part video; 2 is an orphan; 3 is a pending image
    await as.mutation(api.media.confirmParts, { storageIds: storageIds.slice(0, 2), size: 2 * PART, mimeType: "video/mp4", kind: "video" });
    await t.run((ctx) =>
      ctx.db.insert("media", { ownerId: seller, kind: "image", status: "ready", attached: true, storageId: storageIds[3], mimeType: "image/png", size: 20, attempts: 8, createdAt: Date.now() }),
    );
    vi.setSystemTime(Date.now() + 25 * 3600_000);
    const res = await t.mutation(internal.media.cleanupOrphanStorage, {});
    expect(res.deleted).toBe(1);
    expect(await t.run((ctx) => ctx.db.system.get(storageIds[2]))).toBeNull();
    for (const i of [0, 1, 3]) expect(await t.run((ctx) => ctx.db.system.get(storageIds[i]))).not.toBeNull();
  });

  it("videos cannot be smuggled into a listing's photos", async () => {
    const { t, as, seller, storageIds, total } = await setup();
    const { mediaId } = await as.mutation(api.media.confirmParts, { storageIds, size: total, mimeType: "video/mp4", kind: "video" });
    const { claimMedia } = await import("./media");
    await expect(t.run((ctx) => claimMedia(ctx, [mediaId], seller, new Set()))).rejects.toThrow();
  });
});
