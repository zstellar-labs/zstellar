import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { getShieldedBalance, ShieldedBalanceError } from "../engine/index";
import { getHandle, initializeWasm } from "../engine/vendor/wasm-facade.js";

const ADDRESS = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

function stubNotes(notes: unknown) {
  vi.mocked(initializeWasm).mockResolvedValue(undefined as never);
  vi.mocked(getHandle).mockReturnValue({
    webClient: { getUserNotes: vi.fn().mockResolvedValue(notes) },
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getShieldedBalance", () => {
  it("returns 0n for a legitimately empty notes array", async () => {
    stubNotes([]);
    await expect(getShieldedBalance(ADDRESS)).resolves.toBe(0n);
  });

  it("sums only unspent notes", async () => {
    stubNotes([
      { amount: 1_500_0000n, spent: false },
      { amount: 2_000_0000n, spent: true },
      { amount: "5000000", spent: false },
    ]);
    await expect(getShieldedBalance(ADDRESS)).resolves.toBe(20_000_000n);
  });

  it("propagates RPC/OPFS failures as ShieldedBalanceError", async () => {
    vi.mocked(initializeWasm).mockResolvedValue(undefined as never);
    vi.mocked(getHandle).mockReturnValue({
      webClient: {
        getUserNotes: vi.fn().mockRejectedValue(new Error("rpc down")),
      },
    } as never);
    const call = getShieldedBalance(ADDRESS);
    await expect(call).rejects.toBeInstanceOf(ShieldedBalanceError);
    await expect(call).rejects.toThrow("rpc down");
  });

  it("rejects malformed notes responses", async () => {
    stubNotes({ not: "an array" });
    await expect(getShieldedBalance(ADDRESS)).rejects.toBeInstanceOf(
      ShieldedBalanceError,
    );
  });
});
