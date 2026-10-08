import { describe, it, expect } from "vitest";
import { rpc, Contract, xdr, StrKey, scValToNative, Networks, TransactionBuilder, Account, Operation } from "@stellar/stellar-sdk";
import { STELLAR, CONTRACTS } from "../lib/stellar/config";

describe("Pool Configuration", () => {
  it("verifies the pool's configured token SAC matches CONTRACTS.token", async () => {
    const server = new rpc.Server(STELLAR.rpcUrl);
    
    // Build a transaction to call the `token` method on the pool contract
    const contract = new Contract(CONTRACTS.pool);
    const operation = contract.call("token");
    
    // We need a dummy source account to simulate
    const dummyAccount = new Account("GBVYJ2OZFBHEV7TNFY45V4VLZVV747RCI42C7FHDZBW2MYU5KLYGYQQO", "0");
    
    const tx = new TransactionBuilder(dummyAccount, {
      fee: "100",
      networkPassphrase: STELLAR.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();

    // Simulate the transaction to read the return value
    const sim = await server.simulateTransaction(tx);
    
    if (rpc.Api.isSimulationError(sim)) {
        throw new Error(`Simulation failed: ${sim.error}`);
    }
    
    if (!sim.result || !sim.result.retval) {
        throw new Error("Simulation did not return a value. Ensure the pool contract exposes a `token()` method.");
    }
    
    // The retval is an ScVal containing the token address (usually an Address)
    const onChainTokenAddress = scValToNative(sim.result.retval);
    
    if (onChainTokenAddress !== CONTRACTS.token) {
        throw new Error(
            `SILENT ASSET MISMATCH DETECTED!
            The pool at ${CONTRACTS.pool} is configured to pull from ${onChainTokenAddress}.
            However, frontend config CONTRACTS.token is ${CONTRACTS.token}.
            Update src/lib/stellar/config.ts to match the deployed pool!`
        );
    }
    
    expect(onChainTokenAddress).toBe(CONTRACTS.token);
  });
});
