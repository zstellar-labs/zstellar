# Contract redeploy runbook

A pool redeploy touches **five places that must move together**. The last
redeploy updated the code but left `README.md` stale, so follow this order every
time. Skipping a step produces either a silent runtime failure or an invisible
documentation drift.

> Read this before deploying. Changing `CONTRACTS.pool` also **wipes every
> user's local note store** — see [Consequences](#consequences).

## The five update sites

| # | Site | What changes |
|---|---|---|
| 1 | `frontend/src/lib/stellar/config.ts` | `CONTRACTS` — `pool`, `verifier`, `aspMembership`, `aspNonMembership`, `token`, `deployer` |
| 2 | `README.md` | The "Addresses (Stellar Testnet)" table must list every `CONTRACTS` address |
| 3 | `docs/DEPLOYMENT.md` | Only if the deployment story or the endpoint list changes |
| 4 | `frontend/public/engine/js/*_bg.wasm` | The embedded `"deploymentLedger":<ledger>` value |
| 5 | `frontend/src/app/api/rpc/route.ts` | `NEW_DEPLOYMENT_LEDGER` |

`CHANGELOG.md` gets an entry too, describing the new addresses and the OPFS
reset.

## Ordered procedure

1. **Deploy the contracts** with the Soroban CLI (pool, verifier, ASP
   membership, ASP non-membership). Note the resulting addresses and the ledger
   at which the new pool went live.

2. **Update `CONTRACTS`** in `frontend/src/lib/stellar/config.ts` with the new
   addresses. The token SAC address normally does not change.

3. **Patch the WASM deployment ledger.** The vendored bundles have the old
   deployment ledger baked in; run:

   ```bash
   cd frontend
   node scripts/patch-wasm-ledger.mjs
   ```

   The script reads the latest testnet ledger from Soroban RPC and rewrites
   `"deploymentLedger":\d{7}` in `frontend/public/engine/js/web_bg.wasm`,
   `prover-worker_bg.wasm` and `storage-worker_bg.wasm` to
   `latest - 1000`. It aborts if a replacement would change a file's length.

4. **Set `NEW_DEPLOYMENT_LEDGER`** in `frontend/src/app/api/rpc/route.ts` to the
   same ledger the WASM was patched to. If the two disagree, the proxy rewrites
   `startLedger` to a range that does not match the bundle and the
   out-of-range loop the proxy was written to fix comes back.

5. **Update the README address table** so it lists every address in `CONTRACTS`
   verbatim. CI fails the `docs-drift` job otherwise.

6. **Add a `CHANGELOG.md` entry** naming the new addresses and the Merkle-level
   change, and noting the OPFS reset below.

## Verify

```bash
cd frontend
pnpm lint                 # Biome check
pnpm build                # Next build
node -e "const s=require('fs').readFileSync('src/lib/stellar/config.ts','utf8');console.log(s.match(/[CG][A-Z2-7]{55}/g))"
grep -o '"deploymentLedger":[0-9]\{7\}' public/engine/js/web_bg.wasm | head -1
grep -n 'NEW_DEPLOYMENT_LEDGER' src/app/api/rpc/route.ts
```

Then load the app on testnet and run one Shield followed by one Private
Transfer: the first deposit registers the user in the new ASP tree and may take
up to a minute while the chain syncs.

## Consequences

- **OPFS reset (user-visible).** `maybeResetStorage` in
  `frontend/src/engine/index.ts` compares the stored pool id with
  `CONTRACTS.pool`; on a mismatch it wipes OPFS and clears every
  `zStellar:asp-registered:*` flag. Every user therefore loses their local note
  cache and must re-derive keys (one Freighter signature) and re-register on
  their next deposit. This is by design — old notes belong to the old pool — but
  it must be announced.
- **Explorer links and docs go stale.** Any README or explorer link pointing at
  the previous pool or verifier address is dead after the redeploy.
- **In-flight transactions fail.** Anything signed against the old pool cannot
  be submitted once `CONTRACTS.pool` changes.
# Contract Redeployment Runbook

This runbook outlines the required procedure when redeploying the zStellar smart contracts on Stellar Testnet (e.g., parameter adjustments, Merkle depth updates, or state resets).

When redeploying contracts, **five distinct update sites across the codebase must move together in lockstep**. Failing to update all sites causes RPC query mismatches, event-indexing failures, or stale explorer references.

---

## 1. Critical Consequence: OPFS Storage Reset

Changing `CONTRACTS.pool` in `frontend/src/lib/stellar/config.ts` automatically resets client storage:

- **Storage invalidation**: The frontend engine tracks the active pool via `localStorage.getItem("zStellar:engine-pool")`. When this differs from `CONTRACTS.pool`, `maybeResetStorage()` in `frontend/src/engine/index.ts` triggers:
  - `wipeOpfs()`: Deletes Origin Private File System (OPFS) notes and keys.
  - `clearAspFlags()`: Clears ASP auto-registration cache in `localStorage`.
- **User impact**: All previously held notes and unspent commitments become invalid for the new pool. Users will connect to a clean slate and must register / shield funds afresh.

---

## 2. Ordered Redeploy Checklist

Follow these steps in order when performing a redeployment:

### Step 1: Deploy New Contracts on Testnet

Deploy the contracts using the Soroban CLI and note down the resulting contract IDs and the ledger sequence number at deployment time:

- Pool Contract ID
- Groth16 Verifier Contract ID
- ASP Membership Contract ID
- ASP Non-Membership Contract ID
- XLM SAC Token Contract ID
- Deployer Public Key
- Deployment Ledger Sequence (from RPC `getLatestLedger`)

---

### Step 2: Update `frontend/src/lib/stellar/config.ts`

Update the `CONTRACTS` dictionary with the new contract IDs:

```typescript
export const CONTRACTS = {
  pool: "<NEW_POOL_CONTRACT_ID>",
  verifier: "<NEW_VERIFIER_CONTRACT_ID>",
  aspMembership: "<NEW_ASP_MEMBERSHIP_CONTRACT_ID>",
  aspNonMembership: "<NEW_ASP_NON_MEMBERSHIP_CONTRACT_ID>",
  token: "<TOKEN_SAC_ID>",
  deployer: "<DEPLOYER_ADDRESS>",
} as const;
```

---

### Step 3: Update `frontend/src/app/api/rpc/route.ts`

Update `NEW_DEPLOYMENT_LEDGER` to the sequence number where the new contracts were deployed:

```typescript
// New contracts were deployed at this ledger. Any getEvents request with
// startLedger before this is for a pruned or non-existent range, so we
// rewrite it to start from our actual deployment point.
const NEW_DEPLOYMENT_LEDGER = <NEW_LEDGER_SEQUENCE>;
```

This prevents the Edge RPC proxy from forwarding requests for pruned or pre-deployment ledger ranges.

---

### Step 4: Patch the WASM Deployment Ledger

From the `frontend/` directory, run the ledger patcher script to update the embedded `deploymentLedger` in the client-side WASM binaries:

```bash
cd frontend
node scripts/patch-wasm-ledger.mjs
```

This updates:
- `frontend/public/engine/js/web_bg.wasm`
- `frontend/public/engine/js/prover-worker_bg.wasm`
- `frontend/public/engine/js/storage-worker_bg.wasm`

*Note: The script fetches the latest ledger from testnet RPC and applies a safe buffer (`latest - 1000`). Verify that the binary lengths remain unchanged.*

---

### Step 5: Update Documentation & Address Tables

Keep documentation in sync with `CONTRACTS`:

1. **`README.md`**: Update the table in the "Addresses (Stellar Testnet)" section with all new contract IDs and the deployer address.
2. **`docs/DEPLOYMENT.md`**: Confirm the reference points to `frontend/src/lib/stellar/config.ts` as the single source of truth.

---

## 3. Summary of Files to Modify

| File | Purpose |
|---|---|
| `frontend/src/lib/stellar/config.ts` | Updates `CONTRACTS` contract addresses (single source of truth). |
| `frontend/src/app/api/rpc/route.ts` | Updates `NEW_DEPLOYMENT_LEDGER` for event range rewriting. |
| `frontend/public/engine/js/*_bg.wasm` | Patched via `node scripts/patch-wasm-ledger.mjs`. |
| `README.md` | Updates the Testnet contract address table. |
| `docs/DEPLOYMENT.md` | Ensures documentation consistency with `config.ts`. |
| `docs/REDEPLOY.md` | This runbook. |

---

## 4. Verification Commands

After completing all updates, run the following verification checks from `frontend/`:

```bash
cd frontend

# 1. Check code quality and formatting
pnpm lint

# 2. Verify TypeScript type safety
pnpm exec tsc --noEmit

# 3. Verify Next.js production build succeeds
pnpm build
```

### Manual Sanity Checks

1. **Relayer funding**: Ensure the relayer account has sufficient XLM (`node scripts/setup-relayer.mjs`).
2. **Browser storage**: Open the dApp in a clean browser profile / Incognito mode. Confirm wallet connects and initial ASP leaf insertion and shield transactions succeed on testnet.
