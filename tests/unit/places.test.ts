import { describe, expect, it } from "vitest";
import { areaLabel, districtName, divisionName } from "@/lib/places";

describe("place names", () => {
  it("localizes districts and divisions to Bangla, falling back to English", () => {
    expect(districtName("Narayanganj", "bn")).toBe("নারায়ণগঞ্জ");
    expect(districtName("Narayanganj", "en")).toBe("Narayanganj");
    expect(districtName("Atlantis", "bn")).toBe("Atlantis");
    expect(divisionName("Chattogram", "bn")).toBe("চট্টগ্রাম");
    expect(areaLabel({ areaName: "Uttara", areaNameBn: "উত্তরা" }, "bn")).toBe("উত্তরা");
    expect(areaLabel({ areaName: "Uttara" }, "bn")).toBe("Uttara");
  });
});
