// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@stellar/freighter-api", () => ({
  getAddress: vi.fn(async () => ({ error: { message: "locked" } })),
  getNetwork: vi.fn(async () => ({ network: "TESTNET" })),
  isConnected: vi.fn(async () => ({ isConnected: true })),
  requestAccess: vi.fn(async () => ({ address: "GABC" })),
}));

vi.mock("@/lib/stellar/client", () => ({
  getXlmBalance: vi.fn(async () => "10"),
  fundWithFriendbot: vi.fn(async () => true),
}));

import { getAddress, getNetwork, requestAccess } from "@stellar/freighter-api";

import { errorMessage, useWallet } from "../features/wallet/useWallet";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let container: HTMLDivElement | undefined;

afterEach(() => {
  container?.remove();
  container = undefined;
  vi.clearAllMocks();
});

describe("errorMessage", () => {
  it("unwraps an Error", () => {
    expect(errorMessage(new Error("boom"), "fallback")).toBe("boom");
  });

  it("passes a string through", () => {
    expect(errorMessage("plain failure", "fallback")).toBe("plain failure");
  });

  it("unwraps a { message } object (Freighter v6 shape)", () => {
    expect(errorMessage({ message: "obj error", code: -1 }, "fallback")).toBe(
      "obj error",
    );
  });

  it("falls back for unknown shapes", () => {
    expect(errorMessage(42, "fallback")).toBe("fallback");
    expect(errorMessage({ message: 5 }, "fallback")).toBe("fallback");
    expect(errorMessage(null, "fallback")).toBe("fallback");
  });
});

describe("useWallet connect gating", () => {
  it("surfaces the Testnet error and clears connecting on a non-TESTNET network", async () => {
    vi.mocked(getNetwork).mockResolvedValue({ network: "PUBLIC" } as never);

    let captured: ReturnType<typeof useWallet> | undefined;
    function Probe() {
      captured = useWallet();
      return null;
    }

    container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<Probe />);
    });
    // Mount effect early-returns on the getAddress error — no auto-connect.
    expect(getAddress).toHaveBeenCalled();
    expect(captured?.connecting).toBe(false);

    await act(async () => {
      await captured!.connect();
    });

    expect(requestAccess).toHaveBeenCalled();
    expect(captured?.error).toBe("Switch Freighter to the Testnet network.");
    expect(captured?.connecting).toBe(false);

    await act(async () => {
      root.unmount();
    });
  });
});
