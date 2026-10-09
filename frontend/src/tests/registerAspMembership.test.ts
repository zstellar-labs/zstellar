import { beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  getAccount: vi.fn(),
  simulateTransaction: vi.fn(),
  sendTransaction: vi.fn(),
  getTransaction: vi.fn(),
  signTransaction: vi.fn(),
}));

vi.mock("../lib/stellar/client", () => ({
  server: {
    getAccount: sdk.getAccount,
    simulateTransaction: sdk.simulateTransaction,
    sendTransaction: sdk.sendTransaction,
    getTransaction: sdk.getTransaction,
  },
}));
vi.mock("../lib/stellar/config", () => ({
  CONTRACTS: { aspMembership: "test-pool-contract" },
  STELLAR: { networkPassphrase: "Test Network" },
}));
vi.mock("@stellar/freighter-api", () => ({
  signTransaction: sdk.signTransaction,
}));
vi.mock("@stellar/stellar-sdk", async (importOriginal) => {
  const real = await importOriginal<typeof import("@stellar/stellar-sdk")>();
  return {
    ...real,
    Contract: class {
      call() {
        return { type: "insert_leaf" };
      }
    },
    TransactionBuilder: class {
      addOperation() { return this; }
      setTimeout() { return this; }
      build() { return { toXDR: () => "unsigned" }; }
    },
    Transaction: class {},
    rpc: {
      ...real.rpc,
      Api: {
        ...real.rpc.Api,
        isSimulationError: (result: { error?: string }) => Boolean(result.error),
      },
      assembleTransaction: () => ({
        build: () => ({ toXDR: () => "prepared" }),
      }),
    },
  };
});

import { registerAspMembership } from "../lib/stellar/register";

beforeEach(() => {
  vi.resetAllMocks();
  sdk.getAccount.mockResolvedValue({ sequenceNumber: "1" });
  sdk.simulateTransaction.mockResolvedValue({ result: "ok" });
  sdk.signTransaction.mockResolvedValue({ signedTxXdr: "signed" });
  sdk.sendTransaction.mockResolvedValue({ hash: "abc123" });
  sdk.getTransaction.mockResolvedValue({ status: "SUCCESS" });
});

describe("registerAspMembership failure boundaries", () => {
  it("surfaces simulation errors and never asks the wallet to sign", async () => {
    sdk.simulateTransaction.mockResolvedValueOnce({ error: "invalid leaf" });
    await expect(registerAspMembership("GOWNER", "42")).rejects.toThrow(
      "ASP register simulation failed: invalid leaf",
    );
    expect(sdk.signTransaction).not.toHaveBeenCalled();
  });

  it("converts a Freighter rejection to the friendly fallback error", async () => {
    sdk.signTransaction.mockResolvedValueOnce({
      error: { code: "USER_REJECTED" },
    });
    await expect(registerAspMembership("GOWNER", "42")).rejects.toThrow(
      "ASP register rejected",
    );
    expect(sdk.sendTransaction).not.toHaveBeenCalled();
  });

  it("includes the non-success confirmation status in the error", async () => {
    sdk.getTransaction.mockResolvedValueOnce({ status: "FAILED" });
    await expect(registerAspMembership("GOWNER", "42")).rejects.toThrow(
      "ASP register failed (FAILED)",
    );
    expect(sdk.getTransaction).toHaveBeenCalledWith("abc123");
  });
});
