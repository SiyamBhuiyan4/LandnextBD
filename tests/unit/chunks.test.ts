import { describe, expect, it } from "vitest";
import { chunkBounds, mapRangeToPart, parseRange } from "@/lib/chunks";

describe("chunkBounds", () => {
  it("splits into full slices plus a remainder", () => {
    expect(chunkBounds(25, 10)).toEqual([
      { start: 0, end: 10 },
      { start: 10, end: 20 },
      { start: 20, end: 25 },
    ]);
    expect(chunkBounds(20, 10)).toHaveLength(2);
    expect(chunkBounds(0, 10)).toEqual([]);
  });
});

describe("parseRange", () => {
  it("parses open, closed and suffix ranges", () => {
    expect(parseRange("bytes=0-", 100)).toEqual({ start: 0, end: 99 });
    expect(parseRange("bytes=10-19", 100)).toEqual({ start: 10, end: 19 });
    expect(parseRange("bytes=90-500", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=-500", 100)).toEqual({ start: 0, end: 99 });
    expect(parseRange("bytes=5-9, 20-30", 100)).toEqual({ start: 5, end: 9 });
  });
  it("ignores missing or malformed headers and flags out-of-range ones", () => {
    expect(parseRange(null, 100)).toBeNull();
    expect(parseRange("items=0-5", 100)).toBeNull();
    expect(parseRange("bytes=9-3", 100)).toBeNull();
    expect(parseRange("bytes=100-", 100)).toBe("unsatisfiable");
    expect(parseRange("bytes=-0", 100)).toBe("unsatisfiable");
  });
});

describe("mapRangeToPart", () => {
  const sizes = [10, 10, 5]; // total 25

  it("serves the rest of the first part for an open range", () => {
    expect(mapRangeToPart(sizes, 0, 24)).toEqual({ index: 0, partStart: 0, partEnd: 9, start: 0, end: 9, total: 25 });
  });
  it("never crosses a part boundary", () => {
    expect(mapRangeToPart(sizes, 8, 15)).toEqual({ index: 0, partStart: 8, partEnd: 9, start: 8, end: 9, total: 25 });
    expect(mapRangeToPart(sizes, 10, 24)).toEqual({ index: 1, partStart: 0, partEnd: 9, start: 10, end: 19, total: 25 });
  });
  it("handles ranges inside a part and the last part", () => {
    expect(mapRangeToPart(sizes, 12, 13)).toEqual({ index: 1, partStart: 2, partEnd: 3, start: 12, end: 13, total: 25 });
    expect(mapRangeToPart(sizes, 20, 99)).toEqual({ index: 2, partStart: 0, partEnd: 4, start: 20, end: 24, total: 25 });
    expect(mapRangeToPart(sizes, 24, 24)).toEqual({ index: 2, partStart: 4, partEnd: 4, start: 24, end: 24, total: 25 });
  });
  it("rejects ranges outside the file", () => {
    expect(mapRangeToPart(sizes, 25, 30)).toBeNull();
    expect(mapRangeToPart(sizes, -1, 3)).toBeNull();
    expect(mapRangeToPart(sizes, 5, 4)).toBeNull();
  });
  it("walking the file range by range returns every byte exactly once", () => {
    const real = [19, 19, 7];
    const total = 45;
    let pos = 0;
    const seen: number[] = [];
    while (pos < total) {
      const s = mapRangeToPart(real, pos, total - 1)!;
      for (let b = s.start; b <= s.end; b++) seen.push(b);
      pos = s.end + 1;
    }
    expect(seen).toEqual(Array.from({ length: total }, (_, i) => i));
  });
});
