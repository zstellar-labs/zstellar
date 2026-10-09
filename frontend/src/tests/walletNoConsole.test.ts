import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// wallet.js runs in the browser during privacy-key derivation; any console
// call can leak key-derivation context or raw error objects.
describe("wallet.js console hygiene", () => {
  it("contains no console calls", () => {
    const path = fileURLToPath(
      new URL("../engine/vendor/wallet.js", import.meta.url),
    );
    const source = readFileSync(path, "utf-8");
    expect(source).not.toMatch(/console\.(log|warn|error|info|debug|trace)/);
  });
});
