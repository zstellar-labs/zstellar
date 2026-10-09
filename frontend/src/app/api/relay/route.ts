import {
  authorizeEntry,
  Keypair,
  rpc,
  Transaction,
  xdr,
} from "@stellar/stellar-sdk";
import {
  entryNeedsSigner as entryNeedsRelayer,
  patchAuthEntries,
} from "@/engine/vendor/auth-entries";
import { STELLAR } from "@/lib/stellar/config";
import { CONTRACTS, STELLAR } from "@/lib/stellar/config";

// The relayer secret lives only on the server. This route signs the
// `sender.require_auth()` entry and the transaction envelope with the relayer
// keypair, so the note owner never signs or appears on-chain. Browser code only
// ever sends the WASM-prepared, already-proven transaction here.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// The confirmation poll must finish inside maxDuration, leaving margin for
// auth-entry patching and sendTransaction. Both constants derive from
// maxDuration so a future bump cannot silently overrun the platform limit.
const CONFIRM_POLL_INTERVAL_MS = 1_000;
const CONFIRM_MARGIN_MS = 10_000;
const CONFIRM_MAX_ATTEMPTS = Math.floor(
  (maxDuration * 1_000 - CONFIRM_MARGIN_MS) / CONFIRM_POLL_INTERVAL_MS,
);
const MAX_TX_XDR_CHARS = 64 * 1024;
const MAX_AUTH_ENTRIES = 20;
const MAX_AUTH_ENTRIES_CHARS = 32 * 1024;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const RATE_LIMIT_MAX_KEYS = 1024;

type RelayBody = {
  txXdr?: string;
  authEntries?: string[];
  latestLedger?: number;
};

export function entryNeedsRelayer(
// Bounded per-isolate rate limiter. Keys are the request Origin when present,
// otherwise the first X-Forwarded-For hop. The map never grows past
// RATE_LIMIT_MAX_KEYS entries; when it is full, unknown callers are throttled.
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function isOwnOrigin(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "same-site") {
    return false;
  }
  const origin = request.headers.get("origin");
  if (!origin) return true;
  if (origin === "null") return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function rateLimitKey(request: Request): string {
  const origin = request.headers.get("origin");
  if (origin) return `origin:${origin}`;
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  return `addr:${forwarded ?? "unknown"}`;
}

function isRateLimited(key: string, now: number): boolean {
  for (const [k, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(k);
  }
  const bucket = rateBuckets.get(key);
  if (!bucket) {
    if (rateBuckets.size >= RATE_LIMIT_MAX_KEYS) return true;
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  if (bucket.resetAt <= now) {
    bucket.count = 1;
    bucket.resetAt = now + RATE_LIMIT_WINDOW_MS;
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT_MAX_REQUESTS;
}

function entryNeedsRelayer(
  entry: xdr.SorobanAuthorizationEntry,
  address: string,
): boolean {
  const creds = entry.credentials();
  if (
    creds.switch() !== xdr.SorobanCredentialsType.sorobanCredentialsAddress()
  ) {
    return false;
  }
  const addrAuth = creds.address();
  if (addrAuth.signature().switch().name !== "scvVoid") return false;
  return Address.fromScAddress(addrAuth.address()).toString() === address;
}

export function patchAuthEntries(txXdr: string, signedAuthEntries: string[]): string {
  const env = xdr.TransactionEnvelope.fromXDR(txXdr, "base64");
  const v1 = env.v1();
  if (!v1) throw new Error("Unsupported transaction envelope (expected v1)");
  const auth = signedAuthEntries.map((e) =>
    xdr.SorobanAuthorizationEntry.fromXDR(e, "base64"),
  );
  const invokes = v1
    .tx()
    .operations()
    .filter((op) => op.body()?.invokeHostFunctionOp?.() != null);
  if (invokes.length !== 1) {
    throw new Error(
      `Expected exactly one invokeHostFunction operation, found ${invokes.length}`,
    );
  }
  invokes[0].body().invokeHostFunctionOp().auth(auth);
  return env.toXDR("base64");
}

function isPoolTransactCall(op: xdr.Operation): boolean {
  const invoke = op.body().invokeHostFunctionOp?.();
  if (!invoke) return false;
  const hostFn = invoke.hostFunction();
  if (
    hostFn.switch() !== xdr.HostFunctionType.hostFunctionTypeInvokeContract()
  ) {
    return false;
  }
  const call = hostFn.invokeContract();
  if (call.functionName().toString() !== "transact") return false;
  return (
    Address.fromScAddress(call.contractAddress()).toString() === CONTRACTS.pool
  );

class RelayTargetError extends Error {}

// The relayer signs and pays fees for whatever envelope it is given — without a
// target check a caller could have the relayer fund arbitrary Soroban calls (or
// a classic payment). Every invokeHostFunction op must call `transact` on the
// pool contract, and at least one must exist.
function validateRelayTarget(txXdr: string): void {
  let env: xdr.TransactionEnvelope;
  try {
    env = xdr.TransactionEnvelope.fromXDR(txXdr, "base64");
  } catch {
    throw new RelayTargetError("txXdr is not a valid transaction envelope");
  }
  const v1 = env.v1();
  if (!v1) {
    throw new RelayTargetError("Unsupported transaction envelope (expected v1)");
  }
  let invokeCount = 0;
  for (const op of v1.tx().operations()) {
    const invoke = op.body()?.invokeHostFunctionOp?.();
    if (!invoke) continue;
    invokeCount += 1;
    const hostFn = invoke.hostFunction();
    if (
      hostFn.switch() !== xdr.HostFunctionType.hostFunctionTypeInvokeContract()
    ) {
      throw new RelayTargetError(
        "Relayer only submits invokeContract host functions",
      );
    }
    const call = hostFn.invokeContract();
    const target = Address.fromScAddress(call.contractAddress()).toString();
    if (
      target !== CONTRACTS.pool ||
      call.functionName().toString() !== "transact"
    ) {
      throw new RelayTargetError(
        "Relayer only submits pool transact calls",
      );
    }
  }
  if (invokeCount === 0) {
    throw new RelayTargetError("Transaction has no invokeHostFunction op");
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!isOwnOrigin(request)) {
    return Response.json({ error: "Forbidden origin" }, { status: 403 });
  }
  if (isRateLimited(rateLimitKey(request), Date.now())) {
    return Response.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: RelayBody;
  try {
    body = (await request.json()) as RelayBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const txXdr = body?.txXdr;
  const authEntries = body?.authEntries ?? [];
  const latestLedger = body?.latestLedger ?? 0;
  if (!txXdr || typeof txXdr !== "string") {
    return Response.json({ error: "Missing txXdr" }, { status: 400 });
  }
  if (!Array.isArray(authEntries)) {
    return Response.json({ error: "Invalid authEntries" }, { status: 400 });
  }
  if (txXdr.length > MAX_TX_XDR_CHARS) {
    return Response.json({ error: "txXdr too large" }, { status: 413 });
  }
  if (authEntries.length > MAX_AUTH_ENTRIES) {
    return Response.json({ error: "Too many authEntries" }, { status: 413 });
  }
  if (authEntries.some((entry) => typeof entry !== "string")) {
    return Response.json({ error: "Invalid authEntries" }, { status: 400 });
  }
  const authEntriesChars = (authEntries as string[]).reduce(
    (total, entry) => total + entry.length,
    0,
  );
  if (authEntriesChars > MAX_AUTH_ENTRIES_CHARS) {
    return Response.json({ error: "authEntries too large" }, { status: 413 });
  }

  const secret = process.env.RELAYER_SECRET;
  if (!secret) {
    return Response.json(
      { error: "Relayer is not configured. Run scripts/setup-relayer.mjs." },
      { status: 503 },
    );
  }

  let relayer: Keypair;
  try {
    relayer = Keypair.fromSecret(secret);
  } catch {
    return Response.json({ error: "Invalid RELAYER_SECRET" }, { status: 500 });
  }
  const address = relayer.publicKey();

  // The relayer only pays for pool `transact` calls: every operation in the
  // submitted envelope must be an invoke of CONTRACTS.pool::transact.
  let relayOps: xdr.Operation[];
  try {
    const env = xdr.TransactionEnvelope.fromXDR(txXdr, "base64");
    relayOps = env.v1()?.tx().operations() ?? [];
  } catch {
    return Response.json({ error: "Invalid txXdr envelope" }, { status: 400 });
  }
  if (!relayOps.length || !relayOps.every(isPoolTransactCall)) {
    return Response.json(
      { error: "Transaction must call transact on the pool contract" },
      { status: 400 },
    );
  }

  const networkPassphrase = STELLAR.networkPassphrase;
  const server = new rpc.Server(STELLAR.rpcUrl, {
    allowHttp: STELLAR.rpcUrl.startsWith("http://"),
  });

  try {
    validateRelayTarget(txXdr);
    let needsPatch = false;
    const signed: string[] = [];
    for (const entryXdr of authEntries) {
      const entry = xdr.SorobanAuthorizationEntry.fromXDR(entryXdr, "base64");
      if (!entryNeedsRelayer(entry, address)) {
        signed.push(entryXdr);
        continue;
      }
      needsPatch = true;
      let validUntil = Number(
        entry.credentials().address().signatureExpirationLedger(),
      );
      if (!validUntil) {
        const seq =
          latestLedger > 0
            ? latestLedger
            : (await server.getLatestLedger()).sequence;
        validUntil = seq + 100;
      }
      const authorized = await authorizeEntry(
        entry,
        relayer,
        validUntil,
        networkPassphrase,
      );
      signed.push(authorized.toXDR("base64"));
    }

    const patchedTxXdr = needsPatch ? patchAuthEntries(txXdr, signed) : txXdr;
    const tx = new Transaction(patchedTxXdr, networkPassphrase);
    tx.sign(relayer);

    const send = await server.sendTransaction(tx);
    const hash = send?.hash;
    if (send?.status === "ERROR" || !hash) {
      const detail = send?.errorResult
        ? ` (${send.errorResult.result().switch().name})`
        : "";
      return Response.json(
        { error: `Relayer submission failed${detail}` },
        { status: 502 },
      );
    }

    for (let i = 0; i < CONFIRM_MAX_ATTEMPTS; i++) {
      await new Promise((resolve) =>
        setTimeout(resolve, CONFIRM_POLL_INTERVAL_MS),
      );
      const res = await server.getTransaction(hash);
      if (res?.status === "SUCCESS") {
        return Response.json({ hash });
      }
      if (res?.status === "FAILED") {
        return Response.json(
          { error: "Transaction failed on-chain", hash },
          { status: 502 },
        );
      }
    }
    return Response.json(
      { error: "Confirmation timed out", hash },
      { status: 504 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof RelayTargetError ? 400 : 502;
    return Response.json({ error: message }, { status });
  }
}
