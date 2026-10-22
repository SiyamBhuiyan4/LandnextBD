// Prefix search over the area list. The whole list (64 districts plus the
// finer areas) is small enough to hold in the browser, so matching runs on
// every keystroke with no round trip — typing "nara" lands on Narayanganj.
//
// Bengali place names have no single English spelling, so a typed name is
// matched three ways: the name as written, a list of older official spellings
// (Comilla, Jessore, Chittagong …), and a phonetic fold that treats the usual
// romanisation choices as equal, so "narayangonj" finds Narayanganj.

export type SearchableArea = {
  areaName: string;
  areaNameBn?: string;
  district: string;
  division: string;
  activeCount: number;
  aliases?: string[];
};

const BANGLA = /[ঀ-৿]/;

/** Strip case, punctuation and spacing so "Cox's Bazar" matches "coxs bazar". */
function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/['’.\-_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Collapse the romanisation choices Bengali speakers vary on, so spellings of
 * the same name land on one key: Narayanganj/Narayangonj, Jashore/Jessore,
 * Moulvibazar/Maulvibazar, Kurigram/Kurigrm.
 */
export function phoneticFold(s: string) {
  return (
    norm(s)
      .replace(/ /g, "")
      // digraphs first, longest match wins
      .replace(/chh/g, "c")
      .replace(/ch/g, "c")
      .replace(/sh/g, "s")
      .replace(/ph/g, "f")
      .replace(/kh/g, "k")
      .replace(/gh/g, "g")
      .replace(/th/g, "t")
      .replace(/dh/g, "d")
      .replace(/bh/g, "b")
      .replace(/jh/g, "j")
      // letters Bengali romanisation swaps freely
      .replace(/z/g, "j")
      .replace(/[vw]/g, "b")
      .replace(/x/g, "ks")
      .replace(/q/g, "k")
      .replace(/y/g, "i")
      // every vowel is the same vowel: ganj == gonj == gunj
      .replace(/[aeiou]+/g, "a")
      // doubled consonants carry no meaning here
      .replace(/(.)\1+/g, "$1")
  );
}

/** Every string a candidate can be found by, in English. */
function keysOf(a: SearchableArea): string[] {
  return [a.areaName, ...(a.aliases ?? [])];
}

/** Where a candidate ranks for `query`; lower is better, null means no match. */
export function rankArea(a: SearchableArea, query: string): number | null {
  const raw = query.trim();
  if (!raw) return 0;

  // Bangla script: match the Bangla name only, by prefix then anywhere.
  if (BANGLA.test(raw)) {
    const bn = a.areaNameBn?.trim() ?? "";
    if (!bn) return null;
    if (bn.startsWith(raw)) return 0;
    if (bn.includes(raw)) return 3;
    return null;
  }

  const q = norm(raw);
  const keys = keysOf(a).map(norm);
  const district = norm(a.district);
  const division = norm(a.division);

  if (keys.some((k) => k.startsWith(q))) return 0;
  // A later word in the name: "bazar" should still find "Cox's Bazar".
  if (keys.some((k) => k.split(" ").some((w) => w.startsWith(q)))) return 1;
  if (keys.some((k) => k.replace(/ /g, "").startsWith(q))) return 2;

  // Nothing matched as written, so try the phonetic key. Folding collapses
  // repeats, so a short or repetitive query ("zzzzz" -> "j") would match far
  // too much; anything that short is already covered by the prefix checks.
  const qf = phoneticFold(raw);
  if (qf.length >= 3) {
    const folded = keysOf(a).map(phoneticFold);
    if (folded.some((k) => k.startsWith(qf))) return 3;
    if (folded.some((k) => k.includes(qf))) return 6;
  }

  if (district.startsWith(q)) return 4;
  if (division.startsWith(q)) return 5;
  if (keys.some((k) => k.includes(q))) return 7;
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
