import { describe, expect, it, vi, afterEach } from "vitest";

// The route reads RELAYER_SECRET via process.env and instantiates
// rpc.Server — keep the real Keypair/Transaction classes and stub only the
// network surface.
vi.mock("@stellar/stellar-sdk", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@stellar/stellar-sdk")>();
  const sendTransaction = vi.fn();
  const getTransaction = vi.fn();
  const getLatestLedger = vi.fn();
  return {
    ...mod,
    rpc: {
      ...mod.rpc,
      Server: vi.fn().mockImplementation(() => ({
        sendTransaction,
        getTransaction,
        getLatestLedger,
      })),
      __mocked__: { sendTransaction, getTransaction, getLatestLedger },
    },
  };
});

import {
  Account,
  Asset,
  Keypair,
  Operation,
  rpc,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

import { POST } from "../app/api/relay/route";

const SECRET = Keypair.random().secret();
const PASSPHRASE = "Test SDF Network ; September 2015";

const mocks = (rpc as unknown as { __mocked__: {
  sendTransaction: ReturnType<typeof vi.fn>;
  getTransaction: ReturnType<typeof vi.fn>;
  getLatestLedger: ReturnType<typeof vi.fn>;
} }).__mocked__;

function post(body: unknown): Request {
  return new Request("http://localhost/api/relay", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function validTxXdr(): string {
  const kp = Keypair.random();
  const account = new Account(kp.publicKey(), "1");
  return new TransactionBuilder(account, {
    fee: "100",
    networkPassphrase: PASSPHRASE,
  })
    .addOperation(
      Operation.payment({
        destination: kp.publicKey(),
        asset: Asset.native(),
        amount: "1",
      }),
    )
    .setTimeout(30)
    .build()
    .toXDR();
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("POST /api/relay body validation", () => {
  it("returns 503 when RELAYER_SECRET is unset", async () => {
    vi.stubEnv("RELAYER_SECRET", "");
    const res = await POST(post({ txXdr: "x", authEntries: [] }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("not configured");
  });

  it("returns 500 when RELAYER_SECRET is malformed", async () => {
    vi.stubEnv("RELAYER_SECRET", "not-a-strkey");
    const res = await POST(post({ txXdr: "x", authEntries: [] }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Invalid RELAYER_SECRET");
  });

  it("returns 400 on a non-JSON body", async () => {
    vi.stubEnv("RELAYER_SECRET", SECRET);
    const res = await POST(post("{not json"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid JSON body");
  });

  it("returns 400 when txXdr is missing or not a string", async () => {
    vi.stubEnv("RELAYER_SECRET", SECRET);
    for (const body of [{}, { txXdr: 7 }, { txXdr: null }]) {
      const res = await POST(post(body));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("Missing txXdr");
    }
  });

  it("returns 400 when authEntries is not an array", async () => {
    vi.stubEnv("RELAYER_SECRET", SECRET);
    const res = await POST(post({ txXdr: "x", authEntries: "nope" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid authEntries");
  });

  it("a valid body reaches server.sendTransaction and returns the hash", async () => {
    vi.stubEnv("RELAYER_SECRET", SECRET);
    mocks.sendTransaction.mockResolvedValue({ hash: "abc123", status: "PENDING" });
    mocks.getTransaction.mockResolvedValue({ status: "SUCCESS" });

    const res = await POST(
      post({ txXdr: validTxXdr(), authEntries: [], latestLedger: 100 }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hash: "abc123" });
    expect(mocks.sendTransaction).toHaveBeenCalledTimes(1);
  });
});
