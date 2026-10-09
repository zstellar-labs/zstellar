import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock at the boundary actually used by client.ts. No network or Stellar SDK is
// loaded by these tests; Horizon and Friendbot responses remain independent.
const { loadAccount } = vi.hoisted(() => ({ loadAccount: vi.fn() }));

vi.mock("../lib/stellar/config", () => ({
  browserRpcUrl: () => "https://rpc.test.invalid",
  STELLAR: { horizonUrl: "https://horizon.test.invalid" },
}));

vi.mock("@stellar/stellar-sdk", () => ({
  rpc: { Server: class Server {} },
  Horizon: {
    Server: class Server {
      loadAccount = loadAccount;
    },
    NotFoundError: class NotFoundError extends Error {},
  },
}));

import {
  XlmBalanceUnavailableError,
  fundWithFriendbot,
  getXlmBalance,
} from "../lib/stellar/client";

const fetchMock = vi.fn();

beforeEach(() => {
  loadAccount.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("Stellar account balance and Friendbot boundary (#12)", () => {
  it("selects the native XLM balance, ignoring other assets", async () => {
    loadAccount.mockResolvedValueOnce({
      balances: [
        { asset_type: "credit_alphanum4", balance: "9999" },
        { asset_type: "native", balance: "12.3456789" },
      ],
    });
    expect(await getXlmBalance("GACCOUNT")).toBe("12.3456789");
    expect(loadAccount).toHaveBeenCalledWith("GACCOUNT");

    loadAccount.mockResolvedValueOnce({
      balances: [{ asset_type: "credit_alphanum4", balance: "17" }],
    });
    expect(await getXlmBalance("GNOXLM")).toBe("0");
  });

  it("treats a Horizon 404 as an unfunded account rather than a transport failure", async () => {
    loadAccount.mockRejectedValueOnce({ response: { status: 404 } });
    expect(await getXlmBalance("GNEW")).toBe("0");
  });

  it("does not misreport a Horizon outage as an empty XLM balance", async () => {
    loadAccount.mockRejectedValueOnce(new Error("upstream timeout"));
    await expect(getXlmBalance("GFUNDED")).rejects.toBeInstanceOf(
      XlmBalanceUnavailableError,
    );
  });

  it("returns Friendbot's actual success/failure and handles transport errors", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true });
    expect(await fundWithFriendbot("G XLM")).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://friendbot.stellar.org?addr=G%20XLM",
    );

    fetchMock.mockResolvedValueOnce({ ok: false, status: 429 });
    expect(await fundWithFriendbot("GACCOUNT")).toBe(false);

    fetchMock.mockRejectedValueOnce(new Error("network down"));
    expect(await fundWithFriendbot("GACCOUNT")).toBe(false);
  });
});
