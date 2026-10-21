# Architecture

```
 Browser (Next.js client)                     Vercel (Next.js server)              Convex Cloud
 ─────────────────────────                    ───────────────────────              ─────────────────────────────
 React pages + Convex hooks ── websocket ───────────────────────────────────────▶ queries / mutations (reactive)
 (live lists, video status)                                                         schema, indexes, search index
                                              SSR: preloadQuery / fetchQuery ─────▶ listings.getBySlug, search …
 <img src="/media/id"> ───────────────────▶   /media/[id] route (CDN cached) ─────▶ HTTP action GET /media/<id>
 <video src="…convex.site/media/id"> ─────────────────────────────────────────────▶   │  (Range passthrough)
                                                                                      ▼
 file upload ── signed URL ────────────────────────────────────────────────────▶ Convex storage (temporary)
                                                                                      │ action telegram.push
                                                                                      ▼
                                                                               Telegram Bot API ─▶ private channel
                                                                               (file_id stored in `media`)
 crons: expire listings · saved-search alerts · abandoned uploads · stuck videos
```

Secrets (`TELEGRAM_BOT_TOKEN`, `MEDIA_SIGNING_SECRET`, JWT keys, email/SMS keys) live only in Convex
environment variables.

## 1. Listing creation flow

1. Seller signs in (email/phone OTP or Google). A buyer switches to seller via `users.becomeSeller`.
2. Wizard (`/dashboard/listings/new`): **Basics → Location → Details → Documents → Photos → Videos → Review**.
   State is kept client-side; from the Location step onward each *Next* calls `listings.upsert`,
   which saves a **draft**.
3. `upsert` (role `seller`/`broker`/`admin`):
   validates input → converts size to `sizeSqft` → computes `pricePerSqft` → denormalizes area
   fields → computes `geohash` (precision 7) → builds `searchText` → generates a slug → **claims**
   every media id (must be uploaded by this user and unattached) → deletes media removed in an edit.
   Document `verified` flags can only be changed by admins.
4. `submitForReview` → `pending_review`.
5. Admin review (`/admin/review/<id>`) shows the checklist and signals: duplicate plot (same area +
   plot number + sector/block), price far below the area average (< 0.5×), new account (< 7 days), no
   documents, few photos, unverified seller. Admin **approves** (`active`, `publishedAt`,
   `expiresAt = +90 days`, optional verified badge) or **rejects** with a reason. The seller gets a
   notification.
6. `setListingStatus` (the only place that changes status) keeps `areas.activeCount` and
   `videos.listingActive` in sync.
7. Daily cron `listings.expireOld` moves listings past `expiresAt` to `expired`; sellers can renew.

## 2. Media upload & processing flow (Telegram)

```
browser                     Convex                                   Telegram
───────                     ──────                                   ────────
media.generateUploadUrl ──▶ signed upload URL
POST bytes ───────────────▶ _storage
media.confirmUpload ──────▶ check MIME + size from storage metadata
                            insert media{status: pending}
                            schedule telegram.push ───────────────▶ sendDocument / sendVideo (private channel)
                                                 ◀──────────────── message_id, file_id (+ video thumbnail)
                            media.markPushed: save file_id, delete the
                            storage copy; for videos -> videos.markReady
                            (thumbnail becomes its own media row)
```

* Images are downscaled in the browser (max 1920 px, WebP) before upload, which saves mobile data.
* Videos: the client reads the duration; the server enforces MIME, ≤ 20 MB, ≤ 5 minutes and ≤ 5 per
  listing. `videos.registerUpload` creates the row as `processing`. The UI is reactive, so it flips to
  *ready* automatically when `markReady` runs.
* Moderation hook: with `VIDEO_REQUIRE_MODERATION=true`, new videos are `moderation: pending` and are
  hidden until an admin approves them in `/admin/videos`.
* Failures: `429` from Telegram is retried after `retry_after`; 5xx is retried up to 8 times. Images
  stay usable from Convex storage, and videos are marked `failed` with the error logged together with
  the listing ID. The hourly cron fails videos stuck over 2 h. The token is scrubbed from every log
  and error.
* No channel configured (`TELEGRAM_CHAT_ID` unset): files stay in Convex storage (`markLocalReady`).
  `telegram:backfill` moves them later.

## 3. Video playback flow

1. Lists show only thumbnails (lazy-loaded through `/media/<thumbId>`). No player code or video bytes
   load until the viewer presses play (the player is a `dynamic()` import).
2. The gallery dialog (listing page, home strip, `/videos`) opens `VideoGalleryBody`: the main
   player, this listing's other videos and **related videos** (`videos.related`: same area + type →
   same type → same area → similar price band ±50–200%).
3. Source: Telegram videos play as progressive MP4/WebM from `https://<deployment>.convex.site/media/<id>`;
   the HTTP action proxies bytes and passes `Range` through, so seeking works. HLS sources (seed
   placeholders) use hls.js when MediaSource exists (quality menu), or native HLS on iOS.
4. Controls: speed, quality (HLS), picture-in-picture, fullscreen, keyboard (Space/K, ←/→ seek,
   ↑/↓ prev/next, F, M), mobile horizontal swipe for next/previous.
5. Every 10 s and on pause, `videos.recordProgress` updates `watchHistory` (signed-in users →
   *Continue watching* on the home page) and adds watch seconds to the seller's `dailyStats`.

## Search & browse

* Structured filters pick the most selective compound index (`by_status_area_type`,
  `by_status_area_published`, `by_price_area`, `by_status_price`, `by_status_size`, `by_status_views`,
  `by_status_district`, …) and apply the rest as `.filter()`. Array filters (utilities, facilities) are
  applied per page. Results stream through `.paginate()` with infinite scroll.
* Keyword search uses the `search_text` full-text index (title + area + sector + description) with
  status/type/area/district/division filter fields.
* Map view: `listings.inBounds` turns the viewport into ≤ 16 geohash prefixes (`by_geohash` range
  scans), then filters to the exact bounding box. Pins use ~550 m rounded coordinates.
* Filters live in the URL (`/browse?area=purbachal&landType=residential&minPrice=…`) so links are shareable.

## Privacy & security

* Public queries return masked phones (`+880171•••••78`), no exact address, no plot number and only
  rounded coordinates. `inquiries.revealContact` returns them only to a signed-in user who has sent an
  inquiry on that listing (or the owner/admin).
* Documents are never public: admins and owners get 10‑minute HMAC-signed links.
* Rate limits (fixed window in the `rateLimits` table): inquiries 10/hour per user and 3/day per
  listing; one counted view per viewer per listing per 6 h; reports 10/day.
* Every mutation checks role and ownership in `convex/helpers.ts`. Admin role is never self-assignable.
* `proxy.ts` only does optimistic redirects; authorization is enforced in Convex.
* Security headers are set in `next.config.ts`; `sign-in?next=` only accepts same-site paths.
