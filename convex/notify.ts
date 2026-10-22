import { v } from "convex/values";
import { internalAction } from "./_generated/server";

/** Email via Resend. Without AUTH_RESEND_KEY it only logs (dev). */
export const sendEmail = internalAction({
  args: { to: v.string(), subject: v.string(), text: v.string() },
  handler: async (_ctx, { to, subject, text }) => {
    const key = process.env.AUTH_RESEND_KEY;
    if (!key) {
      console.log(`[notify] DEV email to ${to}: ${subject}`);
      return;
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.AUTH_EMAIL_FROM ?? "LandnestBD <onboarding@resend.dev>",
        to: [to],
        subject,
        text,
      }),
    });
    if (!res.ok) console.error(`[notify] email to ${to} failed: ${res.status} ${await res.text()}`);
  },
});

/** SMS via Twilio. Without credentials it only logs (dev). */
export const sendSms = internalAction({
  args: { to: v.string(), body: v.string() },
  handler: async (_ctx, { to, body }) => {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const auth = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM;
    if (!sid || !auth || !from) {
      console.log(`[notify] DEV sms to ${to}: ${body}`);
      return;
    }
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: "Basic " + btoa(`${sid}:${auth}`), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    });
    if (!res.ok) console.error(`[notify] sms to ${to} failed: ${res.status}`);
  },
});
