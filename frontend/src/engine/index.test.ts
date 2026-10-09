import { describe, expect, it } from "vitest";
import { stroopsToXlm, xlmToStroops } from "./index";

describe("XLM ↔ stroops conversion", () => {
  it("round-trips the full seven-decimal precision without floating point", () => {
    const amount = "1.2345678";
    const stroops = xlmToStroops(amount);
    expect(stroops).toBe(12345678n);
    expect(stroopsToXlm(stroops)).toBe(amount);
  });

  it("pads whole-number input without changing its value", () => {
    expect(xlmToStroops("2")).toBe(20000000n);
    expect(stroopsToXlm(20000000n)).toBe("2.0000000");
  });

  it("rejects a zero payment while formatting zero stroops exactly", () => {
    expect(() => xlmToStroops("0")).toThrow("Amount must be greater than zero");
    expect(stroopsToXlm(0n)).toBe("0.0000000");
  });

  it("formats negative stroops with the sign outside the decimal value", () => {
    expect(stroopsToXlm(-12345678n)).toBe("-1.2345678");
    expect(stroopsToXlm(-1n)).toBe("-0.0000001");
  });

  it("pads shorter fractional values to exactly seven places", () => {
    expect(xlmToStroops("0.5")).toBe(5000000n);
    expect(xlmToStroops("0.0000001")).toBe(1n);
    expect(stroopsToXlm(5000000n)).toBe("0.5000000");
    expect(stroopsToXlm(1n)).toBe("0.0000001");
  });
});
