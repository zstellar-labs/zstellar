import { describe, expect, it } from "vitest";
import { xlmToStroops } from "../engine/index";

describe("xlmToStroops exact fractional precision", () => {
  it("rejects more than seven fractional digits instead of moving a different amount", () => {
    expect(() => xlmToStroops("1.12345678")).toThrow("Enter a valid amount");
    expect(() => xlmToStroops("0.00000001")).toThrow("Enter a valid amount");
  });

  it("accepts exactly seven fractional digits without truncation", () => {
    expect(xlmToStroops("1.1234567")).toBe(11234567n);
  });

  it("pads shorter fractional amounts exactly", () => {
    expect(xlmToStroops("1.23")).toBe(12300000n);
  });
});
