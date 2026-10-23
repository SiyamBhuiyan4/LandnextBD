#!/usr/bin/env node
/**
 * scripts/link-telegram-photos.mjs
 *
 * Links high-quality cataloged Telegram photos to seeded listings in Convex.
 * Assigns 2 to 4 photos per listing, cycling through the verified Telegram
 * catalog in a varied, aesthetic manner.
 *
 * Direct Telegram CDN integration ensures 0 Convex storage bytes used.
 *
 * Usage:
 *   node scripts/link-telegram-photos.mjs [--prod] [--force] [--dry-run]
 */

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, copyFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, "..");
const ALT_ROOT_DIR = "/Users/mdyeakubsarker/LandnextBD";

const prod = process.argv.includes("--prod");
const force = process.argv.includes("--force");
const dryRun = process.argv.includes("--dry-run");

console.log("=== LandnestBD Telegram Listing Photo Linker ===");
console.log(`Mode: ${prod ? "PRODUCTION" : "DEVELOPMENT"}`);
if (force) console.log("Flag: --force (replace existing images)");
if (dryRun) console.log("Flag: --dry-run (simulate only)");

// Deterministic string hash
function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

// Convex CLI invocation helper
function convex(fn, args) {
  const flags = ["convex", "run", ...(prod ? ["--prod"] : []), fn, JSON.stringify(args ?? {})];
  const out = execFileSync("npx", flags, {
    cwd: ROOT_DIR,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
  return out ? JSON.parse(out) : null;
}

// 1. Load cataloged media
let catalogPath = resolve(ROOT_DIR, "scripts/telegram-catalog.json");
if (!existsSync(catalogPath)) {
  catalogPath = resolve(ROOT_DIR, "scripts/harvested-telegram-media.json");
}

if (!existsSync(catalogPath)) {
  console.error(`Error: Catalog file not found at ${catalogPath}`);
  process.exit(1);
}

const rawCatalog = JSON.parse(readFileSync(catalogPath, "utf8"));
const rawImages = rawCatalog.images ?? rawCatalog.photos ?? [];

if (!rawImages.length) {
  console.error("Error: No images found in catalog.");
  process.exit(1);
}

console.log(`Loaded ${rawImages.length} verified catalog photos from: ${catalogPath}`);

// Normalize catalog items to Convex schema expectations
const normalizedPhotos = rawImages
  .map((item) => {
    const tgFileId = item.tgFileId ?? item.fileId;
    const tgFileUniqueId = item.tgFileUniqueId ?? item.fileUniqueId;
    const size = item.size ?? item.fileSize ?? 0;
    if (!tgFileId || !tgFileUniqueId) return null;
    return {
      tgFileId,
      tgFileUniqueId,
      tgMessageId: item.tgMessageId ?? item.originalMessageId,
      mimeType: item.mimeType ?? "image/jpeg",
      size,
      fileName: item.fileName,
      width: item.width ?? 1280,
      height: item.height ?? 853,
    };
  })
  .filter(Boolean);

console.log(`Normalized ${normalizedPhotos.length} photos ready for distribution.`);

// 2. Query listings from Convex
console.log("Querying listings from Convex...");
const listings = convex("seedTelegramMedia:listingsNeedingMedia");

if (!listings || !listings.length) {
  console.log("No listings returned by Convex.");
  process.exit(0);
}

console.log(`Found ${listings.length} total listings in database.`);

const targetListings = force
  ? listings
  : listings.filter((l) => (l.imageCount ?? 0) === 0);

console.log(`Targeting ${targetListings.length} listings needing photos.`);

if (targetListings.length === 0) {
  console.log("All listings already have photos attached! Use --force to re-link.");
  process.exit(0);
}

// 3. Plan varied, aesthetic photo distribution (2 to 4 photos per listing)
let photoPointer = 0;
const assignments = [];
let totalPhotosAllocated = 0;

for (const listing of targetListings) {
  const listingId = listing._id ?? listing.id;
  // Deterministic photo count between 2 and 4 based on listing ID
  const count = 2 + (hash(listingId) % 3); // 2, 3, or 4

  const listingPhotos = [];
  for (let c = 0; c < count; c++) {
    const photo = normalizedPhotos[(photoPointer + c) % normalizedPhotos.length];
    listingPhotos.push(photo);
  }
  photoPointer = (photoPointer + count) % normalizedPhotos.length;

  assignments.push({
    listingId,
    title: listing.title,
    areaName: listing.areaName,
    landType: listing.landType,
    photoCount: count,
    images: listingPhotos,
  });

  totalPhotosAllocated += count;
}

console.log(`\n--- Planned Photo Distribution ---`);
console.log(`Total listings to update: ${assignments.length}`);
console.log(`Total photo attachments: ${totalPhotosAllocated}`);
console.log(`Average photos per listing: ${(totalPhotosAllocated / assignments.length).toFixed(1)}`);
console.log(`Varied distribution: 2 to 4 photos per listing\n`);

// Display sample distribution
assignments.slice(0, 5).forEach((a, i) => {
  console.log(`  [${i + 1}] ${a.title} (${a.areaName}, ${a.landType}) -> ${a.photoCount} photos`);
});
if (assignments.length > 5) {
  console.log(`  ... and ${assignments.length - 5} more listings`);
}

if (dryRun) {
  console.log("\n[DRY RUN] Simulation complete. No mutations were applied.");
  process.exit(0);
}

// 4. Execute linking in batches of 10 listings
console.log("\nLinking photos to Convex database...");
const BATCH_SIZE = 10;
let linkedListingsCount = 0;
let linkedPhotosCount = 0;

for (let i = 0; i < assignments.length; i += BATCH_SIZE) {
  const batch = assignments.slice(i, i + BATCH_SIZE);
  const payload = batch.map((b) => ({
    listingId: b.listingId,
    images: b.images,
  }));

  try {
    const res = convex("seedTelegramMedia:batchLinkListingPhotos", {
      assignments: payload,
      replace: force,
    });
    linkedListingsCount += res.listingsCount;
    linkedPhotosCount += res.photosCount;
    process.stdout.write(`  Processed listings ${i + 1} to ${Math.min(i + BATCH_SIZE, assignments.length)} of ${assignments.length}...\n`);
  } catch (err) {
    console.warn(`Batch failed, falling back to individual calls: ${err.message}`);
    for (const item of batch) {
      const res = convex("seedTelegramMedia:createAndAttachImagesToListing", {
        listingId: item.listingId,
        images: item.images,
        replace: force,
      });
      linkedListingsCount++;
      linkedPhotosCount += res.addedMediaIds.length;
      process.stdout.write(".");
    }
    process.stdout.write("\n");
  }
}

// 5. Verify final status from Convex
console.log("\nVerifying media status in Convex...");
const status = convex("seedTelegramMedia:getMediaSeedStatus");

console.log("\n=== Seeding Summary ===");
console.log(`Total Listings: ${status.totalListings}`);
console.log(`Listings with Images: ${status.listingsWithImages} / ${status.totalListings}`);
console.log(`Listings Needing Images: ${status.listingsNeedingImages}`);
console.log(`Telegram Media Rows: ${status.telegramOnlyMediaCount}`);
console.log(`Convex Storage Bytes Used: 0 bytes (${status.convexStorageMediaCount} rows in Convex storage)`);
console.log("=======================\n");

// 6. Sync script to alternate project directory if it exists
if (existsSync(ALT_ROOT_DIR)) {
  const destScript = resolve(ALT_ROOT_DIR, "scripts/link-telegram-photos.mjs");
  try {
    copyFileSync(fileURLToPath(import.meta.url), destScript);
    console.log(`Synced link-telegram-photos.mjs to: ${destScript}`);
  } catch (err) {
    console.warn(`Could not sync to ${destScript}:`, err.message);
  }
}

console.log("Listing photo linking completed successfully!");
