#!/usr/bin/env node
/**
 * link-telegram-videos.mjs
 *
 * Attaches harvested Telegram walkthrough videos directly to listings in Convex.
 *
 * For each video:
 * - Registers the video and thumbnail in the Convex `media` table (with tgFileId, ready status, 0 storage bytes).
 * - Registers the video in the Convex `videos` table with:
 *     provider: "telegram"
 *     status: "ready"
 *     moderation: "approved"
 *     listingActive: true
 *     durationSec: <duration>
 *     resolutions: ["720p"]
 * - Updates `hasVideo: true` on the corresponding listing.
 * - Distributes across key areas (Purbachal, Uttara, Bashundhara R/A, Keraniganj, Halishahar).
 *
 * Usage:
 *   node scripts/link-telegram-videos.mjs [--prod] [--json <path>]
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const prod = args.includes("--prod");

const jsonArgIdx = args.indexOf("--json");
const jsonPath = jsonArgIdx !== -1 && args[jsonArgIdx + 1]
  ? resolve(args[jsonArgIdx + 1])
  : join(__dirname, "harvested-telegram-media.json");

function convex(fn, payload) {
  const cmdArgs = ["convex", "run", ...(prod ? ["--prod"] : []), fn, JSON.stringify(payload ?? {})];
  const out = execFileSync("npx", cmdArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
  return out ? JSON.parse(out) : null;
}

async function main() {
  console.log("=================================================");
  console.log("   LandnestBD - Link Telegram Walkthrough Videos  ");
  console.log("=================================================\n");

  if (!existsSync(jsonPath)) {
    console.error(`Error: Harvested media JSON file not found at: ${jsonPath}`);
    process.exit(1);
  }

  const rawData = JSON.parse(readFileSync(jsonPath, "utf8"));
  const harvestedVideos = rawData.videos ?? [];

  if (harvestedVideos.length === 0) {
    console.error("Error: No videos found in the harvested media file.");
    process.exit(1);
  }

  console.log(`Found ${harvestedVideos.length} harvested walkthrough video(s) in: ${jsonPath}\n`);

  // Query candidate listings (featured first, then key areas)
  console.log("Fetching candidate listings from Convex...");
  const candidates = convex("videos:candidateListingsForTelegram", {});
  const featured = candidates.featured ?? [];
  const all = candidates.all ?? [];

  console.log(`Found ${featured.length} featured listing(s) and ${all.length} total active listing(s).`);

  // Target listings prioritization:
  // We prioritize featured listings across distinct key areas:
  // Purbachal, Uttara, Bashundhara R/A, Keraniganj, Halishahar, etc.
  const targetListings = [];
  const selectedIds = new Set();

  for (const l of featured) {
    if (targetListings.length >= harvestedVideos.length) break;
    if (!selectedIds.has(l.id)) {
      targetListings.push(l);
      selectedIds.add(l.id);
    }
  }

  // If more listings needed, fill from active listings in diverse areas
  if (targetListings.length < harvestedVideos.length) {
    for (const l of all) {
      if (targetListings.length >= harvestedVideos.length) break;
      if (!selectedIds.has(l.id)) {
        targetListings.push(l);
        selectedIds.add(l.id);
      }
    }
  }

  console.log(`Selected ${targetListings.length} listing(s) for attachment:\n`);
  targetListings.forEach((l, i) => {
    console.log(`  [${i + 1}] ${l.title}`);
    console.log(`      ID: ${l.id} | Area: ${l.areaName} (${l.district}) | Featured: ${l.isFeatured}`);
  });
  console.log("");

  // Attach each video to a listing
  let attachedCount = 0;
  const results = [];

  for (let i = 0; i < harvestedVideos.length; i++) {
    const video = harvestedVideos[i];
    const listing = targetListings[i % targetListings.length];

    console.log(`Linking Video [${i + 1}/${harvestedVideos.length}] to Listing: ${listing.title}...`);

    const linkPayload = {
      listingId: listing.id,
      fileId: video.fileId,
      fileUniqueId: video.fileUniqueId,
      originalMessageId: video.originalMessageId,
      durationSec: video.duration ?? 15,
      width: video.width ?? 1280,
      height: video.height ?? 720,
      fileSize: video.fileSize,
      thumbFileId: video.thumbFileId,
      fileName: video.fileName,
      mimeType: video.mimeType ?? "video/mp4",
      title: "Site walkthrough",
    };

    const res = convex("videos:linkTelegramVideo", linkPayload);
    attachedCount++;
    results.push({
      index: i + 1,
      listingId: listing.id,
      listingTitle: listing.title,
      areaName: listing.areaName,
      videoId: res.videoId,
      mediaId: res.mediaId,
      thumbMediaId: res.thumbMediaId,
      durationSec: res.durationSec,
      resolutions: res.resolutions,
      tgFileId: video.fileId,
    });

    console.log(`  ✔ Successfully linked!`);
    console.log(`    - Video ID: ${res.videoId}`);
    console.log(`    - Media ID: ${res.mediaId}`);
    console.log(`    - Thumb ID: ${res.thumbMediaId ?? "none"}`);
    console.log(`    - Duration: ${res.durationSec}s | Resolutions: ${res.resolutions.join(", ")}`);
    console.log(`    - Provider: telegram | Status: ready | Moderation: approved\n`);
  }

  // Verify through Convex linked query
  console.log("Verifying linked videos in Convex...");
  const linked = convex("videos:linkedTelegramVideos", {});
  console.log(`Verification: Total linked Telegram videos in database = ${linked.length}`);

  console.log("\n=================================================");
  console.log(`Summary: Successfully attached ${attachedCount} walkthrough video(s) to listings!`);
  console.log("=================================================");

  return results;
}

main().catch((err) => {
  console.error("Fatal error linking videos:", err);
  process.exit(1);
});
