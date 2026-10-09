import { describe, expect, it } from "vitest";
import {
  parseShieldedRecipient,
  shouldRelayAction,
} from "../components/pages/(main)/action-routing";

describe("parseShieldedRecipient", () => {
  it("returns trimmed note and encryption keys from a valid pair", () => {
    expect(parseShieldedRecipient(" note-key : encryption-key ")).toEqual({
      noteKey: "note-key",
      encKey: "encryption-key",
    });
  });

  it.each(["", ":enc", " :enc", "note:", "note: ", "note-only"])(
    "rejects a missing recipient key: %j",
    (recipient) => {
      expect(() => parseShieldedRecipient(recipient)).toThrow(
        "Enter the recipient's shielded address",
      );
    },
  );

  it("rejects an extra delimiter rather than silently dropping data", () => {
    expect(() => parseShieldedRecipient("note:enc:extra")).toThrow(
      "Enter the recipient's shielded address",
    );
  });
});

describe("shouldRelayAction", () => {
  it.each([
    ["deposit", false, false],
    ["deposit", true, false],
    ["transfer", false, false],
    ["transfer", true, true],
    ["withdraw", false, false],
    ["withdraw", true, true],
  ] as const)(
    "mode %s with relayerReady=%s produces relay=%s",
    (active, relayerReady, expected) => {
      expect(shouldRelayAction(active, relayerReady)).toBe(expected);
    },
  );
});
