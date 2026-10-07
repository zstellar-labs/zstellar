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
