import {
  Account,
  Address,
  nativeToScVal,
  Transaction,
  type xdr,
} from "@stellar/stellar-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPoolRoot, server } from "../lib/stellar/client";
import { CONTRACTS } from "../lib/stellar/config";

describe("getPoolRoot", () => {
  beforeEach(() => {
    vi.spyOn(server, "getAccount").mockImplementation(
      async () => new Account(CONTRACTS.deployer, "100"),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds a transaction calling get_root on the pool contract and decodes bigint on success", async () => {
    const expectedRoot =
      0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdefn;
    const simulateSpy = vi
      .spyOn(server, "simulateTransaction")
      .mockResolvedValueOnce({
        id: "1",
        latestLedger: 1000,
        minResourceFee: "100",
        result: {
          retval: nativeToScVal(expectedRoot),
        },
      } as never);

    const root = await getPoolRoot();

    expect(server.getAccount).toHaveBeenCalledWith(CONTRACTS.deployer);
    expect(simulateSpy).toHaveBeenCalledTimes(1);

    // Inspect the built transaction to confirm contract id and function name
    const [tx] = simulateSpy.mock.calls[0] as [Transaction];
    expect(tx).toBeInstanceOf(Transaction);
    expect(tx.operations).toHaveLength(1);

    const op = tx.operations[0];
    expect(op.type).toBe("invokeHostFunction");

    const hostFn = (op as { func: xdr.HostFunction }).func.invokeContract();
    const contractAddress = Address.fromScAddress(
      hostFn.contractAddress(),
    ).toString();
    const functionName = hostFn.functionName().toString();

    expect(contractAddress).toBe(CONTRACTS.pool);
    expect(functionName).toBe("get_root");
    expect(hostFn.args()).toHaveLength(0);

    // Decodes to a bigint
    expect(root).toBe(expectedRoot);
    expect(typeof root).toBe("bigint");
  });

  it("returns null when the simulation results in an error", async () => {
    vi.spyOn(server, "simulateTransaction").mockResolvedValueOnce({
      error: "HostError: Error(Contract, #1)",
    } as never);

    const root = await getPoolRoot();
    expect(root).toBeNull();
  });

  it("returns null when the simulation result is missing", async () => {
    vi.spyOn(server, "simulateTransaction").mockResolvedValueOnce({
      id: "1",
      latestLedger: 1000,
      minResourceFee: "100",
    } as never);

    const root = await getPoolRoot();
    expect(root).toBeNull();
  });
});
