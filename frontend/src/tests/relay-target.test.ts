import {
  Account,
  Asset,
  Contract,
  Networks,
  Operation,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import { POST } from "../app/api/relay/route";
import { CONTRACTS } from "../lib/stellar/config";

const SOURCE = "GBVYJ2OZFBHEV7TNFY45V4VLZVV747RCI42C7FHDZBW2MYU5KLYGYQQO";

function txXdrWith(op: xdr.Operation): string {
  const tx = new TransactionBuilder(new Account(SOURCE, "1"), {
    fee: "100",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(op)
    .setTimeout(30)
    .build();
  return tx.toXDR();
}

function relayRequest(body: unknown): Request {
  return new Request("https://zstellar.example/api/relay", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/relay transaction target validation", () => {
  it("rejects a transaction invoking a different contract", async () => {
    const wrong = txXdrWith(
      new Contract(CONTRACTS.verifier).call("transact"),
    );
    const res = await POST(relayRequest({ txXdr: wrong }));
    expect(res.status).toBe(400);
  });

  it("rejects a pool call to a function other than transact", async () => {
    const wrongFn = txXdrWith(new Contract(CONTRACTS.pool).call("get_root"));
    const res = await POST(relayRequest({ txXdr: wrongFn }));
    expect(res.status).toBe(400);
  });

  it("rejects a non-invoke operation", async () => {
    const payment = txXdrWith(
      Operation.payment({
        destination: SOURCE,
        asset: Asset.native(),
        amount: "1",
      }),
    );
    const res = await POST(relayRequest({ txXdr: payment }));
    expect(res.status).toBe(400);
  });

  it("does not reject a pool transact call with 400", async () => {
    const ok = txXdrWith(new Contract(CONTRACTS.pool).call("transact"));
    const res = await POST(relayRequest({ txXdr: ok }));
    expect(res.status).not.toBe(400);
  });
});
