// Generates original illustrated land photos (procedural SVG -> WebP via sharp)
// and attaches them to seeded listings that have no images yet.
// Usage: node scripts/seed-images.mjs [--prod]
import { execFileSync } from "node:child_process";
import sharp from "sharp";

const prod = process.argv.includes("--prod");
const convex = (fn, args) => {
  const out = execFileSync("npx", ["convex", "run", ...(prod ? ["--prod"] : []), fn, JSON.stringify(args ?? {})], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
  return out ? JSON.parse(out) : null;
};

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (str) => [...str].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

const W = 1280;
const H = 853;

const PALETTES = {
  residential: { ground: ["#7fa35b", "#5e8a43"], accent: "#c9a46a" },
  commercial: { ground: ["#9aa58a", "#748064"], accent: "#d9b97a" },
  mixed_use: { ground: ["#8eab63", "#6b8d4b"], accent: "#cfa96e" },
  industrial: { ground: ["#b9a983", "#8f8262"], accent: "#a88f5c" },
  farmland: { ground: ["#a9c25a", "#6f9a3b"], accent: "#e2c15a" },
  quarry: { ground: ["#cdb48c", "#a68b62"], accent: "#8c7656" },
};

function sky(r) {
  const variants = [
    ["#9fd3f0", "#e8f4fb"],
    ["#f6c38f", "#fbe8d3"],
    ["#b8d7ea", "#f2f6f0"],
    ["#8ec5e6", "#dbeef8"],
  ];
  return variants[Math.floor(r() * variants.length)];
}

function trees(r, n, yBase, scale = 1) {
  let out = "";
  for (let i = 0; i < n; i++) {
    const x = r() * W;
    const s = (18 + r() * 26) * scale;
    const y = yBase + r() * 20 * scale;
    const g = ["#2f6b3a", "#3b7d45", "#285c33", "#4a8a4f"][Math.floor(r() * 4)];
    out += `<rect x="${x - s * 0.08}" y="${y - s * 0.2}" width="${s * 0.16}" height="${s * 0.9}" fill="#5b4632"/>`;
    out += `<ellipse cx="${x}" cy="${y - s * 0.55}" rx="${s * 0.62}" ry="${s * 0.7}" fill="${g}"/>`;
  }
  return out;
}

function skyline(r, y) {
  let x = 0;
  let out = "";
  while (x < W) {
    const w = 40 + r() * 80;
    const h = 40 + r() * 160;
    out += `<rect x="${x}" y="${y - h}" width="${w}" height="${h}" fill="#8796a3" opacity="${0.35 + r() * 0.3}"/>`;
    x += w + r() * 20;
  }
  return out;
}

function svgFor(listing, variant) {
  const r = rng(hash(listing.id) + variant * 101);
  const pal = PALETTES[listing.landType] ?? PALETTES.residential;
  const [s1, s2] = sky(r);
  const horizon = 330 + r() * 80;
  const hills = `<path d="M0 ${horizon} C ${W * 0.2} ${horizon - 60 - r() * 40}, ${W * 0.45} ${horizon - 10}, ${W * 0.6} ${horizon - 40 - r() * 30} S ${W * 0.9} ${horizon - 20}, ${W} ${horizon - 50} V ${horizon + 40} H 0 Z" fill="#7b9c80" opacity="0.55"/>`;
  let scene = "";

  if (variant === 2) {
    // aerial plot grid
    const cols = 5;
    const rows = 4;
    const cw = W / cols;
    const rh = H / rows;
    let cells = "";
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++) {
        const c = r() < 0.5 ? pal.ground[0] : pal.ground[1];
        cells += `<rect x="${i * cw + 6}" y="${j * rh + 6}" width="${cw - 12}" height="${rh - 12}" rx="6" fill="${c}" opacity="${0.8 + r() * 0.2}"/>`;
      }
    const hi = Math.floor(r() * cols);
    const hj = Math.floor(r() * rows);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <rect width="${W}" height="${H}" fill="#d8cfb8"/>
      ${cells}
      <rect x="0" y="${rh * 2 - 14}" width="${W}" height="28" fill="#5d5a55"/>
      <rect x="${cw * 3 - 14}" y="0" width="28" height="${H}" fill="#5d5a55"/>
      <rect x="${hi * cw + 6}" y="${hj * rh + 6}" width="${cw - 12}" height="${rh - 12}" rx="6" fill="none" stroke="#f4c542" stroke-width="8" stroke-dasharray="22 12"/>
      ${trees(r, 26, 0, 0.7).replace(/<rect[^>]*>/g, "")}
    </svg>`;
  }

  if (listing.landType === "farmland") {
    let rowsSvg = "";
    for (let i = 0; i < 18; i++) {
      const y = horizon + 20 + i * i * 1.6 + i * 6;
      rowsSvg += `<path d="M0 ${y} Q ${W / 2} ${y - 8} ${W} ${y}" stroke="${i % 2 ? pal.ground[1] : pal.accent}" stroke-width="${3 + i * 0.9}" fill="none" opacity="0.85"/>`;
    }
    scene = rowsSvg + trees(r, 10, horizon + 5, 0.8);
  } else if (listing.landType === "quarry") {
    scene = `<path d="M0 ${H} L ${W * 0.15} ${horizon + 60} L ${W * 0.55} ${horizon + 90} L ${W * 0.85} ${horizon + 40} L ${W} ${horizon + 70} V ${H} Z" fill="${pal.accent}"/>
      <ellipse cx="${W * 0.5}" cy="${H * 0.78}" rx="${W * 0.32}" ry="${H * 0.12}" fill="#9a8261"/>
      <ellipse cx="${W * 0.5}" cy="${H * 0.8}" rx="${W * 0.2}" ry="${H * 0.06}" fill="#7f6a4e"/>`;
  } else {
    const roadY = horizon + 120 + r() * 60;
    const plotX = W * (0.2 + r() * 0.3);
    const plotW = W * (0.35 + r() * 0.15);
    const pegs = [
      [plotX, roadY - 70],
      [plotX + plotW, roadY - 70],
      [plotX + plotW + 60, roadY + 140],
      [plotX - 60, roadY + 140],
    ];
    scene = `${listing.landType === "commercial" || listing.landType === "mixed_use" ? skyline(r, horizon + 5) : ""}
      ${trees(r, 12, horizon + 10, 0.9)}
      <polygon points="${pegs.map((p) => p.join(",")).join(" ")}" fill="${pal.accent}" opacity="0.55"/>
      <polygon points="${pegs.map((p) => p.join(",")).join(" ")}" fill="none" stroke="#ffffff" stroke-width="4" stroke-dasharray="16 10" opacity="0.9"/>
      ${pegs.map(([x, y]) => `<rect x="${x - 5}" y="${y - 30}" width="10" height="34" fill="#e94f37"/>`).join("")}
      <path d="M0 ${roadY + 170} L ${W} ${roadY + 150} L ${W} ${roadY + 230} L 0 ${roadY + 260} Z" fill="#545454"/>
      <path d="M0 ${roadY + 213} L ${W} ${roadY + 190}" stroke="#f5f5f0" stroke-width="5" stroke-dasharray="40 30"/>
      ${listing.landType === "industrial" ? `<rect x="${W * 0.72}" y="${horizon - 40}" width="220" height="110" fill="#9aa3ab"/><rect x="${W * 0.72 + 30}" y="${horizon - 110}" width="26" height="80" fill="#7d868e"/>` : ""}
      ${variant === 1 ? trees(r, 6, H - 40, 2.2) : ""}`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s1}"/><stop offset="1" stop-color="${s2}"/></linearGradient>
      <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${pal.ground[0]}"/><stop offset="1" stop-color="${pal.ground[1]}"/></linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#sky)"/>
    <circle cx="${W * (0.15 + r() * 0.7)}" cy="${90 + r() * 80}" r="${36 + r() * 20}" fill="#fff6d5" opacity="0.85"/>
    ${hills}
    <rect y="${horizon}" width="${W}" height="${H - horizon}" fill="url(#ground)"/>
    ${scene}
  </svg>`;
}

const listings = convex("seed:listingsNeedingImages");
console.log(`${listings.length} listings need images`);
for (const l of listings) {
  const count = 3 + (hash(l.id) % 3);
  const urls = convex("seed:uploadUrls", { n: count });
  const ids = [];
  for (let i = 0; i < count; i++) {
    const webp = await sharp(Buffer.from(svgFor(l, i % 3 === 2 ? 2 : i)))
      .webp({ quality: 70 })
      .toBuffer();
    const res = await fetch(urls[i], { method: "POST", headers: { "Content-Type": "image/webp" }, body: webp });
    if (!res.ok) throw new Error(`upload failed: ${res.status}`);
    ids.push((await res.json()).storageId);
  }
  convex("seed:attachImages", { listingId: l.id, storageIds: ids });
  process.stdout.write(".");
}
console.log("\ndone");
