/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// Scheduled jobs (emails, Telegram pushes) stay queued instead of running.
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const areaId = await ctx.db.insert("areas", {
      division: "Dhaka",
      district: "Narayanganj",
      upazila: "Rupganj",
      areaName: "Purbachal",
      slug: "purbachal",
      geohash: "wh0rs",
      centerLat: 23.835,
      centerLng: 90.53,
      activeCount: 0,
    });
    const mk = (email: string, role: "buyer" | "seller" | "admin", phone?: string, verificationStatus: "unverified" | "verified" = "verified") =>
      ctx.db.insert("users", { email, role, phone, verificationStatus, accountType: "owner", createdAt: Date.now() - 30 * 86400_000 });
    const seller = await mk("seller@test.test", "seller", "+8801700000001");
    const buyer = await mk("buyer@test.test", "buyer");
    const admin = await mk("admin@test.test", "admin");
    const image = await ctx.db.insert("media", { ownerId: seller, kind: "image", status: "ready", attached: false, mimeType: "image/webp", size: 10, attempts: 0, createdAt: Date.now() });
    return { areaId, seller, buyer, admin, image };
  });
  const as = (id: Id<"users">) => t.withIdentity({ subject: `${id}|session` });
  return { t, ...ids, as };
}

const listingData = (areaId: Id<"areas">, image: Id<"media">) => ({
  title: "5 Katha south-facing plot in Purbachal",
  description: "A test listing with enough description text to pass the minimum length check.",
  landType: "residential" as const,
  sizeValue: 5,
  sizeUnit: "katha" as const,
  price: 6_500_000,
  negotiable: true,
  areaId,
  exactAddress: "Plot 9, Sector 5, Purbachal",
  lat: 23.8391,
  lng: 90.5298,
  plotNumber: "9",
  sectorBlock: "Sector 5",
  nearbyFacilities: [],
  utilities: ["gas" as const],
  hasBoundaryWall: false,
  landStatus: "ready" as const,
  documents: [],
  imageIds: [image],
});

describe("listing lifecycle", () => {
  it("creates, reviews and publishes a listing with correct derived fields", async () => {
    const { t, as, seller, admin, areaId, image } = await setup();
    const { id } = await as(seller).mutation(api.listings.upsert, { data: listingData(areaId, image) });
    const draft = await t.run((ctx) => ctx.db.get(id));
    expect(draft).toMatchObject({ status: "draft", sizeSqft: 3600, pricePerSqft: 1805.56, areaName: "Purbachal", coverImageId: image });

    await as(seller).mutation(api.listings.submitForReview, { id });
    await as(admin).mutation(api.admin.approve, { id });
    const live = await t.run((ctx) => ctx.db.get(id));
    expect(live?.status).toBe("active");
    expect((live?.expiresAt ?? 0) - (live?.publishedAt ?? 0)).toBe(90 * 86400_000);
    const area = await t.run((ctx) => ctx.db.get(areaId));
    expect(area?.activeCount).toBe(1);

    const page = await t.query(api.listings.search, { filters: { areaId }, paginationOpts: { numItems: 10, cursor: null } });
    expect(page.page.map((l) => l._id)).toEqual([id]);
  });

  it("enforces roles inside functions", async () => {
    const { t, as, buyer, seller, areaId, image } = await setup();
    await expect(as(buyer).mutation(api.listings.upsert, { data: listingData(areaId, image) })).rejects.toThrow(/permission/i);
    await expect(t.mutation(api.listings.upsert, { data: listingData(areaId, image) })).rejects.toThrow(/sign in/i);
    const { id } = await as(seller).mutation(api.listings.upsert, { data: listingData(areaId, image) });
    await expect(as(seller).mutation(api.admin.approve, { id })).rejects.toThrow(/permission/i);
    await expect(as(buyer).mutation(api.listings.markSold, { id })).rejects.toThrow(/not your listing/i);
  });

  it("refuses files uploaded by someone else", async () => {
    const { t, as, admin, areaId } = await setup();
    const sellerTwo = await t.run((ctx) => ctx.db.insert("users", { email: "s2@test.test", role: "seller", createdAt: Date.now() }));
    const othersImage = await t.run((ctx) => ctx.db.insert("media", { ownerId: admin, kind: "image", status: "ready", attached: false, mimeType: "image/webp", size: 1, attempts: 0, createdAt: Date.now() }));
    await expect(as(sellerTwo).mutation(api.listings.upsert, { data: listingData(areaId, othersImage) })).rejects.toThrow(/not uploaded by you/i);
  });
});

describe("privacy", () => {
  it("never exposes exact address or full phone publicly; reveals after inquiry", async () => {
    const { t, as, seller, buyer, admin, areaId, image } = await setup();
    const { id, slug } = await as(seller).mutation(api.listings.upsert, { data: listingData(areaId, image) });
    await as(seller).mutation(api.listings.submitForReview, { id });
    await as(admin).mutation(api.admin.approve, { id });

    const pub = await t.query(api.listings.getBySlug, { slug });
    const json = JSON.stringify(pub);
    expect(json).not.toContain("Plot 9, Sector 5");
    expect(json).not.toContain("+8801700000001");
    expect(json).not.toContain("23.8391");
    expect(pub?.seller?.maskedPhone).toBe("+880170•••••01");

    expect(await as(buyer).query(api.inquiries.revealContact, { listingId: id })).toBeNull();
    await as(buyer).mutation(api.inquiries.create, { listingId: id, message: "Is it available?", contactPhone: "01711111111" });
    const revealed = await as(buyer).query(api.inquiries.revealContact, { listingId: id });
    // The plot details open up, but calls go through the company line: a buyer
    // must never be handed the seller's personal number.
    expect(revealed).toMatchObject({ exactAddress: "Plot 9, Sector 5, Purbachal", lat: 23.8391 });
    expect(revealed?.phone).not.toBe("+8801700000001");
    expect(revealed?.email).not.toBe("seller@test.test");

    // Nor through the buyer's own inquiry list.
    const mine = await as(buyer).query(api.inquiries.mine, {});
    expect(JSON.stringify(mine)).not.toContain("+8801700000001");

    // The seller still sees their own number on their own listing.
    const ownerView = await as(seller).query(api.inquiries.revealContact, { listingId: id });
    expect(ownerView?.phone).toBe("+8801700000001");
  });
});

describe("rate limits", () => {
  it("limits inquiries per listing and de-duplicates views", async () => {
    const { t, as, seller, buyer, admin, areaId, image } = await setup();
    const { id } = await as(seller).mutation(api.listings.upsert, { data: listingData(areaId, image) });
    await as(seller).mutation(api.listings.submitForReview, { id });
    await as(admin).mutation(api.admin.approve, { id });
    for (let i = 0; i < 3; i++) await as(buyer).mutation(api.inquiries.create, { listingId: id, message: `Message ${i} here`, contactPhone: "01711111111" });
    await expect(as(buyer).mutation(api.inquiries.create, { listingId: id, message: "One more time", contactPhone: "01711111111" })).rejects.toThrow(/too many/i);

    await t.mutation(api.listings.recordView, { listingId: id, sessionId: "session-aaaa-1" });
    await t.mutation(api.listings.recordView, { listingId: id, sessionId: "session-aaaa-1" });
    await t.mutation(api.listings.recordView, { listingId: id, sessionId: "session-bbbb-2" });
    expect((await t.run((ctx) => ctx.db.get(id)))?.viewCount).toBe(2);
  });
});

describe("trust & safety", () => {
  it("flags duplicates by plot + sector and low prices", async () => {
    const { t, as, seller, admin, areaId, image } = await setup();
    const a = await as(seller).mutation(api.listings.upsert, { data: listingData(areaId, image) });
    await as(seller).mutation(api.listings.submitForReview, { id: a.id });
    await as(admin).mutation(api.admin.approve, { id: a.id });
    const img2 = await t.run((ctx) => ctx.db.insert("media", { ownerId: seller, kind: "image", status: "ready", attached: false, mimeType: "image/webp", size: 1, attempts: 0, createdAt: Date.now() }));
    const b = await as(seller).mutation(api.listings.upsert, { data: { ...listingData(areaId, img2), price: 1_000_000 } });
    const detail = await as(admin).query(api.admin.reviewDetail, { id: b.id });
    expect(detail?.signals.flags).toEqual(expect.arrayContaining(["possible_duplicate", "price_far_below_average", "no_documents", "few_photos"]));
  });
});

describe("videos", () => {
  it("marks the listing as having video only when a video is ready and approved", async () => {
    const { t, as, seller, areaId, image } = await setup();
    const { id } = await as(seller).mutation(api.listings.upsert, { data: listingData(areaId, image) });
    const media = await t.run((ctx) => ctx.db.insert("media", { ownerId: seller, kind: "video", status: "pending", attached: false, mimeType: "video/mp4", size: 1000, attempts: 0, createdAt: Date.now() }));
    const videoId = await as(seller).mutation(api.videos.registerUpload, { listingId: id, mediaId: media });
    expect((await t.run((ctx) => ctx.db.get(id)))?.hasVideo).toBe(false);
    await t.mutation(internal.videos.markReady, { id: videoId, durationSec: 30 });
    expect((await t.run((ctx) => ctx.db.get(id)))?.hasVideo).toBe(true);
    const own = await as(seller).query(api.videos.byListing, { listingId: id });
    expect(own[0]).toMatchObject({ status: "ready", durationSec: 30 });
  });
});
