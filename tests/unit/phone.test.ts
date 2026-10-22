import { describe, expect, it } from "vitest";
import { normalizeBdPhone } from "@/lib/phone";

describe("normalizeBdPhone", () => {
  it("accepts the shapes people actually type", () => {
    for (const input of ["01712345678", "+8801712345678", "8801712345678", "1712345678", "017 1234 5678", "017-1234-5678"])
      expect(normalizeBdPhone(input)).toBe("+8801712345678");
  });

  it("accepts every live operator prefix", () => {
    for (const p of ["13", "14", "15", "16", "17", "18", "19"])
      expect(normalizeBdPhone(`0${p}12345678`)).toBe(`+880${p}12345678`);
  });

  it("rejects what is not a Bangladeshi mobile number", () => {
    for (const input of ["", "you@example.com", "0171234567", "017123456789", "01212345678", "+919812345678"])
      expect(normalizeBdPhone(input)).toBeNull();
  });

  it("leaves an email address alone so it stays the account identifier", () => {
    expect(normalizeBdPhone("buyer@example.com")).toBeNull();
  });
});
