# Peetopee

> Built with Arc Studio — P2P stablecoin-to-local-currency marketplace. "No payment barriers."

---

## What This App Does

Peetopee is a peer-to-peer marketplace where sellers lock USDC in escrow and local traders send fiat to the seller's bank account. Once the seller confirms receipt, the smart contract releases USDC to the trader. Disputes are resolved by an admin arbiter. Supports Nigeria (NGN), Vietnam (VND), France (EUR), and more.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS, framer-motion, lucide-react
- Web3: wagmi v2 + viem v2, with ONE connector: the built-in Peetopee wallet (`src/wallet/peetopeeConnector.ts`)
- Backend: Bun + SQLite, `server/api.ts` (single source of truth; `server/index.ts` = dev, `server/prod.ts` = Docker/Render)
- Contracts: Solidity 0.8.28 + Foundry. Source: `contracts/PeetopeeEscrow.sol`. Tests: `contracts/test/PeetopeeEscrow.t.sol` (101 tests pass).
- Chain: Arc Testnet (Chain ID: 5042002)
- Token: USDC (6 decimals ERC-20, Address: 0x3600000000000000000000000000000000000000)
- Design: Arc Light mode (warm neutral, dark navy CTAs, Space Grotesk + DM Sans)

## Deployed Contracts

| Contract | Network | Address | Explorer |
|---|---|---|---|
| PeetopeeEscrow | Arc Testnet | 0x59417b13a4d545ff514642a1db1693f35652daea | https://explorer.testnet.arc.io/address/0x59417b13a4d545ff514642a1db1693f35652daea |

## Constructor Args Used

- `_usdc`: 0x3600000000000000000000000000000000000000 (USDC on Arc Testnet)
- `_admin`: 0x5B12Ce46C7194aD57d143bC22847224047b1Ef42 (platform deployer)
- `_treasury`: 0x5B12Ce46C7194aD57d143bC22847224047b1Ef42 (platform deployer)
- `_initialFeeBps`: 50 (0.5%)

## Ground rules (read before changing anything)

1. **Built-in wallet only.** Users create or import a wallet (seed phrase / private key) in the Wallet tab.
   Do NOT add MetaMask, injected wallets, WalletConnect, ConnectKit or any "connect wallet" button.
2. **Two accounts from one key** (`src/wallet/standaloneWallet.ts`):
   - *Wallet* — main account; Peetopee ID payments arrive here.
   - *Funds* — trading account, `keccak256(walletKey ‖ "peetopee-funds-v1")`. Selling, trader registration
     and all escrow actions sign with Funds via the wagmi connector. Users move USDC Wallet → Funds to sell.
3. **Never store a private key in plaintext.** Keys are AES-GCM encrypted with a non-extractable device key
   (IndexedDB) and only decrypted into memory after the PIN/biometric unlock (`unlockWallet()` in `App.tsx`).
4. **Sign-in codes are issued and checked by the server** (`/auth/request-otp`, `/auth/verify-otp`), never in the browser.
   Every account-changing API call sends the session token (`src/auth/ptpApi.ts`).
5. **Peetopee IDs live on the server.** Lookups go through `GET /lookup`; never a localStorage registry.
   The app registers the built-in wallet's addresses with the user's ID automatically, proven by a wallet
   signature (`useWalletLink.ts` ↔ `POST /link-wallet`). This is internal plumbing, not a user-facing feature.
6. **Bank details never go on-chain.** `createTrade` stores only `keccak256(details)`; the details go to
   `POST /trade-details` and only that trade's seller and trader can read them.
7. **ID verification (KYC) is required** to sell (`SellFlow`) or register as a trader (`TraderDashboard`).
   Review submissions at `<app-url>#admin` with the server's `ADMIN_TOKEN`.
8. Don't commit `console.jsonl` / `traces.jsonl` (debug logs can contain emails and codes).
9. **Arc network access goes through the server first.** The app reads/sends via `/api/rpc` (an allowlisted
   JSON-RPC relay) and history via `/api/history`, falling back to the public endpoints in
   `src/wallet/arcNetwork.ts`. Browser blockers like Brave Shields block public RPC hosts, not the app's own server.

## Server environment variables

| Variable | Purpose |
|---|---|
| `RESEND_API_KEY`, `OTP_FROM_EMAIL` | Email sign-in codes via Resend |
| `OTP_DEMO=1` | TESTING ONLY — return the sign-in code to the app instead of emailing it |
| `KYC_AUTO_APPROVE=1` | TESTING ONLY — approve every ID submission |
| `ADMIN_TOKEN` | Enables the ID review page |
| `DATA_KEY` | 64 hex chars; encrypts ID photos and bank details (auto-generated next to the DB if unset) |
| `DB_PATH`, `ARC_RPC_URL`, `ESCROW_ADDRESS` | Storage / chain settings |

Server tests: `cd server && bun install && bun test`

## Key Files

- `src/App.tsx` — main navigation shell (tab: marketplace / dashboard)
- `src/components/CountryPicker.tsx` — "Where are you?" country search
- `src/components/TraderList.tsx` — lists traders by country with rates/ratings
- `src/components/SellFlow.tsx` — amount entry → bank details → confirm → escrow lock
- `src/components/TradeStatus.tsx` — live trade status, actions (markFiatSent, confirmReceived, dispute, cancel, rate)
- `src/components/TraderDashboard.tsx` — trader registration + incoming orders
- `src/components/TradeChat.tsx` — in-trade chat (localStorage, local only for demo)
- `src/components/TradeBankDetails.tsx` — shows a trade's bank details to its seller/trader
- `src/components/FundsScreen.tsx` — Funds + Wallet balances in USDC and the visiting country's currency; Wallet ↔ Funds moves
- `src/components/SendUsdcByPtpId.tsx` — send USDC by @handle with live lookup + avatar
- `src/components/PayBankScreen.tsx` + `src/payments/banks.ts` — "Pay a bank account": pick bank (OPay, UBA…), enter naira amount, best verified-trader quote, then the pre-filled escrow sell flow
- `src/components/TransactionHistory.tsx` / `src/history/txHistory.ts` — history (local log + Arc explorer API)
- `src/components/KycFlow.tsx`, `src/components/AdminKyc.tsx` — ID verification and review
- `src/components/DisputeEvidence.tsx`, `src/components/AdminDisputes.tsx` — dispute evidence (both sides) and admin resolution (`resolveDispute`; the admin's Funds account must be the contract `admin`)
- `src/hooks/useMoney.ts` — local-currency display (₦ first, USDC alongside) and the visiting country
- `src/wallet/peetopeeConnector.ts` — wagmi connector for the built-in wallet's Funds account
- `server/api.ts` + `server/api.test.ts` — backend and its tests
- `src/contracts/peetopee.ts` — contract address, ABI, types, helpers
- `contracts/PeetopeeEscrow.sol` — escrow contract
- `contracts/test/PeetopeeEscrow.t.sol` — 101 Foundry tests

## Trade Flow

1. Seller (ID-verified) moves USDC Wallet → Funds, picks country → sees ID-verified traders → enters amount + bank details → confirms
2. Contract pulls USDC from the seller's Funds account (approve + createTrade with the bank-details hash); the app uploads the details to the server
3. Trader opens the trade, sees the bank details, sends fiat → calls markFiatSent
4. Seller checks bank account → calls confirmReceived → USDC released to trader (minus 0.5% fee)
5. Either party can openDispute; admin resolves via resolveDispute
6. If trader never marks fiat sent within 24h, seller can cancelTrade and reclaim USDC

## Security Notes

- ReentrancyGuard on all token-moving functions
- Max fee cap: 500 bps (5%)
- Trade expiry: 24h constant
- Events emitted for every state change including admin actions
- Security review: clean at balanced level (101/101 tests pass)

## To Run

```bash
bun install
bun run dev
```

## To Build Contracts

```bash
bun run contracts:build   # forge build
bun run contracts:test    # forge test
```
