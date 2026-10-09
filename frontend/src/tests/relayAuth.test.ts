import { describe, expect, it } from "vitest";

import {
  Account,
  Address,
  Asset,
  Keypair,
  Operation,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";

import { entryNeedsRelayer, patchAuthEntries } from "../app/api/relay/route";

const PASSPHRASE = "Test SDF Network ; September 2015";
const RELAYER = Keypair.random().publicKey();
const OTHER = Keypair.random().publicKey();
const CONTRACT = Keypair.random().publicKey();

// A SorobanAuthorizationEntry with address credentials. `signature` is scvVoid
// for an unsigned entry, or a populated vector for an already-signed one.
function addressEntry(
  addressStr: string,
  signature: xdr.ScVal,
): xdr.SorobanAuthorizationEntry {
  return new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(
      new xdr.SorobanAddressCredentials({
        address: new Address(addressStr).toScAddress(),
        nonce: xdr.Int64.fromString("1"),
        signatureExpirationLedger: xdr.Uint32.fromString("100"),
        signature,
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

function sourceAccountEntry(): xdr.SorobanAuthorizationEntry {
  return new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),
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

function signedSignature(): xdr.ScVal {
  return xdr.ScVal.scvVec([
    xdr.ScVal.scvMap([
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol("public_key"),
        val: xdr.ScVal.scvString(Keypair.random().publicKey()),
      }),
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol("signature"),
        val: xdr.ScVal.scvBytes(Buffer.alloc(64, 7)),
      }),
    ]),
  ]);
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

describe("entryNeedsRelayer", () => {
  it("returns true for a void-signature entry addressed to the relayer", () => {
    const entry = addressEntry(RELAYER, xdr.ScVal.scvVoid());
    expect(entryNeedsRelayer(entry, RELAYER)).toBe(true);
  });

  it("returns false when the entry is addressed to a different signer", () => {
    const entry = addressEntry(OTHER, xdr.ScVal.scvVoid());
    expect(entryNeedsRelayer(entry, RELAYER)).toBe(false);
  });

  it("returns false for an already-signed entry", () => {
    const entry = addressEntry(RELAYER, signedSignature());
    expect(entryNeedsRelayer(entry, RELAYER)).toBe(false);
  });

  it("returns false for source-account credentials", () => {
    expect(entryNeedsRelayer(sourceAccountEntry(), RELAYER)).toBe(false);
  });
});

describe("patchAuthEntries", () => {
  it("replaces the invoke op auth list with the supplied entries", () => {
    const original = addressEntry(RELAYER, xdr.ScVal.scvVoid());
    const replacement = addressEntry(RELAYER, signedSignature());
    const txXdr = invokeTxXdr([original]);

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
          destination: OTHER,
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
    expect(() =>
      patchAuthEntries(feeBump.toXDR(), []),
    ).toThrow(/expected v1/);
  });

  it("throws when the envelope has no invokeHostFunction op", () => {
    const kp = Keypair.random();
    const account = new Account(kp.publicKey(), "1");
    const tx = new TransactionBuilder(account, {
      fee: "100",
      networkPassphrase: PASSPHRASE,
    })
      .addOperation(
        Operation.payment({
          destination: OTHER,
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
