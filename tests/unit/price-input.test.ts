import { describe, expect, it } from "vitest";
import { describeBudget, parseBudget } from "@/lib/price-input";

describe("parseBudget", () => {
  it("reads a plain number as taka", () => {
    expect(parseBudget("2000")).toBe(2000);
    expect(parseBudget("200000")).toBe(200000);
    expect(parseBudget("1")).toBe(1);
  });

  it("ignores grouping commas and spacing", () => {
    expect(parseBudget("1,50,000")).toBe(150000);
    expect(parseBudget("2,000")).toBe(2000);
    expect(parseBudget("  25000  ")).toBe(25000);
  });

  it("understands lakh in the shapes people write it", () => {
    for (const q of ["2 lakh", "2lakh", "2 lakhs", "2 lac", "2lac", "2 lk", "2 লাখ", "2 লক্ষ"]) {
      expect(parseBudget(q), q).toBe(200000);
    }
  });

  it("understands crore in the shapes people write it", () => {
    for (const q of ["3 crore", "3crore", "3 crores", "3 cr", "3cr", "3 কোটি"]) {
      expect(parseBudget(q), q).toBe(30000000);
    }
  });

  it("understands thousands", () => {
    for (const q of ["50 thousand", "50k", "50 হাজার"]) expect(parseBudget(q), q).toBe(50000);
  });

  it("takes decimals", () => {
    expect(parseBudget("2.5 crore")).toBe(25000000);
    expect(parseBudget("1.5 lakh")).toBe(150000);
  });

  it("reads Bangla digits", () => {
    expect(parseBudget("২০০০")).toBe(2000);
    expect(parseBudget("২৫ লাখ")).toBe(2500000);
    expect(parseBudget("৩ কোটি")).toBe(30000000);
  });

  it("drops a leading currency mark", () => {
    expect(parseBudget("৳2000")).toBe(2000);
    expect(parseBudget("tk 5 lakh")).toBe(500000);
  });

  it("refuses what is not a usable amount", () => {
    for (const q of ["", "   ", "abc", "lakh", "-5", "0", "2 bananas", "1e9"]) {
      expect(parseBudget(q), q).toBeNull();
    }
  });
});

describe("describeBudget", () => {
  it("reads an amount back the Bangladeshi way", () => {
    expect(describeBudget(2000)).toBe("৳2 Thousand");
    expect(describeBudget(200000)).toBe("৳2 Lakh");
    expect(describeBudget(25000000)).toBe("৳2.5 Crore");
    expect(describeBudget(500)).toBe("৳500");
  });
});
