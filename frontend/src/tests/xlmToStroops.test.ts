import { describe, expect, it, vi } from "vitest";

// engine/index.ts pulls in the browser Freighter/WASM chain at module scope;
// stub every import so the pure helpers evaluate cleanly under the Node runner.
vi.mock("@/lib/stellar/config", () => ({
  CONTRACTS: { pool: "POOL", token: "TOKEN", asp: "ASP" },
  STELLAR: { rpcUrl: "https://rpc.invalid", networkPassphrase: "testnet" },
  browserRpcUrl: () => "https://rpc.invalid",
}));
vi.mock("@/lib/stellar/register", () => ({ registerAspMembership: vi.fn() }));
vi.mock("../engine/vendor/stellar.js", () => ({
  submitPreparedSorobanTx: vi.fn(),
}));
vi.mock("../engine/vendor/wallet.js", () => ({ deriveKeysFromWallet: vi.fn() }));
vi.mock("../engine/vendor/wasm-facade.js", () => ({
  getHandle: vi.fn(),
  initializeWasm: vi.fn(),
}));

import { xlmToStroops } from "../engine/index";

describe("xlmToStroops", () => {
  it("converts whole amounts", () => {
    expect(xlmToStroops("10")).toBe(100_000_000n);
  });

  it("converts fractional amounts", () => {
    expect(xlmToStroops("1.5")).toBe(15_000_000n);
    expect(xlmToStroops("0.0000001")).toBe(1n);
  });

  it("trims surrounding whitespace", () => {
    expect(xlmToStroops("  2  ")).toBe(20_000_000n);
  });

  it("accepts a trailing decimal point", () => {
    expect(xlmToStroops("5.")).toBe(50_000_000n);
  });

  it.each(["1e3", "1E3", "1.2.3", "abc", "", "   ", "-5", ".5", "0x10"])(
    "rejects invalid input %j with a friendly error",
    (input) => {
      expect(() => xlmToStroops(input)).toThrow("Enter a valid amount");
    },
  );

  it("rejects zero", () => {
    expect(() => xlmToStroops("0")).toThrow("Amount must be greater than zero");
  });
});
