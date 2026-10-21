// Land unit conversion. Everything is stored in square feet (sizeSqft) and
// converted for display. Values follow the common Dhaka/BD convention:
//   1 katha = 720 sqft, 1 decimal (shotangsho) = 435.6 sqft (1/100 acre),
//   1 bigha = 20 katha = 14,400 sqft, 1 acre = 43,560 sqft.
// Bigha varies by region in practice; 20 katha is the national standard.

export const SIZE_UNITS = ["katha", "decimal", "shotangsho", "bigha", "acre", "sqft"] as const;
export type SizeUnit = (typeof SIZE_UNITS)[number];

export const SQFT_PER_UNIT: Record<SizeUnit, number> = {
  katha: 720,
  decimal: 435.6,
  shotangsho: 435.6,
  bigha: 14400,
  acre: 43560,
  sqft: 1,
};

export function isSizeUnit(u: string): u is SizeUnit {
  return (SIZE_UNITS as readonly string[]).includes(u);
}

export function toSqft(value: number, unit: SizeUnit): number {
  if (!Number.isFinite(value) || value < 0) throw new Error("Size must be a non-negative number");
  return round(value * SQFT_PER_UNIT[unit], 2);
}

export function fromSqft(sqft: number, unit: SizeUnit): number {
  return round(sqft / SQFT_PER_UNIT[unit], 4);
}

export function convert(value: number, from: SizeUnit, to: SizeUnit): number {
  return fromSqft(value * SQFT_PER_UNIT[from], to);
}

/** Price per unit (e.g. per katha) from a total price and size in sqft. */
export function pricePerUnit(price: number, sizeSqft: number, unit: SizeUnit): number {
  if (sizeSqft <= 0) return 0;
  return Math.round((price / sizeSqft) * SQFT_PER_UNIT[unit]);
}

/** Size shown in all common units, trimmed to sensible precision. */
export function allUnits(sizeSqft: number): { unit: SizeUnit; value: number }[] {
  return (["katha", "decimal", "bigha", "acre", "sqft"] as SizeUnit[]).map((unit) => ({
    unit,
    value: trimNumber(fromSqft(sizeSqft, unit), unit === "sqft" ? 0 : 2),
  }));
}

export function trimNumber(n: number, digits = 2): number {
  return Number(n.toFixed(digits));
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
