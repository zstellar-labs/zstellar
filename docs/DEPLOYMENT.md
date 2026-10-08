# Deployment — Relayer & Non-Web Components

This tutorial focuses on the **non-web** parts: the relayer, the smart
contracts, the endpoints and the environment variables. To deploy the Next.js
app itself, follow the normal Next deployment flow (Vercel recommended).

> **The short version:** zStellar has **no separate server/backend**. The
> relayer is just a serverless Route Handler (`/api/relay`) that ships with the
> web app, and the smart contracts are already live on Stellar Testnet. So
> "deploying the relayer" means preparing a keypair, its env vars and a funded
> account.

---

## 1. Relayer (the main part)

The relayer is a dedicated Stellar account that submits **Private Transfer**
and **Private Withdraw** transactions on behalf of users, so the note owner's
address never appears on-chain. Its secret is read by the server only
(`/api/relay`) and is never sent to the browser.

### 1a. Local setup

```bash
cd frontend
node scripts/setup-relayer.mjs
```

The script will:

- Generate (or reuse) the relayer keypair.
- Fund the account through Friendbot (testnet).
- Write `RELAYER_SECRET` + `NEXT_PUBLIC_RELAYER_ADDRESS` to `frontend/.env.local`.

It is safe to run repeatedly — if the relayer already exists, its account is
reused and topped up. Restart `pnpm dev` afterwards so the new env vars load.

### 1b. Production setup

Never commit `.env.local`. In the hosting dashboard (for example Vercel →
Project → Settings → Environment Variables) set these two variables:

| Variable | Nature | Notes |
|---|---|---|
| `RELAYER_SECRET` | **secret**, server-only | No `NEXT_PUBLIC_` prefix. Read only by `/api/relay`. |
| `NEXT_PUBLIC_RELAYER_ADDRESS` | public | The relayer's public address, used as the Soroban tx source. |

To get the values: run `node scripts/setup-relayer.mjs` once locally, then copy
the two lines from `.env.local` into the hosting env vars. The full variable
list is in `frontend/.env.example`.

### 1c. Keep the relayer funded

The relayer pays the fee on every submission. If it runs out of XLM, Private
Transfer/Withdraw will fail.

- **Testnet:** top it up with Friendbot, or just re-run the script (it tops up
  automatically):
  ```
  https://friendbot.stellar.org/?addr=<NEXT_PUBLIC_RELAYER_ADDRESS>
  ```
- `/api/relay` sets `runtime = "nodejs"`, so it needs a host that supports Next
  serverless (Vercel works). **Not** static hosting.

⚠️ `RELAYER_SECRET` is the key of the account that pays the fees. Never commit
it to git or paste it anywhere public. On testnet the only risk is testnet XLM,
but treat it as a secret anyway.

---

## 2. Smart contracts — already live, NO deploy needed

Pool, Groth16 Verifier, ASP Membership/Non-membership, dan Token SAC **sudah ter-deploy di
Stellar Testnet**. Alamatnya didefinisikan di `frontend/src/lib/stellar/config.ts` sebagai *source of truth* (dicerminkan di tabel `README.md`). Frontend tinggal menunjuk ke sana.
The Pool, Groth16 Verifier, ASP Membership/Non-membership and the Token SAC are
**already deployed on Stellar Testnet**. Their addresses are hardcoded in
`frontend/src/lib/stellar/config.ts` (the same values as the table in
`README.md`). The frontend just points at them.

- ASP registration is permissionless in the PoC contract; auto-register runs
  client-side on the first deposit. There is nothing to configure.
- You **only** need to deploy contracts if you want to fork Nethermind's PoC and
  run your own pool. In that case: deploy with the Soroban CLI, then update the
  addresses in `config.ts`. For now this step can be skipped. If you do redeploy,
  follow `docs/REDEPLOY.md` — five files must change together.

---

## 3. Endpoints (optional)

| Variable | Default | Purpose |
|---|---|---|
| `STELLAR_RPC_UPSTREAM` | `https://soroban-testnet.stellar.org` | Upstream for the `/api/rpc` proxy (server-side, retries). |
| `NEXT_PUBLIC_STELLAR_RPC_URL` | testnet RPC | The RPC the browser uses. |
| `NEXT_PUBLIC_STELLAR_HORIZON_URL` | testnet Horizon | Horizon for reading balances / Friendbot. |

All optional — the defaults already point at testnet.

---

## 4. Required: COOP/COEP must be active in production

`frontend/next.config.ts` sets the **COOP `same-origin`** + **COEP
`require-corp`** headers globally. This is **required** for
`SharedArrayBuffer` and OPFS (used by the WASM prover and its Web Workers) to
work.

- Vercel runs `headers()` automatically — no extra configuration needed.
- Because of COEP `require-corp`, every cross-origin resource must be
  CORP-compatible. That is why the background videos and the engine assets are
  served same-origin from `frontend/public/` (not from an external CDN).
- Do not use `next export` / static hosting: the headers still have to be set
  manually, **and** the `/api/relay` and `/api/rpc` Route Handlers will not run
  (they need a serverless runtime).

---

## Deploy checklist

- [ ] `RELAYER_SECRET` set as a secret env var on the host (not committed).
- [ ] `NEXT_PUBLIC_RELAYER_ADDRESS` set on the host.
- [ ] The relayer account is funded with XLM (testnet: Friendbot).
- [ ] The host supports Next serverless / Node runtime (not static export).
- [ ] COOP/COEP headers active (automatic on Vercel via `next.config.ts`).
- [ ] (Optional) override RPC/Horizon if you are not using the default testnet endpoints.

---

> Testnet only, unaudited, **jangan dipakai dengan dana asli**. Deploy ke mainnet berada di
> luar cakupan tutorial ini dan butuh penanganan keamanan tambahan (pendanaan relayer dengan
> XLM asli, manajemen kunci, dsb).


## 5. Security & Verification

To prevent silent asset mismatches, the frontend requires the pool's configured token to match `CONTRACTS.token`. If you redeploy the pool with a new SAC, you must update `config.ts`. You can verify this configuration matches the live on-chain deployment by running:

`ash
cd frontend
pnpm test
``n
If there is a mismatch, the test will fail loudly to prevent users from bridging into the wrong asset.
> Testnet only, unaudited, **do not use with real funds**. Deploying to mainnet
> is outside the scope of this tutorial and needs extra security work (funding
> the relayer with real XLM, key management, and so on).
