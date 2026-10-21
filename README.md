# land.db — land & plot marketplace for Bangladesh

(Project codename **LandnestBD**.) Sellers and brokers post land listings; buyers browse by
location, filter, watch walkthrough videos and contact sellers. Bilingual (English / বাংলা).

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind v4 · shadcn/ui (Base UI) · Framer Motion ·
Convex (database, functions, auth, crons, HTTP actions) · Convex Auth (email/phone OTP + Google) ·
Telegram Bot API as the media store · hls.js · Leaflet/OpenStreetMap · next-intl.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the diagrams and flows.

---

## Quick start (local)

```bash
npm install
npx convex dev            # first run: log in, pick/create the project; writes .env.local
node scripts/setup-auth-keys.mjs          # sets JWT_PRIVATE_KEY + JWKS on the dev deployment
npx convex env set SITE_URL http://localhost:3000
npx convex env set MEDIA_SIGNING_SECRET "$(openssl rand -hex 32)"
npx convex run seed:run                   # 8 areas, 6 sellers, 40 listings, 21 placeholder videos
node scripts/seed-images.mjs              # generates original illustrated photos and attaches them
npm run dev                               # http://localhost:3000
```

Keep `npx convex dev` running in a second terminal while developing (it pushes function changes).

Without email/SMS keys, sign-in codes are printed in the Convex logs (`npx convex logs`).

### Make yourself admin
```bash
npx convex env set ADMIN_EMAILS you@example.com     # auto-admin on first sign-in, or:
npx convex run users:setRole '{"email":"you@example.com","role":"admin"}'
```

---

## Telegram media store

Photos, videos and documents are stored in a **private Telegram channel**. The browser uploads to
Convex storage (signed URL), a Convex action posts the file to the channel and stores Telegram's
`file_id`, then deletes the temporary copy. The site serves bytes through `/media/<id>`, a proxy,
because Telegram download links contain the bot token. **The token never reaches the browser,
the repo or logs.**

1. Create a bot with **@BotFather** (or use the existing **@LandnestBD_bot**).
2. Create a **private channel** (e.g. "land.db media"). Add the bot as **admin** with **Post messages** permission.
3. Post any message in the channel.
4. Find the chat ID: open `https://api.telegram.org/bot<TOKEN>/getUpdates` in your browser
   (or run `npm run telegram:chat-id`). The channel's `chat.id` starts with **`-100`**.
5. Set both as **Convex env vars** (server only — never in `.env.local` for the frontend):
   ```bash
   npx convex env set TELEGRAM_BOT_TOKEN <token>
   npx convex env set TELEGRAM_CHAT_ID -100xxxxxxxxxx
   ```
6. Move files that were uploaded before the channel existed:
   ```bash
   npx convex run telegram:backfill      # paced at ~20 posts/min (Bot API limit)
   ```

Until `TELEGRAM_CHAT_ID` is set, uploads stay in Convex storage and are served from there.

**Limits:** bots can download files up to **20 MB**, so videos are capped at 20 MB / 5 minutes and play
as progressive MP4/WebM (no adaptive bitrate). If the token was ever pasted somewhere public, rotate
it with `/revoke` in @BotFather and set the new value.

---

## Environment variables

| Where | Name | Purpose |
|---|---|---|
| `.env.local` | `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL` | Written by `npx convex dev` |
| `.env.local` / Vercel | `NEXT_PUBLIC_SITE_URL` | Canonical URLs, OG images, sitemap |
| Convex | `SITE_URL` | Auth redirect target |
| Convex | `JWT_PRIVATE_KEY`, `JWKS` | Convex Auth signing keys (`scripts/setup-auth-keys.mjs`) |
| Convex | `MEDIA_SIGNING_SECRET` | Signs 10‑minute links to private documents |
| Convex | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Media store |
| Convex | `AUTH_RESEND_KEY`, `AUTH_EMAIL_FROM` | Email OTP + notifications (optional) |
| Convex | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | Phone OTP (optional) |
| Convex | `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Google sign-in (optional) |
| Convex | `ADMIN_EMAILS` | Comma-separated emails that become admin on first sign-in |
| Convex | `VIDEO_REQUIRE_MODERATION` | `true` = new videos wait for admin approval |
| Convex (dev only) | `AUTH_DEV_OTP_CODE` | Fixed OTP for E2E tests. **Never set on prod.** |

Template: [`.env.example`](.env.example).

---

## Deployment (Vercel + Convex Cloud)

Dev and prod are separate Convex deployments with their own env vars.

```bash
# 1. Production backend
npx convex deploy                                  # pushes functions/schema to prod
node scripts/setup-auth-keys.mjs --prod
npx convex env set --prod SITE_URL https://your-domain.com
npx convex env set --prod MEDIA_SIGNING_SECRET "$(openssl rand -hex 32)"
npx convex env set --prod TELEGRAM_BOT_TOKEN <token>
npx convex env set --prod TELEGRAM_CHAT_ID -100xxxxxxxxxx
# optional: AUTH_RESEND_KEY, TWILIO_*, AUTH_GOOGLE_*, ADMIN_EMAILS

# 2. Frontend on Vercel
#    Build command:  npx convex deploy --cmd 'npm run build'
#    Env vars:       CONVEX_DEPLOY_KEY (prod deploy key from the Convex dashboard),
#                    NEXT_PUBLIC_SITE_URL=https://your-domain.com
```

Google OAuth redirect URI: `https://<prod-deployment>.convex.site/api/auth/callback/google`.

---

## Scripts & tests

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server |
| `npx convex dev` | Push Convex functions on change |
| `npx vitest run` | Unit tests (units, BDT format, URL filters, signatures) + Convex function tests (`convex-test`) |
| `npx playwright test` | E2E: search, listing detail, video playback, Bangla toggle, seller wizard → admin approval |
| `npx convex run seed:purgeTestUsers` | Delete QA/E2E accounts (`@landnestbd.test`) and everything they created |
| `npx convex run seed:reset` | Wipe all marketplace data (dev only) |

The seller/admin E2E spec needs a fixed dev OTP:
`npx convex env set AUTH_DEV_OTP_CODE 246810` and `E2E_OTP_CODE=246810 npx playwright test`; remove it afterwards
with `npx convex env remove AUTH_DEV_OTP_CODE`.

---

## Convex function reference

| Module | Public functions | Internal / scheduled |
|---|---|---|
| `listings` | `search` (paginated, filters), `featured`, `newest`, `stats`, `getBySlug`, `related`, `getMany`, `inBounds` (map), `sitemapEntries`, `upsert`, `submitForReview`, `markSold`, `renew`, `requestPromotion`, `removeDraft`, `mine`, `getForEdit`, `recordView` | `expireOld` (cron) |
| `areas` | `autocomplete`, `hierarchy`, `bySlug`, `all` | |
| `media` | `generateUploadUrl`, `confirmUpload` | `lookup`, `markPushed`, `markLocalReady`, `markPushFailed`, `notOnTelegram`, `cleanupAbandoned` (cron) |
| `telegram` | | `push`, `backfill`, `deleteMessage` |
| `videos` | `registerUpload`, `remove`, `byListing`, `get`, `related`, `feed`, `latest`, `recordProgress`, `continueWatching`, `myProgress` | `markReady`, `markFailed`, `failStuck` (cron) |
| `inquiries` | `create` (rate-limited), `revealContact`, `mine`, `inbox`, `setStatus` | |
| `saves` | `toggle`, `mine`, `mySavedIds` | |
| `savedSearches` | `create`, `mine`, `remove` | `runAlerts` (daily cron) |
| `reports` | `create` | |
| `users` | `viewer`, `updateProfile`, `becomeSeller`, `requestVerification`, `publicProfile`, `verifiedSellers`, `notifications`, `markNotificationsRead` | `setRole` |
| `dashboard` | `analytics` | |
| `admin` | `queue`, `reviewDetail`, `approve`, `reject`, `unpublish`, `setListingFlags`, `setDocumentVerified`, `promotionRequests`, `allListings`, `users`, `updateUser`, `reports`, `resolveReport`, `videoQueue`, `moderateVideo`, `overview` | |
| `notify` | | `sendEmail`, `sendSms` |
| `seed` | | `run`, `reset`, `purgeTestUsers`, image helpers |
| `http` | `GET /media/<id>` (proxy, Range support, signed docs), Convex Auth routes | |

Every public function checks the caller's role/ownership itself (`convex/helpers.ts`); the UI checks are only for UX.
