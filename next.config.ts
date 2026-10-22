import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// Static CSP (no nonces, so pages can stay statically rendered): Next's inline
// bootstrap/theme scripts need 'unsafe-inline', but scripts can only come from
// our origin, and network access is limited to Convex (queries over wss,
// uploads, /media video streams). Photos may come from any https host
// (OSM tiles, Google avatars). React needs eval only in development.
const isDev = process.env.NODE_ENV !== "production";
const CONVEX = "https://*.convex.cloud wss://*.convex.cloud https://*.convex.site";
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `media-src 'self' blob: ${CONVEX}`,
  `connect-src 'self' ${CONVEX}${isDev ? " ws: http://127.0.0.1:*" : ""}`,
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const nextConfig: NextConfig = {
  // Let the dev server be opened as 127.0.0.1 as well as localhost.
  allowedDevOrigins: ["127.0.0.1"],
  images: {
    formats: ["image/avif", "image/webp"],
    // Listing photos are served from our own /media/<id> route (Telegram proxy).
    localPatterns: [{ pathname: "/media/**", search: "" }, { pathname: "/brand/**" }],
    minimumCacheTTL: 31536000,
  },
  turbopack: {
    rules: {
      // Only our stylesheet: next/font generates CSS too, and Tailwind must not touch it.
      "globals.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
          { key: "Content-Security-Policy", value: CSP },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
