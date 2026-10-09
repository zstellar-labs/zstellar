/**
 * Shielded recipients consist of exactly one note key and one encryption key.
 * Extra delimiters must not be silently discarded by Array destructuring.
 */
export function parseShieldedRecipient(recipient: string): {
  noteKey: string;
  encKey: string;
} {
  const parts = recipient.split(":");
  const noteKey = parts[0]?.trim() ?? "";
  const encKey = parts[1]?.trim() ?? "";
  if (parts.length !== 2 || !noteKey || !encKey) {
    throw new Error(
      "Enter the recipient's shielded address (copy it from their Receive button).",
    );
  }
  return { noteKey, encKey };
}

/** Deposits are always wallet-submitted; transfers and withdrawals may relay. */
export function shouldRelayAction(
  active: "deposit" | "transfer" | "withdraw",
  relayerReady: boolean,
): boolean {
  return active !== "deposit" && relayerReady;
}
