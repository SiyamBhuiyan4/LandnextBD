// BDT and number formatting for English and Bangla.

export type Locale = "en" | "bn";

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

export function toBnDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

export function localizeDigits(input: string | number, locale: Locale): string {
  return locale === "bn" ? toBnDigits(input) : String(input);
}

/** South-Asian digit grouping: 12,34,56,789 */
export function groupIndian(n: number): string {
  const negative = n < 0;
  const [int, frac] = Math.abs(Math.round(n * 100) / 100).toString().split(".");
  const last3 = int.slice(-3);
  const rest = int.slice(0, -3);
  const grouped = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3 : last3;
  return (negative ? "-" : "") + grouped + (frac ? "." + frac : "");
}

const LAKH = 100_000;
const CRORE = 10_000_000;

/**
 * Compact BDT: 85,00,000 -> "৳85 Lakh", 1,25,00,000 -> "৳1.25 Crore".
 * Below one lakh the full grouped number is shown.
 */
export function formatBDT(amount: number, opts: { locale?: Locale; full?: boolean } = {}): string {
  const locale = opts.locale ?? "en";
  if (opts.full || Math.abs(amount) < LAKH) {
    return "৳" + localizeDigits(groupIndian(Math.round(amount)), locale);
  }
  const [value, unitEn, unitBn] =
    Math.abs(amount) >= CRORE ? [amount / CRORE, "Crore", "কোটি"] : [amount / LAKH, "Lakh", "লাখ"];
  const num = stripZeros(value.toFixed(2));
  return `৳${localizeDigits(num, locale)} ${locale === "bn" ? unitBn : unitEn}`;
}

export function formatNumber(n: number, locale: Locale = "en", digits = 2): string {
  return localizeDigits(groupIndian(Number(n.toFixed(digits))), locale);
}

function stripZeros(s: string): string {
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

/** "3 hours ago" style relative time, localized. */
export function timeAgo(ts: number, locale: Locale = "en", now = Date.now()): string {
  const rtf = new Intl.RelativeTimeFormat(locale === "bn" ? "bn-BD" : "en", { numeric: "auto" });
  const diff = (ts - now) / 1000;
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, secs] of steps) {
    if (Math.abs(diff) >= secs) return rtf.format(Math.round(diff / secs), unit);
  }
  return rtf.format(Math.round(diff), "second");
}

/** Mask a phone number for public display: +8801712345678 -> +880171•••••78 */
export function maskPhone(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\s/g, "");
  if (digits.length <= 6) return "•".repeat(digits.length);
  return digits.slice(0, 7) + "•".repeat(Math.max(0, digits.length - 9)) + digits.slice(-2);
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
