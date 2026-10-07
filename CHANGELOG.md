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
