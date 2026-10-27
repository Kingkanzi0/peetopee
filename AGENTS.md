# Peetopee

> Built with Arc Studio — P2P stablecoin-to-local-currency marketplace. "No payment barriers."

---

## What This App Does

Peetopee is a peer-to-peer marketplace where sellers lock USDC in escrow and local traders send fiat to the seller's bank account. Once the seller confirms receipt, the smart contract releases USDC to the trader. Disputes are resolved by an admin arbiter. Supports Nigeria (NGN), Vietnam (VND), France (EUR), and more.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS, framer-motion, lucide-react
- Web3: wagmi v2, viem v2, ConnectKit
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

## Key Files

- `src/App.tsx` — main navigation shell (tab: marketplace / dashboard)
- `src/components/CountryPicker.tsx` — "Where are you?" country search
- `src/components/TraderList.tsx` — lists traders by country with rates/ratings
- `src/components/SellFlow.tsx` — amount entry → bank details → confirm → escrow lock
- `src/components/TradeStatus.tsx` — live trade status, actions (markFiatSent, confirmReceived, dispute, cancel, rate)
- `src/components/TraderDashboard.tsx` — trader registration + incoming orders
- `src/components/TradeChat.tsx` — in-trade chat (localStorage, local only for demo)
- `src/contracts/peetopee.ts` — contract address, ABI, types, helpers
- `contracts/PeetopeeEscrow.sol` — escrow contract
- `contracts/test/PeetopeeEscrow.t.sol` — 101 Foundry tests

## Trade Flow

1. Seller picks country → sees traders → enters USDC amount + bank details → confirms
2. Contract pulls USDC from seller (via approve + createTrade)
3. Trader sees incoming order → sends fiat → calls markFiatSent
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
