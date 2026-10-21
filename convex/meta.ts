import { query } from "./_generated/server";
import { CONFIG } from "../lib/constants";

/** Non-secret runtime config the UI needs (which sign-in options exist, upload limits). */
export const config = query({
  args: {},
  handler: async () => ({
    googleEnabled: !!process.env.AUTH_GOOGLE_ID,
    emailDelivery: !!process.env.AUTH_RESEND_KEY,
    smsDelivery: !!process.env.TWILIO_ACCOUNT_SID,
    mediaStore: process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID ? "telegram" : "convex",
    limits: {
      maxImages: CONFIG.maxImages,
      maxImageMB: CONFIG.maxImageBytes / 1024 / 1024,
      maxVideoMB: CONFIG.maxVideoBytes / 1024 / 1024,
      maxVideoDurationSec: CONFIG.maxVideoDurationSec,
      maxVideosPerListing: CONFIG.maxVideosPerListing,
    },
  }),
});
