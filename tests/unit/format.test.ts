import { describe, expect, it } from "vitest";
import { formatBDT, groupIndian, maskPhone, slugify, toBnDigits } from "@/lib/format";
import { normalizeBdPhone } from "@/lib/phone";
import { hmacHex, safeEqual } from "@/lib/signature";
import { filtersFromSearchParams, filtersToSearchParams, listingHref, slugToLandType } from "@/lib/urls";

describe("BDT formatting", () => {
  it("groups digits the South-Asian way", () => {
    expect(groupIndian(1234567)).toBe("12,34,567");
    expect(groupIndian(999)).toBe("999");
    expect(groupIndian(100000)).toBe("1,00,000");
    expect(groupIndian(-12345678)).toBe("-1,23,45,678");
  });

  it("uses Lakh / Crore", () => {
    expect(formatBDT(8_500_000)).toBe("৳85 Lakh");
    expect(formatBDT(12_500_000)).toBe("৳1.25 Crore");
    expect(formatBDT(10_000_000)).toBe("৳1 Crore");
    expect(formatBDT(2_550_000)).toBe("৳25.5 Lakh");
    expect(formatBDT(95_000)).toBe("৳95,000");
  });

  it("can show full numbers", () => {
    expect(formatBDT(12_500_000, { full: true })).toBe("৳1,25,00,000");
  });

  it("localizes to Bangla", () => {
    expect(formatBDT(8_500_000, { locale: "bn" })).toBe("৳৮৫ লাখ");
    expect(formatBDT(12_500_000, { locale: "bn" })).toBe("৳১.২৫ কোটি");
    expect(toBnDigits("2026")).toBe("২০২৬");
  });
});

describe("phones and slugs", () => {
  it("normalizes Bangladeshi mobiles", () => {
    expect(normalizeBdPhone("01712345678")).toBe("+8801712345678");
    expect(normalizeBdPhone("+880 1712-345678")).toBe("+8801712345678");
    expect(normalizeBdPhone("8801912345678")).toBe("+8801912345678");
    expect(normalizeBdPhone("01212345678")).toBeNull();
    expect(normalizeBdPhone("12345")).toBeNull();
  });

  it("masks phones for public display", () => {
    expect(maskPhone("+8801712345678")).toBe("+880171•••••78");
    expect(maskPhone(undefined)).toBeNull();
  });

  it("slugifies titles", () => {
    expect(slugify("5 Katha South-facing Plot, Sector 3!")).toBe("5-katha-south-facing-plot-sector-3");
  });
});

describe("URL filters", () => {
  it("round-trips filters through the query string", () => {
    const sp = filtersToSearchParams({ area: "purbachal", landType: "mixed_use", minPrice: 5_000_000, verifiedOnly: true, utilities: ["gas", "water"] });
    expect(sp.toString()).toBe("area=purbachal&landType=mixed_use&minPrice=5000000&verifiedOnly=1&utilities=gas%2Cwater");
    expect(filtersFromSearchParams(sp)).toEqual({ area: "purbachal", landType: "mixed_use", minPrice: 5_000_000, verifiedOnly: true, utilities: ["gas", "water"] });
  });

  it("drops invalid values", () => {
    const f = filtersFromSearchParams(new URLSearchParams("landType=castle&minPrice=-5&utilities=gas,lava&sort=random"));
    expect(f).toEqual({ utilities: ["gas"] });
  });

  it("parses posted-by, posted-within and the oldest sort", () => {
    expect(filtersFromSearchParams(new URLSearchParams("sellerType=broker&postedWithinDays=7&sort=oldest"))).toEqual({ sellerType: "broker", postedWithinDays: 7, sort: "oldest" });
    expect(filtersFromSearchParams(new URLSearchParams("sellerType=alien&postedWithinDays=3"))).toEqual({});
  });

  it("builds clean listing URLs", () => {
    expect(listingHref({ areaSlug: "purbachal", landType: "mixed_use", slug: "abc" })).toBe("/land/purbachal/mixed-use/abc");
    expect(slugToLandType("mixed-use")).toBe("mixed_use");
    expect(slugToLandType("nope")).toBeNull();
  });
});

describe("signed URLs", () => {
  it("produces stable HMACs and compares in constant time", async () => {
    const a = await hmacHex("secret", "id:123");
    expect(a).toHaveLength(64);
    expect(await hmacHex("secret", "id:123")).toBe(a);
    expect(safeEqual(a, a)).toBe(true);
    expect(safeEqual(a, await hmacHex("other", "id:123"))).toBe(false);
  });
});
