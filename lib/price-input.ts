// Budget typed by hand. People write a price in whatever shape is natural:
// "2000", "1,50,000", "25 lakh", "2.5cr", "২৫ লাখ". All of them mean a number
// of taka, so parse them all rather than making anyone pick from fixed bands.

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";

/** Multipliers, longest spelling first so "lakhs" is not read as "lakh" + "s". */
const UNITS: [RegExp, number][] = [
  [/^(crores?|crs?|koti|কোটি)$/, 10_000_000],
  [/^(lakhs?|lacs?|lakh|lac|lk|লাখ|লক্ষ)$/, 100_000],
  [/^(thousands?|hazar|hajar|হাজার|k)$/, 1_000],
];

/**
 * Taka from what someone typed, or null when it is not a usable number.
 * Returns a whole number; negatives and zero are rejected.
 */
export function parseBudget(input: string): number | null {
  if (!input) return null;

  // Bangla digits, then drop grouping commas and spaces around the number.
  const s = input
    .trim()
    .toLowerCase()
    .replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)))
    .replace(/[,،]/g, "") // grouping only: "1,50,000" is one number
    .replace(/\s+/g, " ")
    .replace(/^৳|^tk\.?|^bdt/i, "")
    .trim();
  if (!s) return null;

  const m = s.match(/^([\d.]+)\s*(.*)$/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;

  const suffix = m[2].replace(/[.\s]+$/, "").trim();
  if (!suffix) return Math.round(n);

  for (const [pattern, factor] of UNITS) if (pattern.test(suffix)) return Math.round(n * factor);
  return null; // a suffix we do not understand: better to say nothing than guess
}

/** Short Bangladeshi reading of an amount: "৳2.5 Crore", "৳25 Lakh", "৳2,000". */
export function describeBudget(taka: number): string {
  const round = (v: number) => String(Number(v.toFixed(2)));
  if (taka >= 10_000_000) return `৳${round(taka / 10_000_000)} Crore`;
  if (taka >= 100_000) return `৳${round(taka / 100_000)} Lakh`;
  if (taka >= 1_000) return `৳${round(taka / 1_000)} Thousand`;
  return `৳${taka}`;
}
