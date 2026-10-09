import { describe, expect, it, vi } from "vitest";

// Cut the Freighter chain — stellar.js imports wallet.js, which the patched
// function never reaches.
vi.mock("../engine/vendor/wallet.js", () => ({
  signWalletAuthEntry: vi.fn(),
  signWalletTransaction: vi.fn(),
}));

import {
  Account,
  Address,
  Asset,
  Keypair,
  Operation,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";

import { patchAuthEntries } from "../engine/vendor/stellar.js";

const PASSPHRASE = "Test SDF Network ; September 2015";
const RELAYER = Keypair.random().publicKey();
const CONTRACT = Keypair.random().publicKey();

function makeEntry(): xdr.SorobanAuthorizationEntry {
  return new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(
      new xdr.SorobanAddressCredentials({
        address: new Address(RELAYER).toScAddress(),
        nonce: xdr.Int64.fromString("1"),
        signatureExpirationLedger: xdr.Uint32.fromString("100"),
        signature: xdr.ScVal.scvVoid(),
      }),
    ),
    rootInvocation: new xdr.SorobanAuthorizedInvocation({
      function_:
        xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
          new xdr.InvokeContractArgs({
            contractAddress: new Address(CONTRACT).toScAddress(),
            functionName: "f",
            args: [],
          }),
        ),
      subInvocations: [],
    }),
  });
}

function invokeTxXdr(auth: xdr.SorobanAuthorizationEntry[]): string {
  const kp = Keypair.random();
  const account = new Account(kp.publicKey(), "1");
  return new TransactionBuilder(account, {
    fee: "100",
    networkPassphrase: PASSPHRASE,
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: CONTRACT,
        function: "f",
        args: [],
        auth,
      }),
    )
    .setTimeout(30)
    .build()
    .toXDR();
}

describe("vendor patchAuthEntries", () => {
  it("rebuilds the envelope with the supplied signed entries", () => {
    const replacement = makeEntry();
    const txXdr = invokeTxXdr([]);

    const patched = patchAuthEntries(txXdr, [replacement.toXDR("base64")]);
    const env = xdr.TransactionEnvelope.fromXDR(patched, "base64");
    const auth = env
      .v1()!
      .tx()
      .operations()[0]
      .body()
      .invokeHostFunctionOp()!
      .auth();
    expect(auth).toHaveLength(1);
    expect(auth[0].toXDR("base64")).toBe(replacement.toXDR("base64"));
  });

  it("throws for a non-v1 envelope", () => {
    const kp = Keypair.random();
    const account = new Account(kp.publicKey(), "1");
    const inner = new TransactionBuilder(account, {
      fee: "100",
      networkPassphrase: PASSPHRASE,
    })
      .addOperation(
        Operation.payment({
          destination: Keypair.random().publicKey(),
          asset: Asset.native(),
          amount: "1",
        }),
      )
      .setTimeout(30)
      .build();
    const feeBump = TransactionBuilder.buildFeeBumpTransaction(
      kp.publicKey(),
      "200",
      inner,
      PASSPHRASE,
    );
    expect(() => patchAuthEntries(feeBump.toXDR(), [])).toThrow(
      /expected v1/,
    );
  });

  it("throws when no invokeHostFunction op is present", () => {
    const kp = Keypair.random();
    const account = new Account(kp.publicKey(), "1");
    const tx = new TransactionBuilder(account, {
      fee: "100",
      networkPassphrase: PASSPHRASE,
    })
      .addOperation(
        Operation.payment({
          destination: Keypair.random().publicKey(),
          asset: Asset.native(),
          amount: "1",
        }),
      )
      .setTimeout(30)
      .build();
    expect(() => patchAuthEntries(tx.toXDR(), [])).toThrow(
      /invokeHostFunction/,
    );
  });
});
