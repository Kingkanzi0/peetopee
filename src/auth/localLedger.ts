// localLedger — in-app local-currency wallet balances and transaction history.
// Balances are credited when a P2P trade completes (trader marks fiat sent, seller confirms).
// In production this would be a server ledger backed by real fund custody.

const LEDGER_KEY = 'ptp_ledger'

export type TxType = 'p2p_credit' | 'send_internal' | 'send_bank' | 'exchange'

export interface LedgerTx {
  id: string
  type: TxType
  currency: string      // ISO 4217, e.g. "NGN"
  amount: number        // positive = credit, negative = debit
  description: string
  counterparty?: string // email or Peetopee ID
  tradeId?: string
  timestamp: number
  status: 'pending' | 'completed' | 'failed'
}

export interface CurrencyBalance {
  currency: string
  balance: number
  transactions: LedgerTx[]
}

interface Ledger {
  balances: Record<string, CurrencyBalance>
}

function loadLedger(): Ledger {
  try {
    const raw = localStorage.getItem(LEDGER_KEY)
    return raw ? (JSON.parse(raw) as Ledger) : { balances: {} }
  } catch { return { balances: {} } }
}

function saveLedger(l: Ledger) {
  localStorage.setItem(LEDGER_KEY, JSON.stringify(l))
}

export function getBalances(): CurrencyBalance[] {
  const ledger = loadLedger()
  return Object.values(ledger.balances)
}

export function getBalance(currency: string): number {
  const ledger = loadLedger()
  return ledger.balances[currency]?.balance ?? 0
}

export function creditBalance(currency: string, amount: number, description: string, meta?: Partial<LedgerTx>): LedgerTx {
  const ledger = loadLedger()
  if (!ledger.balances[currency]) {
    ledger.balances[currency] = { currency, balance: 0, transactions: [] }
  }
  const tx: LedgerTx = {
    id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: meta?.type ?? 'p2p_credit',
    currency,
    amount,
    description,
    timestamp: Date.now(),
    status: 'completed',
    ...meta,
  }
  ledger.balances[currency].balance += amount
  ledger.balances[currency].transactions.unshift(tx)
  saveLedger(ledger)
  return tx
}

export function debitBalance(currency: string, amount: number, description: string, meta?: Partial<LedgerTx>): LedgerTx | { error: string } {
  const ledger = loadLedger()
  const bal = ledger.balances[currency]?.balance ?? 0
  if (bal < amount) return { error: `Insufficient ${currency} balance. Available: ${bal.toLocaleString()}` }
  const tx: LedgerTx = {
    id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: meta?.type ?? 'send_bank',
    currency,
    amount: -amount,
    description,
    timestamp: Date.now(),
    status: 'completed',
    ...meta,
  }
  ledger.balances[currency].balance -= amount
  ledger.balances[currency].transactions.unshift(tx)
  saveLedger(ledger)
  return tx
}

export function getTransactions(currency?: string): LedgerTx[] {
  const ledger = loadLedger()
  if (currency) return ledger.balances[currency]?.transactions ?? []
  return Object.values(ledger.balances)
    .flatMap(b => b.transactions)
    .sort((a, b) => b.timestamp - a.timestamp)
}
