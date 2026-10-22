import { describe, expect, it } from "vitest";
import { phoneticFold, searchAreas, type SearchableArea } from "@/lib/area-search";
import { DISTRICTS, aliasesFor, districtSlug } from "@/lib/districts";

const areas: SearchableArea[] = DISTRICTS.map((d) => ({
  areaName: d.name,
  areaNameBn: d.nameBn,
  district: d.name,
  division: d.division,
  activeCount: 0,
  aliases: aliasesFor(d.name),
}));

const top = (q: string) => searchAreas(areas, q)[0]?.areaName;
const names = (q: string) => searchAreas(areas, q).map((a) => a.areaName);

describe("the district list", () => {
  it("has all 64, each with a unique name, slug and Bangla name", () => {
    expect(DISTRICTS).toHaveLength(64);
    expect(new Set(DISTRICTS.map((d) => d.name)).size).toBe(64);
    expect(new Set(DISTRICTS.map((d) => districtSlug(d.name))).size).toBe(64);
    for (const d of DISTRICTS) expect(d.nameBn).toMatch(/[ঀ-৿]/);
  });

  it("puts every district inside Bangladesh", () => {
    for (const d of DISTRICTS) {
      expect(d.lat).toBeGreaterThan(20.5);
      expect(d.lat).toBeLessThan(26.7);
      expect(d.lng).toBeGreaterThan(88);
      expect(d.lng).toBeLessThan(92.7);
    }
  });
});

describe("typing in English", () => {
  it("finds a district from its first letters", () => {
    const nara = names("nara");
    expect(nara).toEqual(expect.arrayContaining(["Narail", "Narayanganj"]));
    expect(top("naray")).toBe("Narayanganj");
    expect(top("sylhe")).toBe("Sylhet");
    expect(top("rangp")).toBe("Rangpur");
  });

  it("narrows as more letters arrive", () => {
    const counts = ["c", "co", "cox", "coxs"].map((q) => searchAreas(areas, q, 64).length);
    expect(counts[0]).toBeGreaterThan(counts[3]);
    expect(top("coxs")).toBe("Cox's Bazar");
  });

  it("ignores case, apostrophes and spacing", () => {
    for (const q of ["SYLHET", "sYlHeT"]) expect(top(q)).toBe("Sylhet");
    for (const q of ["cox's bazar", "coxs bazar", "coxsbazar", "Cox Bazar", "coxbazar"]) expect(top(q)).toBe("Cox's Bazar");
  });

  it("matches a later word in the name", () => {
    expect(names("bazar")).toContain("Cox's Bazar");
  });

  it("reaches every district by its full name", () => {
    for (const d of DISTRICTS) expect(top(d.name)).toBe(d.name);
  });

  it("reaches every district by its first four letters", () => {
    for (const d of DISTRICTS) {
      const q = d.name.replace(/['’\s]/g, "").slice(0, 4);
      expect(names(q), `"${q}" should offer ${d.name}`).toContain(d.name);
    }
  });
});

describe("typing in Bangla", () => {
  it("finds a district from its full Bangla name", () => {
    expect(top("নারায়ণগঞ্জ")).toBe("Narayanganj");
    expect(top("ঢাকা")).toBe("Dhaka");
    expect(top("কক্সবাজার")).toBe("Cox's Bazar");
  });

  it("finds a district from the first Bangla letters", () => {
    expect(top("নারা")).toBe("Narayanganj");
    expect(top("সিল")).toBe("Sylhet");
    expect(top("কুমি")).toBe("Cumilla");
    expect(top("চট্ট")).toBe("Chattogram");
  });

  it("reaches every district by its full Bangla name", () => {
    for (const d of DISTRICTS) expect(top(d.nameBn), `${d.nameBn} should find ${d.name}`).toBe(d.name);
  });
});

describe("older and local spellings", () => {
  it("accepts the names people still type", () => {
    const pairs: [string, string][] = [
      ["Chittagong", "Chattogram"],
      ["Comilla", "Cumilla"],
      ["Bogra", "Bogura"],
      ["Jessore", "Jashore"],
      ["Barisal", "Barishal"],
      ["Khagrachari", "Khagrachhari"],
      ["Laxmipur", "Lakshmipur"],
      ["Netrakona", "Netrokona"],
      ["Maulvibazar", "Moulvibazar"],
      ["Nawabganj", "Chapainawabganj"],
      ["Bikrampur", "Munshiganj"],
    ];
    for (const [typed, expected] of pairs) expect(top(typed), `"${typed}" should find ${expected}`).toBe(expected);
  });

  it("accepts a partial older spelling", () => {
    expect(names("chitta")).toContain("Chattogram");
    expect(names("jesso")).toContain("Jashore");
  });
});

describe("phonetic spelling", () => {
  it("treats the usual romanisation choices as the same", () => {
    expect(phoneticFold("narayanganj")).toBe(phoneticFold("narayangonj"));
    expect(phoneticFold("gazipur")).toBe(phoneticFold("gajipur"));
    expect(phoneticFold("moulvibazar")).toBe(phoneticFold("moulvibazar"));
  });

  it("finds a district however the vowels are spelled", () => {
    const pairs: [string, string][] = [
      ["narayangonj", "Narayanganj"],
      ["gopalgonj", "Gopalganj"],
      ["sirajgonj", "Sirajganj"],
      ["habigonj", "Habiganj"],
      ["sunamgonj", "Sunamganj"],
      ["gajipur", "Gazipur"],
      ["tangayl", "Tangail"],
    ];
    for (const [typed, expected] of pairs) expect(top(typed), `"${typed}" should find ${expected}`).toBe(expected);
  });
});

describe("no match", () => {
  it("returns nothing for a name that is not a place here", () => {
    for (const q of ["zzzzz", "qqqq", "london"]) expect(searchAreas(areas, q)).toEqual([]);
  });
});
