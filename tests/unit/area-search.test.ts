import { describe, expect, it } from "vitest";
import { searchAreas, type SearchableArea } from "@/lib/area-search";
import { DISTRICTS, districtSlug } from "@/lib/districts";

const areas: SearchableArea[] = DISTRICTS.map((d) => ({
  areaName: d.name,
  areaNameBn: d.nameBn,
  district: d.name,
  division: d.division,
  activeCount: 0,
}));

const top = (q: string) => searchAreas(areas, q)[0]?.areaName;

describe("searchAreas", () => {
  it("finds a district from the first letters typed", () => {
    expect(top("n")).toBeDefined();
    // "nara" is a genuine prefix of two districts; both must be offered.
    const nara = searchAreas(areas, "nara").map((a) => a.areaName);
    expect(nara).toEqual(expect.arrayContaining(["Narail", "Narayanganj"]));
    expect(top("naray")).toBe("Narayanganj");
    expect(top("narayanganj")).toBe("Narayanganj");
  });

  it("narrows as more letters arrive", () => {
    const steps = ["c", "co", "cox", "coxs"].map((q) => searchAreas(areas, q).length);
    expect(steps[0]).toBeGreaterThan(steps[3]);
    expect(top("coxs")).toBe("Cox's Bazar");
  });

  it("handles the apostrophe and spacing in Cox's Bazar", () => {
    for (const q of ["cox's bazar", "coxs bazar", "coxsbazar", "Cox's"]) expect(top(q)).toBe("Cox's Bazar");
  });

  it("matches a later word in the name", () => {
    expect(searchAreas(areas, "bazar").map((a) => a.areaName)).toContain("Cox's Bazar");
  });

  it("searches Bangla names too", () => {
    expect(top("নারায়ণগঞ্জ")).toBe("Narayanganj");
    expect(top("ঢাকা")).toBe("Dhaka");
    expect(top("কক্সবাজার")).toBe("Cox's Bazar");
  });

  it("is case-insensitive", () => {
    expect(top("SYLHET")).toBe("Sylhet");
    expect(top("sYlHeT")).toBe("Sylhet");
  });

  it("returns nothing for a name that is not a district", () => {
    expect(searchAreas(areas, "zzzzz")).toEqual([]);
  });

  it("lists every district and gives each a unique slug", () => {
    expect(DISTRICTS).toHaveLength(64);
    expect(new Set(DISTRICTS.map((d) => districtSlug(d.name))).size).toBe(64);
    for (const d of DISTRICTS) expect(top(d.name)).toBe(d.name);
  });
});
