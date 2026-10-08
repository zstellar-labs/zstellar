"use client";

import {
  getAddress,
  getNetwork,
  isConnected,
  requestAccess,
} from "@stellar/freighter-api";
import { useCallback, useEffect, useState } from "react";
import { fundWithFriendbot, getXlmBalance } from "@/lib/stellar/client";

export type WalletState = {
  address: string | null;
  network: string | null;
  balance: string | null;
  connecting: boolean;
  error: string | null;
};

const INITIAL: WalletState = {
  address: null,
  network: null,
  balance: null,
  connecting: false,
  error: null,
};

// Freighter v6 returns errors as objects ({ message, code }), not strings, so
// passing one straight into new Error() yields "[object Object]". Normalize any
// unknown error (Error, string, or { message }) to a readable string.
function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

export function useWallet() {
  const [state, setState] = useState<WalletState>(INITIAL);

  const load = useCallback(async (address: string, network: string) => {
    const balance = await getXlmBalance(address);
    setState({ address, network, balance, connecting: false, error: null });
  }, []);

  useEffect(() => {
    (async () => {
      const conn = await isConnected();
      if (conn.error || !conn.isConnected) return;
      const addr = await getAddress();
      if (addr.error || !addr.address) return;
      const net = await getNetwork();
      if (net.error) return;
      if (net.network !== "TESTNET") {
        setState((s) => ({
          ...s,
          error: "Switch Freighter to the Testnet network.",
        }));
        return;
      }
      await load(addr.address, net.network);
    })();
  }, [load]);

  const connect = useCallback(async () => {
    setState((s) => ({ ...s, connecting: true, error: null }));
    try {
      const conn = await isConnected();
      if (conn.error || !conn.isConnected) {
        throw new Error("Freighter wallet not found. Install the extension.");
      }
      const access = await requestAccess();
      if (access.error || !access.address) {
        throw new Error(
          errorMessage(access.error, "Wallet connection was rejected."),
        );
      }
      const net = await getNetwork();
      if (net.error) {
        throw new Error(errorMessage(net.error, "Could not read the network."));
      }
      if (net.network !== "TESTNET") {
        throw new Error("Switch Freighter to the Testnet network.");
      }
      await load(access.address, net.network);
    } catch (error) {
      setState((s) => ({
        ...s,
        connecting: false,
        error: errorMessage(error, "Connection failed"),
      }));
    }
  }, [load]);

  const disconnect = useCallback(() => setState(INITIAL), []);

  const fund = useCallback(async (): Promise<boolean> => {
    if (!state.address) return false;
    setState((s) => ({ ...s, error: null }));
    const ok = await fundWithFriendbot(state.address);
    if (ok) {
      await load(state.address, state.network ?? "TESTNET");
    } else {
      setState((s) => ({
        ...s,
        error: "Friendbot funding failed (account may already be funded).",
      }));
    }
    return ok;
  }, [state.address, state.network, load]);

  const refresh = useCallback(async () => {
    if (state.address) await load(state.address, state.network ?? "TESTNET");
  }, [state.address, state.network, load]);

  return { ...state, connect, disconnect, fund, refresh };
}
