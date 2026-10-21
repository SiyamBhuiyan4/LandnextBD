// Byte-range helpers for media stored as several parts (big videos are split
// into CONFIG.telegramChunkBytes pieces because the Telegram Bot API only
// serves files up to 20 MB). Pure functions: shared by the upload hook, the
// Convex /media HTTP action and unit tests.

/** Splits `total` bytes into consecutive [start, end) slices of at most `chunk` bytes. */
export function chunkBounds(total: number, chunk: number): { start: number; end: number }[] {
  if (chunk <= 0) throw new Error("chunk must be positive");
  const out: { start: number; end: number }[] = [];
  for (let start = 0; start < total; start += chunk) out.push({ start, end: Math.min(total, start + chunk) });
  return out;
}

/**
 * Parses a single `Range: bytes=…` header against a file of `total` bytes.
 * Returns inclusive [start, end], null when there is no (usable) header, or
 * "unsatisfiable" when the range lies outside the file. Multi-range requests
 * are answered with their first range only.
 */
export function parseRange(header: string | null | undefined, total: number): { start: number; end: number } | null | "unsatisfiable" {
  if (!header) return null;
  const m = /^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*(?:,.*)?$/i.exec(header);
  if (!m || (m[1] === "" && m[2] === "")) return null;
  if (m[1] === "") {
    // suffix range: last N bytes
    const n = Number(m[2]);
    if (n <= 0 || total === 0) return "unsatisfiable";
    return { start: Math.max(0, total - n), end: total - 1 };
  }
  const start = Number(m[1]);
  if (start >= total) return "unsatisfiable";
  const end = m[2] === "" ? total - 1 : Math.min(Number(m[2]), total - 1);
  if (end < start) return null; // invalid: ignore the header (RFC 9110)
  return { start, end };
}

export type PartSlice = {
  /** Which part holds the first requested byte. */
  index: number;
  /** Inclusive byte range inside that part. */
  partStart: number;
  partEnd: number;
  /** The same range in whole-file coordinates (for Content-Range). */
  start: number;
  end: number;
  total: number;
};

/**
 * Maps an inclusive whole-file range onto the part that contains `start`,
 * clamped so the answer never crosses into the next part. Browsers then ask
 * for the next range themselves, so every response is served from one part.
 */
export function mapRangeToPart(sizes: readonly number[], start: number, end: number): PartSlice | null {
  const total = sizes.reduce((a, b) => a + b, 0);
  if (start < 0 || start >= total || end < start) return null;
  let offset = 0;
  for (let index = 0; index < sizes.length; index++) {
    const size = sizes[index];
    if (start < offset + size) {
      const partStart = start - offset;
      const partEnd = Math.min(size - 1, Math.min(end, total - 1) - offset);
      return { index, partStart, partEnd, start, end: offset + partEnd, total };
    }
    offset += size;
  }
  return null;
}
