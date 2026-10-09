import {
  BASE_FEE,
  Contract,
  Horizon,
  NotFoundError,
  rpc,
  scValToNative,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { browserRpcUrl, CONTRACTS, STELLAR } from "./config";

const rpcUrl = browserRpcUrl();
export const server = new rpc.Server(rpcUrl, {
  allowHttp: !rpcUrl.startsWith("https://"),
});
export const horizon = new Horizon.Server(STELLAR.horizonUrl);

export async function getPoolRoot(): Promise<bigint | null> {
  const account = await server.getAccount(CONTRACTS.deployer);
  const contract = new Contract(CONTRACTS.pool);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR.networkPassphrase,
  })
    .addOperation(contract.call("get_root"))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim) || !sim.result) return null;
  return scValToNative(sim.result.retval) as bigint;
}

export async function fundWithFriendbot(address: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://friendbot.stellar.org?addr=${encodeURIComponent(address)}`,
    );
    return res.ok;
  } catch {
    return false;
  }
}

/** Thrown when the XLM balance could not be loaded due to a transport/server
 * failure. Callers should surface an error and offer retry rather than render
 * a misleading zero balance. */
export class XlmBalanceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XlmBalanceUnavailableError";
  }
}

export async function getXlmBalance(address: string): Promise<string> {
  try {
    const account = await horizon.loadAccount(address);
    const native = account.balances.find((b) => b.asset_type === "native");
    return native?.balance ?? "0";
  } catch (error) {
    // Horizon 404 means the account was never funded: a legitimate zero.
    const status =
      error && typeof error === "object" && "response" in error
        ? (error as { response?: { status?: number } }).response?.status
        : undefined;
    if (status === 404 || error instanceof NotFoundError) {
      return "0";
    }
    throw new XlmBalanceUnavailableError(
      "Could not load the XLM balance from Horizon. Check connectivity and retry.",
    );
  }
}
