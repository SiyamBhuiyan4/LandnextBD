import { describe, expect, it } from "vitest";
import { allUnits, convert, fromSqft, pricePerUnit, toSqft } from "@/lib/units";

describe("land unit conversion", () => {
  it("uses the Bangladeshi standard factors", () => {
    expect(toSqft(1, "katha")).toBe(720);
    expect(toSqft(1, "decimal")).toBe(435.6);
    expect(toSqft(1, "shotangsho")).toBe(435.6);
    expect(toSqft(1, "bigha")).toBe(14400);
    expect(toSqft(1, "acre")).toBe(43560);
    expect(toSqft(250, "sqft")).toBe(250);
  });

  it("round-trips through sqft", () => {
    expect(fromSqft(toSqft(5, "katha"), "katha")).toBe(5);
    expect(fromSqft(toSqft(33, "decimal"), "decimal")).toBe(33);
  });

  it("converts between units", () => {
    expect(convert(1, "bigha", "katha")).toBe(20);
    expect(convert(1, "acre", "decimal")).toBe(100);
    expect(convert(1, "katha", "decimal")).toBeCloseTo(1.6529, 4);
  });

  it("computes price per unit", () => {
    // 5 katha for 65 lakh -> 13 lakh per katha
    expect(pricePerUnit(6_500_000, toSqft(5, "katha"), "katha")).toBe(1_300_000);
    expect(pricePerUnit(1, 0, "katha")).toBe(0);
  });

  it("lists all display units", () => {
    const u = Object.fromEntries(allUnits(14400).map((x) => [x.unit, x.value]));
    expect(u).toMatchObject({ katha: 20, bigha: 1, sqft: 14400 });
  });

  it("rejects invalid sizes", () => {
    expect(() => toSqft(-1, "katha")).toThrow();
    expect(() => toSqft(Number.NaN, "katha")).toThrow();
  });
});
