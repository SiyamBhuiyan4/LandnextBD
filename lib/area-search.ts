// Prefix search over the area list. The whole list (64 districts plus the
// finer areas) is small enough to hold in the browser, so matching runs on
// every keystroke with no round trip — typing "nara" lands on Narayanganj.

export type SearchableArea = {
  areaName: string;
  areaNameBn?: string;
  district: string;
  division: string;
  activeCount: number;
};

/** Strip case, punctuation and spacing so "Cox's Bazar" matches "coxs bazar" and "coxsbazar". */
function norm(s: string) {
  return s.toLowerCase().replace(/['’.-]/g, "").replace(/\s+/g, " ").trim();
}

/** Where a candidate ranks for `query`; lower is better, null means no match. */
export function rankArea(a: SearchableArea, query: string): number | null {
  const q = norm(query);
  if (!q) return 0;

  const name = norm(a.areaName);
  const bn = a.areaNameBn?.trim() ?? "";
  const district = norm(a.district);
  const division = norm(a.division);

  if (name.startsWith(q)) return 0;
  if (bn.startsWith(query.trim())) return 1;
  // A later word in the name: "bazar" should still find "Cox's Bazar".
  if (name.split(" ").some((w) => w.startsWith(q))) return 2;
  if (bn.includes(query.trim())) return 3;
  if (district.startsWith(q)) return 4;
  if (division.startsWith(q)) return 5;
  if (name.replace(/ /g, "").startsWith(q)) return 6;
  if (name.includes(q)) return 7;
  if (district.includes(q)) return 8;
  return null;
}

/** Best matches for `query`, strongest match first, then the busiest area. */
export function searchAreas<T extends SearchableArea>(areas: readonly T[], query: string, limit = 8): T[] {
  const scored: { a: T; rank: number }[] = [];
  for (const a of areas) {
    const rank = rankArea(a, query);
    if (rank !== null) scored.push({ a, rank });
  }
  scored.sort((x, y) => x.rank - y.rank || y.a.activeCount - x.a.activeCount || x.a.areaName.localeCompare(y.a.areaName));
  return scored.slice(0, limit).map((s) => s.a);
}
