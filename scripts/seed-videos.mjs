// Renders original animated "site walkthrough" clips (canvas + MediaRecorder in
// headless Chrome via Playwright) and attaches them to seeded listings through
// the real media pipeline (Convex storage -> telegram.push). Replaces the old
// Mux test-stream placeholders. Idempotent: listings that already have a sample
// video are skipped.
//
// Usage: node scripts/seed-videos.mjs [--prod] [--out <dir>] [--render-only]
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const argv = process.argv.slice(2);
const prod = argv.includes("--prod");
const renderOnly = argv.includes("--render-only");
const outDir = argv.includes("--out") ? argv[argv.indexOf("--out") + 1] : join(tmpdir(), "landnest-sample-videos");
mkdirSync(outDir, { recursive: true });

const convex = (fn, args) => {
  const out = execFileSync("npx", ["convex", "run", ...(prod ? ["--prod"] : []), fn, JSON.stringify(args ?? {})], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
  return out ? JSON.parse(out) : null;
};

const hash = (str) => [...str].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
const MAX_BYTES = 19 * 1024 * 1024; // one Telegram upload part
const CODEC = "avc1.640028"; // H.264 High@4.0: plays in Safari, Chrome, Firefox, Telegram

const UNIT = { katha: "Katha", decimal: "Decimal", bigha: "Bigha", acre: "Acre", sqft: "sqft" };
const TYPE_LABEL = {
  residential: "Residential plot",
  commercial: "Commercial plot",
  mixed_use: "Mixed-use plot",
  industrial: "Industrial land",
  farmland: "Agricultural land",
  quarry: "Sand & quarry land",
};
const TIMES = ["morning", "noon", "golden", "dusk"];

function sceneFor(l, k) {
  const h = hash(l.id) + k * 7;
  let kind;
  if (l.landType === "farmland") kind = "farmland";
  else if (l.landType === "commercial" || l.landType === "mixed_use" || l.landType === "industrial") kind = "commercial";
  else if (l.landType === "quarry") kind = "lakeside";
  else kind = h % 3 === 0 ? "lakeside" : "residential";
  const size = `${Number.isInteger(l.sizeValue) ? l.sizeValue : l.sizeValue.toFixed(1)} ${UNIT[l.sizeUnit] ?? l.sizeUnit}`;
  const place = l.sectorBlock ? `${l.areaName}, ${l.sectorBlock.split(",")[0]}` : `${l.areaName}, ${l.district}`;
  const title = l.titles[k];
  const road = k > 0;
  const details = [TYPE_LABEL[l.landType] ?? "Land", l.facing ? `${l.facing.replace("_", "-")} facing` : null, l.roadWidthFt ? `${l.roadWidthFt} ft road` : null]
    .filter(Boolean)
    .join(" · ");
  return {
    seed: h,
    kind,
    time: TIMES[(h >>> 3) % TIMES.length],
    shot: road ? "road" : "walk",
    duration: 14 + (h % 5), // 14–18 s
    caption: `${size} · ${place}`,
    sub: `${title} — ${details}`,
  };
}

// ---------------- in-page renderer ----------------
// Runs inside Chrome. Draws one frame as a pure function of time t (seconds).
const PAGE_SCRIPT = `const CODEC = "${CODEC}";
` + String.raw`
window.renderClip = async function (cfg, mode) {
  const W = 1280, H = 720;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  document.body.appendChild(cv);
  const c = cv.getContext("2d");

  let s = cfg.seed >>> 0;
  const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const ease = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  const lerp = (a, b, x) => a + (b - a) * x;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));

  const PAL = {
    morning: { sky: ["#7fbfe9", "#cfe7f5", "#fde7c9"], sun: [0.18, 0.30], sunC: "#fff3c4", glow: "rgba(255,226,170,0.45)", hillFar: "#9fbfb0", hillNear: "#7fa982", ground: ["#86ad5f", "#5b8a43"], tint: "rgba(255,236,200,0.06)", light: false },
    noon:    { sky: ["#3f97df", "#86c3ef", "#dff1fb"], sun: [0.70, 0.12], sunC: "#fffbe6", glow: "rgba(255,255,230,0.35)", hillFar: "#8fb4a6", hillNear: "#6e9f73", ground: ["#7fae55", "#4f8a3b"], tint: "rgba(255,255,255,0)", light: false },
    golden:  { sky: ["#f08a4b", "#f7b267", "#fde2a6"], sun: [0.82, 0.36], sunC: "#fff0b8", glow: "rgba(255,180,90,0.55)", hillFar: "#c69a7a", hillNear: "#9c8a5a", ground: ["#a7a34f", "#6f7d36"], tint: "rgba(255,150,60,0.10)", light: false },
    dusk:    { sky: ["#1f2350", "#5b3f78", "#ea8c6a"], sun: [0.30, 0.46], sunC: "#ffd9a8", glow: "rgba(240,140,110,0.45)", hillFar: "#4a4766", hillNear: "#3c4a4a", ground: ["#4e6640", "#2e4229"], tint: "rgba(40,30,90,0.18)", light: true },
  };
  const P = PAL[cfg.time];
  const accent = { residential: "#d8b26e", lakeside: "#d8b26e", commercial: "#e0bf7f", farmland: "#e6c65a" }[cfg.kind];

  // ---- static world (generated once) ----
  const WW = 1700; // world width (camera pans across it)
  const horizon = 330;
  const clouds = Array.from({ length: 6 }, () => ({ x: r() * WW, y: 50 + r() * 160, s: 0.6 + r() * 0.9, v: 6 + r() * 10 }));
  const stars = Array.from({ length: 90 }, () => ({ x: r() * WW, y: r() * 260, a: 0.3 + r() * 0.7, p: r() * 6 }));
  const hillFar = Array.from({ length: 9 }, (_, i) => ({ x: i * 230 - 100 + r() * 60, w: 260 + r() * 180, h: 50 + r() * 70 }));
  const hillNear = Array.from({ length: 7 }, (_, i) => ({ x: i * 300 - 120 + r() * 80, w: 320 + r() * 200, h: 30 + r() * 45 }));
  const treeLine = Array.from({ length: 46 }, () => ({ x: r() * WW, s: 14 + r() * 16, g: ["#2f6b3a", "#3b7d45", "#285c33", "#4a8a4f"][Math.floor(r() * 4)], y: r() * 10 }));
  const buildings = [];
  for (let x = 60; x < WW;) { const w = 50 + r() * 90; buildings.push({ x, w, h: 70 + r() * 190, c: 0.75 + r() * 0.25, lit: Array.from({ length: 40 }, () => r() < 0.45) }); x += w + 8 + r() * 26; }
  const houses = Array.from({ length: 9 }, () => ({ x: r() * WW, w: 50 + r() * 40, h: 34 + r() * 22, roof: ["#b5523b", "#8a4a3a", "#c7763d", "#5d6f84"][Math.floor(r() * 4)], wall: ["#efe4cf", "#f4efe6", "#e8d5b5"][Math.floor(r() * 3)] }));
  const nearTrees = Array.from({ length: 7 }, (_, i) => ({ x: i * 280 + r() * 160, s: 52 + r() * 40, g: ["#2f6b3a", "#3b7d45", "#285c33"][Math.floor(r() * 3)] }));
  const birds = Array.from({ length: 5 }, () => ({ x: r() * 600, y: 90 + r() * 80, p: r() * 6 }));
  const cars = Array.from({ length: cfg.shot === "road" ? 6 : 4 }, (_, i) => ({ lane: i % 2, off: r() * WW, v: 110 + r() * 90, c: ["#e94f37", "#2f7ed8", "#f2c14e", "#f4f4f4", "#3a3a3a", "#2fa36b"][Math.floor(r() * 6)], bus: r() < 0.2 }));
  const plotCx = WW * (0.48 + r() * 0.08);

  // Camera: slow pan + push-in. Road shot starts on the road and pans the other way.
  const cam = (t) => {
    const x = ease(clamp(t / cfg.duration));
    return cfg.shot === "road"
      ? { x: lerp(WW - W - 40, 120, x), z: lerp(1.12, 1.0, x), y: lerp(40, 0, x) }
      : { x: lerp(60, WW - W - 120, x) * 0.55 + (plotCx - W / 2) * 0.45 * x, z: lerp(1.0, 1.22, x), y: lerp(0, 30, x) };
  };

  function rr(x, y, w, h, rad) { c.beginPath(); c.roundRect(x, y, w, h, rad); }

  function tree(x, y, sz, g) {
    c.fillStyle = "#5b4632"; c.fillRect(x - sz * 0.08, y - sz * 0.2, sz * 0.16, sz * 0.9);
    c.fillStyle = g; c.beginPath(); c.ellipse(x, y - sz * 0.55, sz * 0.62, sz * 0.7, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = "rgba(255,255,255,0.08)"; c.beginPath(); c.ellipse(x - sz * 0.2, y - sz * 0.75, sz * 0.25, sz * 0.3, 0, 0, Math.PI * 2); c.fill();
  }

  function car(x, y, col, dir, bus, scale) {
    c.save(); c.translate(x, y); c.scale(dir * scale, scale);
    const L = bus ? 120 : 70;
    c.fillStyle = "rgba(0,0,0,0.25)"; c.beginPath(); c.ellipse(0, 4, L * 0.55, 6, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = col; rr(-L / 2, -22, L, 20, 5); c.fill();
    if (bus) { rr(-L / 2, -44, L, 24, 6); c.fill(); c.fillStyle = "rgba(200,230,255,0.85)"; for (let i = 0; i < 6; i++) c.fillRect(-L / 2 + 8 + i * 18, -40, 13, 12); }
    else { c.beginPath(); c.moveTo(-L * 0.28, -22); c.lineTo(-L * 0.16, -36); c.lineTo(L * 0.18, -36); c.lineTo(L * 0.32, -22); c.closePath(); c.fill(); c.fillStyle = "rgba(200,230,255,0.85)"; c.beginPath(); c.moveTo(-L * 0.22, -23); c.lineTo(-L * 0.13, -33); c.lineTo(L * 0.0, -33); c.lineTo(L * 0.0, -23); c.closePath(); c.fill(); c.beginPath(); c.moveTo(L * 0.04, -23); c.lineTo(L * 0.04, -33); c.lineTo(L * 0.16, -33); c.lineTo(L * 0.26, -23); c.closePath(); c.fill(); }
    c.fillStyle = "#1d1d1d"; c.beginPath(); c.arc(-L * 0.3, -2, 7, 0, 7); c.arc(L * 0.3, -2, 7, 0, 7); c.fill();
    c.fillStyle = "#9a9a9a"; c.beginPath(); c.arc(-L * 0.3, -2, 3, 0, 7); c.arc(L * 0.3, -2, 3, 0, 7); c.fill();
    if (P.light) { const g = c.createLinearGradient(L / 2, 0, L / 2 + 120, 0); g.addColorStop(0, "rgba(255,240,180,0.55)"); g.addColorStop(1, "rgba(255,240,180,0)"); c.fillStyle = g; c.beginPath(); c.moveTo(L / 2, -14); c.lineTo(L / 2 + 120, -30); c.lineTo(L / 2 + 120, 8); c.closePath(); c.fill(); c.fillStyle = "#ff5a4a"; c.fillRect(-L / 2 - 2, -18, 4, 6); }
    c.restore();
  }

  function frame(t, overlays = true) {
    const k = cam(t);
    // sky (screen space)
    const g = c.createLinearGradient(0, 0, 0, horizon + 60);
    g.addColorStop(0, P.sky[0]); g.addColorStop(0.55, P.sky[1]); g.addColorStop(1, P.sky[2]);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    if (cfg.time === "dusk") for (const st of stars) { const x = ((st.x - k.x * 0.05) % WW + WW) % WW; if (x > W) continue; c.fillStyle = "rgba(255,255,255," + (st.a * (0.6 + 0.4 * Math.sin(t * 2 + st.p))) + ")"; c.fillRect(x, st.y, 2, 2); }
    // sun with glow
    const sx = P.sun[0] * W - k.x * 0.04, sy = P.sun[1] * H;
    const sg = c.createRadialGradient(sx, sy, 10, sx, sy, 220); sg.addColorStop(0, P.glow); sg.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = sg; c.fillRect(0, 0, W, H);
    c.fillStyle = P.sunC; c.beginPath(); c.arc(sx, sy, 38, 0, 7); c.fill();
    // clouds (drift)
    for (const cl of clouds) {
      const x = ((cl.x + t * cl.v - k.x * 0.15) % (WW + 300) + WW + 300) % (WW + 300) - 200;
      c.fillStyle = cfg.time === "dusk" ? "rgba(255,190,170,0.35)" : cfg.time === "golden" ? "rgba(255,236,210,0.75)" : "rgba(255,255,255,0.85)";
      for (const [dx, dy, rx, ry] of [[0, 0, 60, 18], [34, -12, 40, 22], [-30, -6, 32, 16]]) { c.beginPath(); c.ellipse(x + dx * cl.s, cl.y + dy * cl.s, rx * cl.s, ry * cl.s, 0, 0, Math.PI * 2); c.fill(); }
    }
    // birds
    c.strokeStyle = cfg.time === "dusk" ? "rgba(20,20,40,0.8)" : "rgba(40,40,40,0.7)"; c.lineWidth = 2;
    for (const b of birds) { const x = (b.x + t * 40) % (W + 100) - 50, y = b.y + Math.sin(t + b.p) * 6, f = Math.sin(t * 8 + b.p) * 5; c.beginPath(); c.moveTo(x - 8, y - f); c.quadraticCurveTo(x - 4, y - 3, x, y); c.quadraticCurveTo(x + 4, y - 3, x + 8, y - f); c.stroke(); }

    // world space with camera zoom (anchor at horizon centre)
    c.save();
    c.translate(W / 2, horizon + 40); c.scale(k.z, k.z); c.translate(-W / 2, -(horizon + 40) + k.y);
    const px = (f) => -k.x * f; // parallax offset
    // far hills
    c.fillStyle = P.hillFar;
    for (const hl of hillFar) { const x = hl.x + px(0.3); c.beginPath(); c.ellipse(x, horizon + 10, hl.w / 2, hl.h, 0, Math.PI, 0); c.fill(); }
    // skyline / distant houses on the horizon
    if (cfg.kind === "commercial") {
      for (const b of buildings) {
        const x = b.x + px(0.55); if (x > W + 50 || x + b.w < -50) continue;
        c.fillStyle = P.light ? "rgb(" + (60 * b.c) + "," + (66 * b.c) + "," + (90 * b.c) + ")" : "rgb(" + (150 * b.c) + "," + (164 * b.c) + "," + (178 * b.c) + ")";
        c.fillRect(x, horizon + 12 - b.h, b.w, b.h);
        let n = 0;
        for (let wy = horizon + 2 - b.h + 12; wy < horizon - 4; wy += 18) for (let wx = x + 7; wx < x + b.w - 10; wx += 15) {
          const lit = b.lit[n++ % b.lit.length];
          c.fillStyle = P.light ? (lit ? "rgba(255,214,120,0.9)" : "rgba(30,30,50,0.6)") : "rgba(230,242,250," + (lit ? 0.75 : 0.35) + ")";
          c.fillRect(wx, wy, 7, 10);
        }
      }
    }
    c.fillStyle = P.hillNear;
    for (const hl of hillNear) { const x = hl.x + px(0.45); c.beginPath(); c.ellipse(x, horizon + 14, hl.w / 2, hl.h, 0, Math.PI, 0); c.fill(); }
    // ground
    const gg = c.createLinearGradient(0, horizon, 0, H + 80); gg.addColorStop(0, P.ground[0]); gg.addColorStop(1, P.ground[1]);
    c.fillStyle = gg; c.fillRect(-200, horizon + 10, W + 400, H);
    // tree line
    for (const tr of treeLine) { const x = tr.x + px(0.6); if (x < -40 || x > W + 40) continue; tree(x, horizon + 18 + tr.y, tr.s, tr.g); }
    if (cfg.kind === "residential") for (const hs of houses) {
      const x = hs.x + px(0.65); if (x < -80 || x > W + 80) continue; const y = horizon + 34;
      c.fillStyle = hs.wall; c.fillRect(x, y - hs.h, hs.w, hs.h);
      c.fillStyle = hs.roof; c.beginPath(); c.moveTo(x - 6, y - hs.h); c.lineTo(x + hs.w / 2, y - hs.h - 22); c.lineTo(x + hs.w + 6, y - hs.h); c.closePath(); c.fill();
      c.fillStyle = P.light ? "rgba(255,210,120,0.95)" : "#6b8fb0"; c.fillRect(x + hs.w * 0.2, y - hs.h * 0.7, 10, 10); c.fillRect(x + hs.w * 0.65, y - hs.h * 0.7, 10, 10);
    }
    // lake
    if (cfg.kind === "lakeside") {
      const lx = WW * 0.22 + px(0.8), ly = horizon + 70;
      const lg = c.createLinearGradient(0, ly - 30, 0, ly + 60); lg.addColorStop(0, P.sky[1]); lg.addColorStop(1, cfg.time === "dusk" ? "#2c3560" : "#3f86b5");
      c.fillStyle = lg; c.beginPath(); c.ellipse(lx, ly, 360, 52, 0, 0, 7); c.fill();
      c.strokeStyle = "rgba(255,255,255,0.55)"; c.lineWidth = 2;
      for (let i = 0; i < 9; i++) { const yy = ly - 30 + i * 7; const ww = 40 + (i % 3) * 30; const xx = lx - 200 + ((i * 97 + t * 25 * (i % 2 ? 1 : -1)) % 380 + 380) % 380; c.beginPath(); c.moveTo(xx, yy); c.lineTo(xx + ww, yy); c.stroke(); }
      // reflection of the sun
      c.fillStyle = P.glow; c.beginPath(); c.ellipse(lx + 80, ly, 70, 8, 0, 0, 7); c.fill();
      // small boat
      const bx = lx - 150 + Math.sin(t * 0.3) * 120, by = ly + 6 + Math.sin(t * 1.7) * 2;
      c.fillStyle = "#6b4a2f"; c.beginPath(); c.moveTo(bx - 26, by); c.lineTo(bx + 26, by); c.lineTo(bx + 18, by + 9); c.lineTo(bx - 18, by + 9); c.closePath(); c.fill();
      c.fillStyle = "#333"; c.fillRect(bx - 2, by - 22, 3, 22);
    }
    // farmland rows converge to the horizon
    if (cfg.kind === "farmland") {
      const vx = W / 2 + px(0.9) + WW * 0.25;
      for (let i = -24; i <= 24; i++) {
        c.strokeStyle = i % 2 ? "rgba(70,110,40,0.55)" : (cfg.time === "golden" ? "rgba(240,200,90,0.55)" : "rgba(220,200,90,0.45)");
        c.lineWidth = 9; c.beginPath(); c.moveTo(vx + i * 6, horizon + 40); c.lineTo(vx + i * 150, H + 60); c.stroke();
      }
      // swaying crop tufts
      c.strokeStyle = "rgba(60,110,40,0.8)"; c.lineWidth = 2;
      for (let i = 0; i < 70; i++) { const x = ((i * 53) % (W + 200)) - 100 + px(0.95) % 200, y = horizon + 120 + ((i * 37) % 220); const sw = Math.sin(t * 2 + i) * 4; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + sw, y - 10, x + sw * 1.6, y - 18); c.stroke(); }
    }

    // plot with dashed boundary + corner pegs
    const ox = plotCx + px(1.0), py = horizon + 150;
    const pegs = [[ox - 210, py - 50], [ox + 210, py - 50], [ox + 300, py + 120], [ox - 300, py + 120]];
    c.fillStyle = accent; c.globalAlpha = 0.5; c.beginPath(); pegs.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.fill(); c.globalAlpha = 1;
    // subtle grid inside the plot
    c.save(); c.clip(); c.strokeStyle = "rgba(255,255,255,0.12)"; c.lineWidth = 1; for (let i = -6; i <= 6; i++) { c.beginPath(); c.moveTo(ox + i * 35, py - 50); c.lineTo(ox + i * 50, py + 120); c.stroke(); } c.restore();
    c.setLineDash([18, 11]); c.lineDashOffset = -t * 30; c.lineWidth = 4; c.strokeStyle = "rgba(255,255,255,0.95)";
    c.beginPath(); pegs.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.stroke(); c.setLineDash([]);
    for (const [x, y] of pegs) {
      c.fillStyle = "rgba(0,0,0,0.25)"; c.beginPath(); c.ellipse(x, y + 4, 9, 3, 0, 0, 7); c.fill();
      c.fillStyle = "#e94f37"; c.fillRect(x - 4, y - 34, 8, 38);
      const wave = Math.sin(t * 4 + x) * 3;
      c.fillStyle = "#f4c542"; c.beginPath(); c.moveTo(x + 4, y - 34); c.lineTo(x + 24, y - 29 + wave); c.lineTo(x + 4, y - 22); c.closePath(); c.fill();
    }
    // location pin, bobbing with a pulsing ring
    const pinY = py + 30 - 70 + Math.sin(t * 2.2) * 6;
    const pulse = (t * 0.8) % 1;
    c.strokeStyle = "rgba(233,79,55," + (1 - pulse) + ")"; c.lineWidth = 3; c.beginPath(); c.ellipse(ox, py + 34, 18 + pulse * 70, (18 + pulse * 70) * 0.35, 0, 0, 7); c.stroke();
    c.fillStyle = "rgba(0,0,0,0.25)"; c.beginPath(); c.ellipse(ox, py + 34, 12, 4, 0, 0, 7); c.fill();
    c.fillStyle = "#e94f37"; c.beginPath(); c.arc(ox, pinY, 22, Math.PI * 0.85, Math.PI * 0.15); c.lineTo(ox, pinY + 46); c.closePath(); c.fill();
    c.fillStyle = "#ffffff"; c.beginPath(); c.arc(ox, pinY, 9, 0, 7); c.fill();

    // road
    const ry = H - 120;
    c.fillStyle = "#4f4f52"; c.beginPath(); c.moveTo(-200, ry - 20); c.lineTo(W + 200, ry - 34); c.lineTo(W + 200, ry + 96); c.lineTo(-200, ry + 110); c.closePath(); c.fill();
    c.fillStyle = "#c9c2b0"; c.beginPath(); c.moveTo(-200, ry - 26); c.lineTo(W + 200, ry - 40); c.lineTo(W + 200, ry - 34); c.lineTo(-200, ry - 20); c.closePath(); c.fill();
    c.strokeStyle = "#f5f5f0"; c.lineWidth = 4; c.setLineDash([40, 30]); c.lineDashOffset = k.x * 1.1; c.beginPath(); c.moveTo(-200, ry + 45); c.lineTo(W + 200, ry + 31); c.stroke(); c.setLineDash([]);
    for (const cr of cars) {
      const dir = cr.lane ? -1 : 1;
      const x = (((cr.off + dir * t * cr.v + px(1.1)) % (WW + 400)) + WW + 400) % (WW + 400) - 200;
      const y = cr.lane ? ry + 18 : ry + 80;
      car(x, y - (x / W) * 12, cr.c, dir, cr.bus, cr.lane ? 0.85 : 1);
    }
    // foreground trees (strong parallax)
    for (const tr of nearTrees) { const x = tr.x + px(1.5); if (x < -120 || x > W + 120) continue; tree(x, H + 70, tr.s * 1.7, tr.g); }
    c.restore();

    // colour grade + vignette
    c.fillStyle = P.tint; c.fillRect(0, 0, W, H);
    const vg = c.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95); vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.35)");
    c.fillStyle = vg; c.fillRect(0, 0, W, H);

    if (!overlays) return;
    // lower third
    const a = clamp((t - 0.8) / 0.7) * clamp((cfg.duration - 0.6 - t) / 0.6);
    if (a > 0) {
      const slide = (1 - ease(clamp((t - 0.8) / 0.7))) * -40;
      c.save(); c.globalAlpha = a; c.translate(slide, 0);
      c.font = "700 34px 'Helvetica Neue', Arial, sans-serif";
      const w1 = c.measureText(cfg.caption).width;
      c.font = "400 20px 'Helvetica Neue', Arial, sans-serif";
      const w2 = c.measureText(cfg.sub).width;
      const bw = Math.max(w1, w2) + 64;
      c.fillStyle = "rgba(12,22,18,0.72)"; rr(48, H - 150, bw, 98, 14); c.fill();
      c.fillStyle = "#2fa36b"; rr(48, H - 150, 8, 98, [14, 0, 0, 14]); c.fill();
      c.fillStyle = "#ffffff"; c.font = "700 34px 'Helvetica Neue', Arial, sans-serif"; c.fillText(cfg.caption, 76, H - 106);
      c.fillStyle = "rgba(255,255,255,0.82)"; c.font = "400 20px 'Helvetica Neue', Arial, sans-serif"; c.fillText(cfg.sub, 76, H - 72);
      c.restore();
    }
    // watermark
    c.save(); c.globalAlpha = 0.75;
    c.fillStyle = "rgba(0,0,0,0.28)"; rr(W - 150, 28, 118, 40, 20); c.fill();
    c.fillStyle = "#2fa36b"; c.beginPath(); c.arc(W - 128, 48, 7, 0, 7); c.fill();
    c.fillStyle = "#fff"; c.font = "700 20px 'Helvetica Neue', Arial, sans-serif"; c.fillText("land.db", W - 114, 55);
    c.restore();
    // fade in/out
    const f = Math.max(clamp(1 - t / 0.6), clamp((t - (cfg.duration - 0.6)) / 0.6));
    if (f > 0) { c.fillStyle = "rgba(0,0,0," + f + ")"; c.fillRect(0, 0, W, H); }
  }

  // poster frame (overlays on, mid-clip)
  frame(cfg.duration * 0.45);
  const poster = cv.toDataURL("image/jpeg", 0.86);

  const toB64 = (buf) => { let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000)); return btoa(bin); };

  if (mode === "webcodecs") {
    // Offline: every frame at an exact 1/30 s step, H.264 via WebCodecs. The
    // Node side muxes the samples into a progressive (faststart) MP4.
    const FPS = 30, N = Math.round(cfg.duration * FPS);
    const chunks = []; let description = null, err = null;
    const enc = new VideoEncoder({
      output: (chunk, meta) => {
        if (meta?.decoderConfig?.description) description = new Uint8Array(meta.decoderConfig.description);
        const b = new Uint8Array(chunk.byteLength); chunk.copyTo(b);
        chunks.push({ b, key: chunk.type === "key" });
      },
      error: (e) => (err = e),
    });
    enc.configure({ codec: CODEC, width: W, height: H, bitrate: 4_000_000, framerate: FPS, avc: { format: "avc" } });
    for (let i = 0; i < N; i++) {
      frame(i / FPS);
      const vf = new VideoFrame(cv, { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
      enc.encode(vf, { keyFrame: i % (FPS * 2) === 0 });
      vf.close();
      while (enc.encodeQueueSize > 4) await new Promise((r) => setTimeout(r, 1));
      if (err) throw err;
    }
    await enc.flush(); enc.close();
    if (err) throw err;
    const total = chunks.reduce((n, x) => n + x.b.length, 0);
    const all = new Uint8Array(total); let o = 0;
    for (const x of chunks) { all.set(x.b, o); o += x.b.length; }
    cv.remove();
    return { data: toB64(all), sizes: chunks.map((x) => x.b.length), keys: chunks.map((x) => x.key), description: toB64(description), fps: FPS, poster: poster.split(",")[1] };
  }

  // Fallback: record in real time with MediaRecorder (frame rate depends on the machine).
  frame(0);
  const stream = cv.captureStream(30);
  const rec = new MediaRecorder(stream, { mimeType: mode, videoBitsPerSecond: 3_500_000 });
  const rchunks = [];
  rec.ondataavailable = (e) => e.data.size && rchunks.push(e.data);
  const done = new Promise((res) => (rec.onstop = res));
  rec.start(1000);
  const t0 = performance.now();
  await new Promise((res) => {
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      frame(Math.min(t, cfg.duration));
      if (t >= cfg.duration + 0.05) return res();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  rec.stop();
  await done;
  const blob = new Blob(rchunks, { type: mode.split(";")[0] });
  cv.remove();
  return { video: toB64(new Uint8Array(await blob.arrayBuffer())), poster: poster.split(",")[1] };
};
`;

// ---------------- minimal MP4 muxer (one H.264 track, moov before mdat) ----------------
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; };
const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16BE(n & 0xffff); return b; };
const box = (type, ...parts) => { const body = Buffer.concat(parts); return Buffer.concat([u32(body.length + 8), Buffer.from(type, "latin1"), body]); };
const full = (type, version, flags, ...parts) => box(type, Buffer.from([version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255]), ...parts);
const MATRIX = Buffer.concat([0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000].map(u32));

function muxMp4({ data, sizes, keys, description, fps, width, height }) {
  const timescale = fps * 1000, delta = 1000, n = sizes.length;
  const durMs = Math.round((n * 1000) / fps), durTs = n * delta;
  const avc1 = box("avc1", Buffer.alloc(6), u16(1), Buffer.alloc(16), u16(width), u16(height), u32(0x00480000), u32(0x00480000), u32(0), u16(1), Buffer.alloc(32), u16(0x18), u16(0xffff), box("avcC", description));
  const stbl = (offset) =>
    box("stbl",
      full("stsd", 0, 0, u32(1), avc1),
      full("stts", 0, 0, u32(1), u32(n), u32(delta)),
      full("stss", 0, 0, u32(keys.filter(Boolean).length), ...keys.flatMap((k, i) => (k ? [u32(i + 1)] : []))),
      full("stsc", 0, 0, u32(1), u32(1), u32(n), u32(1)),
      full("stsz", 0, 0, u32(0), u32(n), ...sizes.map(u32)),
      full("stco", 0, 0, u32(1), u32(offset)));
  const moov = (offset) =>
    box("moov",
      full("mvhd", 0, 0, u32(0), u32(0), u32(1000), u32(durMs), u32(0x00010000), u16(0x0100), Buffer.alloc(10), MATRIX, Buffer.alloc(24), u32(2)),
      box("trak",
        full("tkhd", 0, 3, u32(0), u32(0), u32(1), u32(0), u32(durMs), Buffer.alloc(8), u16(0), u16(0), u16(0), u16(0), MATRIX, u32(width << 16), u32(height << 16)),
        box("mdia",
          full("mdhd", 0, 0, u32(0), u32(0), u32(timescale), u32(durTs), u16(0x55c4), u16(0)),
          full("hdlr", 0, 0, u32(0), Buffer.from("vide"), Buffer.alloc(12), Buffer.from("VideoHandler\0")),
          box("minf",
            full("vmhd", 0, 1, Buffer.alloc(8)),
            box("dinf", full("dref", 0, 0, u32(1), full("url ", 0, 1))),
            stbl(offset)))));
  const ftyp = box("ftyp", Buffer.from("isom"), u32(512), Buffer.from("isomiso2avc1mp41"));
  const moovLen = moov(0).length;
  return Buffer.concat([ftyp, moov(ftyp.length + moovLen + 8), u32(data.length + 8), Buffer.from("mdat"), data]);
}

// WebCodecs needs a secure context, so pages load from a fake https origin served by Playwright.
const RENDER_URL = "https://render.landnest.invalid/";
async function openRenderPage(context) {
  const page = await context.newPage();
  await page.route(RENDER_URL + "**", (r) => r.fulfill({ contentType: "text/html", body: "<html><body style='margin:0;background:#000'></body></html>" }));
  await page.goto(RENDER_URL);
  return page;
}

async function renderAll(jobs) {
  const browser = await chromium.launch({ channel: "chrome" });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const probe = await openRenderPage(ctx);
  const webcodecs = await probe.evaluate(async (codec) => {
    if (typeof VideoEncoder === "undefined") return false;
    const s = await VideoEncoder.isConfigSupported({ codec, width: 1280, height: 720, bitrate: 4_000_000, framerate: 30, avc: { format: "avc" } });
    return !!s.supported;
  }, CODEC);
  const mime = webcodecs
    ? "video/mp4"
    : await probe.evaluate(() => ["video/mp4;codecs=avc1", "video/webm;codecs=vp9"].find((t) => MediaRecorder.isTypeSupported(t)));
  await probe.close();
  const ext = mime.startsWith("video/mp4") ? "mp4" : "webm";
  console.log(webcodecs ? `encoding H.264 (${CODEC}) with WebCodecs, 30 fps` : `recording in real time as ${mime}`);
  const results = [];
  const queue = [...jobs];
  // One context (its own window) per worker so pages are never throttled as background tabs.
  const worker = async () => {
    const wctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await openRenderPage(wctx);
    await page.addScriptTag({ content: PAGE_SCRIPT });
    for (let job; (job = queue.shift()); ) {
      const file = join(outDir, `${job.name}.${ext}`);
      const posterFile = join(outDir, `${job.name}.jpg`);
      if (!existsSync(file) || !existsSync(posterFile)) {
        const out = await page.evaluate(([cfg, m]) => window.renderClip(cfg, m), [job.cfg, webcodecs ? "webcodecs" : mime]);
        const bytes = webcodecs
          ? muxMp4({ data: Buffer.from(out.data, "base64"), sizes: out.sizes, keys: out.keys, description: Buffer.from(out.description, "base64"), fps: out.fps, width: 1280, height: 720 })
          : Buffer.from(out.video, "base64");
        writeFileSync(file, bytes);
        writeFileSync(posterFile, Buffer.from(out.poster, "base64"));
      }
      const size = readFileSync(file).length;
      if (size < 300_000) throw new Error(`${file} is only ${size} bytes: frames were dropped`);
      if (size > MAX_BYTES) throw new Error(`${file} is ${size} bytes (> 19 MB)`);
      console.log(`  ${job.name}.${ext}  ${(size / 1e6).toFixed(1)} MB  ${job.cfg.duration}s  ${job.cfg.kind}/${job.cfg.time}/${job.cfg.shot}`);
      results.push({ ...job, file, posterFile, mime: mime.split(";")[0], size });
    }
    await wctx.close();
  };
  await Promise.all(Array.from({ length: webcodecs ? 3 : 1 }, worker));
  await browser.close();
  return results;
}

async function upload(url, file, type) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": type }, body: readFileSync(file) });
  if (!res.ok) throw new Error(`upload failed: ${res.status} ${await res.text()}`);
  return (await res.json()).storageId;
}

const listings = convex("sampleVideos:targets");
console.log(`${listings.length} listings need sample videos`);
const jobs = listings.flatMap((l) =>
  l.titles.map((title, k) => ({
    listing: l,
    title,
    name: `${l.slug.slice(0, 48)}-${k}`,
    cfg: sceneFor(l, k),
  })),
);
const rendered = jobs.length ? await renderAll(jobs) : [];
if (!renderOnly) {
  for (const l of listings) {
    const clips = rendered.filter((r) => r.listing.id === l.id).sort((a, b) => l.titles.indexOf(a.title) - l.titles.indexOf(b.title));
    const urls = convex("sampleVideos:uploadUrls", { n: clips.length * 2 });
    for (const [i, clip] of clips.entries()) {
      const videoStorageId = await upload(urls[i * 2], clip.file, clip.mime);
      const thumbStorageId = await upload(urls[i * 2 + 1], clip.posterFile, "image/jpeg");
      convex("sampleVideos:attach", {
        listingId: l.id,
        videoStorageId,
        thumbStorageId,
        durationSec: clip.cfg.duration,
        title: clip.title,
        fileName: `sample-${clip.name}.${clip.file.split(".").pop()}`,
      });
    }
    process.stdout.write(".");
  }
  const res = convex("sampleVideos:removePlaceholders");
  console.log(`\nremoved ${res.removed} placeholder videos on ${res.listings} listings`);
}
if (!renderOnly) {
  // Pushes to Telegram are paced (~20/min), so wait for them before pointing
  // videos back at the rendered posters (Telegram replaces them with tiny thumbs).
  for (let i = 0; i < 60; i++) {
    const st = convex("sampleVideos:status");
    const pending = st.rows.filter((r) => r.status === "processing").length;
    if (!pending) break;
    console.log(`waiting for ${pending} video(s) to finish processing…`);
    await new Promise((r) => setTimeout(r, 20_000));
  }
  const { fixed } = convex("sampleVideos:restorePosters");
  const st = convex("sampleVideos:status");
  console.log(`${st.samples} sample videos on ${st.listings} listings: ${st.ready} ready, ${st.onTelegram} on Telegram; ${fixed} posters restored`);
}
console.log("done");
