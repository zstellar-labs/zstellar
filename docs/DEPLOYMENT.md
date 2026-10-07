# Deployment — Relayer & Komponen Non-Web

Tutorial ini fokus ke bagian **non-web**: relayer, smart contract, endpoint, dan env var.
Untuk deploy aplikasi Next.js-nya sendiri, ikuti alur deploy Next biasa (Vercel direkomendasikan).

> **Inti:** zStellar **tidak punya server/backend terpisah**. Relayer hanyalah serverless
> Route Handler (`/api/relay`) yang ikut ter-deploy bersama web. Smart contract-nya juga
> sudah live di Stellar Testnet. Jadi "deploy relayer" = siapkan keypair + env var + akun
> yang terdanai.

---

## 1. Relayer (yang utama)

Relayer adalah akun Stellar khusus yang men-submit transaksi **Private Transfer** dan
**Private Withdraw** atas nama user, supaya alamat pemilik note tidak pernah muncul on-chain.
Secret-nya hanya dibaca server (`/api/relay`), tidak pernah dikirim ke browser.

### 1a. Setup lokal

```bash
cd frontend
node scripts/setup-relayer.mjs
```

Skrip ini akan:

- Generate (atau pakai ulang) keypair relayer.
- Mendanai akun via Friendbot (testnet).
- Menulis `RELAYER_SECRET` + `NEXT_PUBLIC_RELAYER_ADDRESS` ke `frontend/.env.local`.

Aman dijalankan berulang — kalau relayer sudah ada, akun-nya dipakai ulang & ditop-up.
Restart `pnpm dev` setelahnya supaya env var baru terbaca.

### 1b. Setup produksi

Jangan pernah commit `.env.local`. Di dashboard hosting (mis. Vercel → Project →
Settings → Environment Variables) set dua variabel ini:

| Variabel | Sifat | Keterangan |
|---|---|---|
| `RELAYER_SECRET` | **rahasia**, server-only | Tanpa prefix `NEXT_PUBLIC_`. Hanya dibaca `/api/relay`. |
| `NEXT_PUBLIC_RELAYER_ADDRESS` | publik | Alamat publik relayer, dipakai sebagai source tx Soroban. |

Cara dapat nilainya: jalankan `node scripts/setup-relayer.mjs` sekali di lokal, lalu salin
dua baris dari `.env.local` ke env var hosting.

### 1c. Jaga saldo relayer

Relayer membayar fee setiap kali submit. Kalau XLM-nya habis, Private Transfer/Withdraw
akan gagal.

- **Testnet:** isi ulang via Friendbot, atau cukup jalankan ulang skrip (otomatis top-up):
  ```
  https://friendbot.stellar.org/?addr=<NEXT_PUBLIC_RELAYER_ADDRESS>
  ```
- `/api/relay` di-set `runtime = "nodejs"`, jadi butuh host yang mendukung Next serverless
  (Vercel cocok). **Bukan** static hosting.

⚠️ `RELAYER_SECRET` adalah kunci akun yang membayar fee. Jangan pernah commit ke git atau
tempel di tempat publik. Di testnet risikonya hanya XLM testnet, tapi tetap perlakukan
sebagai rahasia.

---

## 2. Smart contract — sudah live, TIDAK perlu deploy

Pool, Groth16 Verifier, ASP Membership/Non-membership, dan Token SAC **sudah ter-deploy di
Stellar Testnet**. Alamatnya didefinisikan di `frontend/src/lib/stellar/config.ts` sebagai *source of truth* (dicerminkan di tabel `README.md`). Frontend tinggal menunjuk ke sana.

- ASP register bersifat permissionless di kontrak PoC; auto-register berjalan dari sisi
  client saat deposit pertama. Tidak ada yang perlu kamu setel.
- Kamu **hanya** perlu deploy kontrak kalau ingin fork PoC Nethermind dan punya pool sendiri.
  Dalam kasus itu: deploy lewat Soroban CLI, lalu update alamat di `config.ts`. Untuk sekarang
  langkah ini bisa dilewati.

---

## 3. Endpoint (opsional)

| Variabel | Default | Fungsi |
|---|---|---|
| `STELLAR_RPC_UPSTREAM` | `https://soroban-testnet.stellar.org` | Upstream untuk proxy `/api/rpc` (server-side, retry). |
| `NEXT_PUBLIC_STELLAR_RPC_URL` | testnet RPC | RPC yang dipakai browser. |
| `NEXT_PUBLIC_STELLAR_HORIZON_URL` | testnet Horizon | Horizon untuk baca saldo / Friendbot. |

Semua opsional — default-nya sudah menunjuk ke testnet.

---

## 4. Wajib: COOP/COEP harus aktif di produksi

`frontend/next.config.ts` menyetel header **COOP `same-origin`** + **COEP `require-corp`**
secara global. Ini **wajib** agar `SharedArrayBuffer` dan OPFS (yang dibutuhkan WASM prover
dan Web Worker) berfungsi.

- Vercel menjalankan `headers()` otomatis — tidak perlu konfigurasi tambahan.
- Karena COEP `require-corp`, semua resource lintas-origin harus CORP-compatible. Itulah
  sebabnya video background dan aset engine di-serve same-origin dari `frontend/public/`
  (bukan dari CDN eksternal).
- Jangan pakai `next export` / static hosting: header tetap perlu diset manual, **dan**
  Route Handler `/api/relay` serta `/api/rpc` tidak akan jalan (butuh runtime serverless).

---

## Checklist deploy

- [ ] `RELAYER_SECRET` di-set sebagai env var rahasia di hosting (tidak di-commit).
- [ ] `NEXT_PUBLIC_RELAYER_ADDRESS` di-set di hosting.
- [ ] Akun relayer terdanai XLM (testnet: Friendbot).
- [ ] Host mendukung Next serverless / Node runtime (bukan static export).
- [ ] Header COOP/COEP aktif (otomatis di Vercel via `next.config.ts`).
- [ ] (Opsional) override RPC/Horizon jika tidak memakai endpoint testnet default.

---

> Testnet only, unaudited, **jangan dipakai dengan dana asli**. Deploy ke mainnet berada di
> luar cakupan tutorial ini dan butuh penanganan keamanan tambahan (pendanaan relayer dengan
> XLM asli, manajemen kunci, dsb).
