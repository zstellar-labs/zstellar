# Changelog

All notable changes to zStellar are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) once it
starts cutting releases.

## [Unreleased]

### Changed

- **Contract redeploy with the correct Merkle tree height (10).** The pool,
  Groth16 verifier, ASP membership and ASP non-membership contracts were
  redeployed on Stellar Testnet and the vendored WASM bundles were patched to
  match. `CONTRACTS` in `frontend/src/lib/stellar/config.ts` now holds:

  | Contract | Address |
  |---|---|
  | Pool | `CCQVW6Z3H2G5T4SZXW6MYQQZWNLTRGJCCLHJLVXR6N7M2E3LPVY3CY2N` |
  | Groth16 Verifier | `CDMMDEFM6T44GYK2AFOQF6FMVJPAJYXUJJA3CIPNYRRJPN3M35662S53` |
  | ASP Membership | `CBEVWMLPG5H36VW5OSDI7RATOHANKN2LBLNHHBTUP33ZHLIZRPAK2365` |
  | ASP Non-Membership | `CACMAMCL7JNTE5R64P67KXCFBH2QA73JI2UEIWHJUEO4NVBGBBK3G3TC` |
  | Token (XLM SAC) | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` (unchanged) |
  | Deployer | `GBVYJ2OZFBHEV7TNFY45V4VLZVV747RCI42C7FHDZBW2MYU5KLYGYQQO` |

  The README contract table now mirrors these values, and the runbook for the
  next redeploy lives in `docs/REDEPLOY.md`.

- `/api/rpc` intercepts the upstream `startLedger must be within the ledger
  range` error and returns an empty events page with a synthetic cursor, so the
  precompiled WASM indexer no longer loops on a pruned range.
- `/api/rpc` transparently rewrites `startLedger` values older than
  `NEW_DEPLOYMENT_LEDGER` to the current deployment point.
- `/api/rpc` runs on the Edge runtime with a 25-second retry budget and retries
  upstream 429/502/503 and non-JSON responses.

### Impact

- **Local state is invalidated.** Because `CONTRACTS.pool` changed,
  `maybeResetStorage` (`frontend/src/engine/index.ts`) wipes every user's OPFS
  note store and all `zStellar:asp-registered:*` localStorage flags on the next
  load. Users re-derive their keys from one Freighter signature and re-register
  in the ASP membership tree on their next deposit, which is why that deposit can
  appear to take longer than usual.
- **Explorer links changed.** Any link to the previous pool or verifier address
  is stale; use the table above.
# Changelog

All notable changes to the zStellar contracts, circuits, and frontend engine are documented here.

## Contract Redeployment & Merkle Level Fix

### Changed
- **Smart Contracts Redeployed**: Redeployed the Soroban smart contracts on Stellar Testnet with correct Merkle tree depth (levels = 10) to ensure full compatibility with the BN254 Groth16 circuit and Poseidon2 hash parameters.
- **Contract Addresses Updated**: Updated `CONTRACTS` in `frontend/src/lib/stellar/config.ts`:
  - `pool`: `CCQVW6Z3H2G5T4SZXW6MYQQZWNLTRGJCCLHJLVXR6N7M2E3LPVY3CY2N`
  - `verifier`: `CDMMDEFM6T44GYK2AFOQF6FMVJPAJYXUJJA3CIPNYRRJPN3M35662S53`
  - `aspMembership`: `CBEVWMLPG5H36VW5OSDI7RATOHANKN2LBLNHHBTUP33ZHLIZRPAK2365`
  - `aspNonMembership`: `CACMAMCL7JNTE5R64P67KXCFBH2QA73JI2UEIWHJUEO4NVBGBBK3G3TC`
- **WASM Engine Bundles**: Patched `web_bg.wasm`, `storage-worker_bg.wasm`, and `prover-worker_bg.wasm` to align with the 10-level tree circuits.
- **Soroban RPC Proxy**: Updated `NEW_DEPLOYMENT_LEDGER = 3337836` in `frontend/src/app/api/rpc/route.ts` to prevent out-of-range historical ledger queries and WASM indexer loop crashes.

### Storage & Migration Impact
- **OPFS Note Store Reset**: Updating the pool contract address deliberately triggers `maybeResetStorage()` in `frontend/src/engine/index.ts`.
  - Completely wipes local notes stored in browser Origin Private File System (OPFS) from the previous pool address to prevent spending stale notes.
  - Clears `zStellar:asp-registered:*` flags from `localStorage`, ensuring users automatically re-register in the ASP membership tree (`insert_leaf`) on their first deposit.
