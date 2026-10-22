"use client";

import { cn } from "@/lib/utils";

import { useId, useState } from "react";
import { useFmt } from "@/hooks/use-fmt";

/**
 * Single-series area chart (one measure, one axis) with a crosshair + tooltip.
 * Color is the theme's chart-1 token; text uses text tokens, never the series color.
 */
export function TimeSeriesChart({
  title,
  data,
  format = (n) => String(n),
  height = 180,
}: {
  title: string;
  data: { day: string; value: number }[];
  format?: (n: number) => string;
  height?: number;
}) {
  const fmt = useFmt();
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const W = 600;
  const H = height;
  const pad = { l: 36, r: 8, t: 10, b: 22 };
  const max = Math.max(1, ...data.map((d) => d.value));
  const niceMax = niceCeil(max);
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / Math.max(1, data.length - 1);
  const y = (v: number) => pad.t + (1 - v / niceMax) * (H - pad.t - pad.b);
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join("");
  const area = `${line}L${x(data.length - 1)},${y(0)}L${x(0)},${y(0)}Z`;
  const ticks = [0, niceMax / 2, niceMax];
  const h = hover !== null ? data[hover] : null;

  return (
    <figure className="rounded-2xl border bg-card p-4 shadow-soft">
      <figcaption className="mb-2 text-sm font-semibold">{title}</figcaption>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full touch-none"
          role="img"
          aria-label={`${title}: ${data.map((d) => `${d.day} ${format(d.value)}`).join(", ")}`}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - r.left) / r.width) * W;
            const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (data.length - 1));
            setHover(Math.max(0, Math.min(data.length - 1, i)));
          }}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--chart-1)" stopOpacity="0.28" />
              <stop offset="1" stopColor="var(--chart-1)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {ticks.map((tv) => (
            <g key={tv}>
              <line x1={pad.l} x2={W - pad.r} y1={y(tv)} y2={y(tv)} stroke="var(--border)" strokeWidth="1" />
              <text x={pad.l - 6} y={y(tv) + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">
                {format(tv)}
              </text>
            </g>
          ))}
          {[0, Math.floor((data.length - 1) / 2), data.length - 1].map((i) =>
            data[i] ? (
              <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"} className="fill-muted-foreground text-[11px]">
                {fmt.digits(data[i].day.slice(5))}
              </text>
            ) : null,
          )}
          <path d={area} fill={`url(#g${id})`} />
          <path d={line} fill="none" stroke="var(--chart-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {hover !== null && h && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={y(0)} stroke="var(--muted-foreground)" strokeWidth="1" strokeDasharray="3 3" />
              <circle cx={x(hover)} cy={y(h.value)} r="5" fill="var(--chart-1)" stroke="var(--card)" strokeWidth="2" />
            </g>
          )}
        </svg>
        {h && hover !== null && (
          <div
            className="pointer-events-none absolute top-0 rounded-lg border bg-popover px-2.5 py-1.5 text-xs shadow-md"
            style={{ left: `${(x(hover) / W) * 100}%`, transform: `translateX(${hover > data.length / 2 ? "-105%" : "5%"})` }}
          >
            <p className="text-muted-foreground">{fmt.digits(h.day)}</p>
            <p className="font-semibold">{format(h.value)}</p>
          </div>
        )}
      </div>
    </figure>
  );
}

/** Horizontal magnitude bars, single hue, value labels in text color. */
export function BarList({ title, rows, format = (n) => String(n) }: { title: string; rows: { label: string; value: number }[]; format?: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <figure className="rounded-2xl border bg-card p-4 shadow-soft">
      <figcaption className="mb-3 text-sm font-semibold">{title}</figcaption>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm" title={`${r.label}: ${format(r.value)}`}>
            <span className="truncate text-muted-foreground">{r.label}</span>
            <span className="font-semibold tabular-nums">{format(r.value)}</span>
            <span className="col-span-2 h-2 overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full bg-[var(--chart-1)]" style={{ width: `${(r.value / max) * 100}%` }} />
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

export function StatTile({ label, value, hint, className }: { label: string; value: string; hint?: string; className?: string }) {
  return (
    <div className={cn("rounded-2xl border bg-card p-4 shadow-soft", className)}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 font-heading text-2xl font-bold">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function niceCeil(n: number) {
  if (n <= 5) return 5;
  const p = 10 ** Math.floor(Math.log10(n));
  const m = n / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}
