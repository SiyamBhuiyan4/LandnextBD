import { ImageResponse } from "next/og";

// Site-wide share image (pages with their own photo — listings, videos — override it).
export const alt = "land.db — Land & plots for sale in Bangladesh";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(135deg, #123f30 0%, #1f6b4f 60%, #2f8a66 100%)",
          color: "#f4f7ef",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <svg width="96" height="96" viewBox="0 0 32 32">
            <rect width="32" height="32" rx="9" fill="#f4f7ef" />
            <path d="M6.5 20.5c3 3.2 6.2 4.5 9.5 4.5s6.5-1.3 9.5-4.5" stroke="#e9a93c" strokeWidth="2.4" strokeLinecap="round" fill="none" />
            <path d="M16 6.5c4.6 1.6 6.4 5.4 4.8 9.5-3.9.6-7.7-1.3-8.6-5.1 1-1.9 2.2-3.4 3.8-4.4Z" fill="#1f6b4f" />
          </svg>
          <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: -2 }}>land.db</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>Land & plots for sale in Bangladesh</div>
          <div style={{ marginTop: 24, fontSize: 32, opacity: 0.85 }}>Verified listings · photos · documents checklist · walkthrough videos</div>
        </div>
        <div style={{ display: "flex", fontSize: 26, color: "#e9a93c", fontWeight: 700 }}>by LandnestBD</div>
      </div>
    ),
    size,
  );
}
