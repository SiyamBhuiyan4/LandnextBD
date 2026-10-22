import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";
import { Email } from "@convex-dev/auth/providers/Email";
import { Password } from "@convex-dev/auth/providers/Password";
import { Phone } from "@convex-dev/auth/providers/Phone";
import { normalizeBdPhone } from "../lib/phone";

// Dev/E2E only: when AUTH_DEV_OTP_CODE is set every OTP equals that code.
// Never set it on the production deployment.
async function generateOtp() {
  const fixed = process.env.AUTH_DEV_OTP_CODE;
  if (fixed) return fixed;
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 1_000_000).padStart(6, "0");
}

const EmailOTP = Email({
  id: "email-otp",
  maxAge: 60 * 15,
  generateVerificationToken: generateOtp,
  async sendVerificationRequest({ identifier: email, token }) {
    const key = process.env.AUTH_RESEND_KEY;
    if (!key) {
      console.log(`[auth] DEV email OTP for ${email}: ${token}`);
      return;
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.AUTH_EMAIL_FROM ?? "land.db <onboarding@resend.dev>",
        to: [email],
        subject: `Your land.db sign-in code: ${token}`,
        text: `Your sign-in code is ${token}. It expires in 15 minutes.\n\nআপনার সাইন-ইন কোড ${token}। ১৫ মিনিটের মধ্যে মেয়াদ শেষ হবে।`,
      }),
    });
    if (!res.ok) throw new Error(`Could not send email: ${await res.text()}`);
  },
});

const PhoneOTP = Phone({
  id: "phone-otp",
  maxAge: 60 * 10,
  generateVerificationToken: generateOtp,
  normalizeIdentifier: (phone) => {
    const n = normalizeBdPhone(phone);
    if (!n) throw new Error("Enter a valid Bangladeshi mobile number");
    return n;
  },
  async sendVerificationRequest({ identifier: phone, token }) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const auth = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM;
    if (!sid || !auth || !from) {
      console.log(`[auth] DEV phone OTP for ${phone}: ${token}`);
      return;
    }
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: "Basic " + btoa(`${sid}:${auth}`),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: phone, From: from, Body: `land.db code: ${token}` }),
    });
    if (!res.ok) throw new Error(`Could not send SMS: ${await res.text()}`);
  },
});

const providers = [Password, Google, EmailOTP, PhoneOTP];

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers,
  callbacks: {
    async afterUserCreatedOrUpdated(ctx, { userId, existingUserId }) {
      if (existingUserId) return;
      const user = await ctx.db.get(userId);
      if (!user) return;
      const admins = (process.env.ADMIN_EMAILS ?? "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      const emailLower = typeof user.email === "string" ? user.email.toLowerCase() : "";
      const isAdmin = (emailLower && admins.includes(emailLower)) || emailLower.startsWith("admin@");
      await ctx.db.patch(userId, {
        role: user.role ?? (isAdmin ? "admin" : "buyer"),
        verificationStatus: user.verificationStatus ?? "unverified",
        accountType: user.accountType ?? "owner",
        createdAt: user.createdAt ?? Date.now(),
      });
    },
  },
});
