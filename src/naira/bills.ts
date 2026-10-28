/**
 * Bills you can pay from the naira account (Nigeria).
 *
 * TESTNET: plans and prices are samples so the flow can be tried end to end. A real
 * launch takes the live catalogue from the bills partner instead.
 */

export interface Plan { id: string; label: string; price: number }

export const NETWORKS = ['MTN', 'Airtel', 'Glo', '9mobile'] as const

export const DATA_PLANS: Plan[] = [
  { id: 'd1', label: '1GB · 1 day', price: 500 },
  { id: 'd2', label: '2GB · 7 days', price: 1_500 },
  { id: 'd3', label: '5GB · 30 days', price: 3_500 },
  { id: 'd4', label: '10GB · 30 days', price: 6_000 },
  { id: 'd5', label: '25GB · 30 days', price: 11_000 },
]

export const DISCOS = [
  'Ikeja Electric', 'Eko (EKEDC)', 'Abuja (AEDC)', 'Ibadan (IBEDC)', 'Enugu (EEDC)', 'Port Harcourt (PHED)',
  'Kano (KEDCO)', 'Kaduna Electric', 'Jos (JED)', 'Benin (BEDC)', 'Yola (YEDC)', 'Aba Power',
] as const

export const TV_PROVIDERS: Record<string, Plan[]> = {
  DStv: [
    { id: 'dstv-padi', label: 'Padi', price: 4_400 },
    { id: 'dstv-yanga', label: 'Yanga', price: 6_000 },
    { id: 'dstv-confam', label: 'Confam', price: 11_000 },
    { id: 'dstv-compact', label: 'Compact', price: 19_000 },
  ],
  GOtv: [
    { id: 'gotv-smallie', label: 'Smallie', price: 1_900 },
    { id: 'gotv-jinja', label: 'Jinja', price: 3_900 },
    { id: 'gotv-jolli', label: 'Jolli', price: 5_800 },
    { id: 'gotv-max', label: 'Max', price: 8_500 },
  ],
  StarTimes: [
    { id: 'st-nova', label: 'Nova', price: 1_900 },
    { id: 'st-basic', label: 'Basic', price: 3_700 },
    { id: 'st-classic', label: 'Classic', price: 5_500 },
  ],
}

export const MIN_AIRTIME = 50
export const MIN_ELECTRICITY = 1_000
export const MAX_BILL = 500_000

export const KIND_LABEL: Record<string, string> = {
  bank: 'Bank transfer',
  airtime: 'Airtime',
  data: 'Data',
  electricity: 'Electricity',
  tv: 'TV subscription',
}

/** One line describing where a payout went, e.g. "OPay · 0123456789" or "MTN · 0803…". */
export function payoutSummary(kind: string, d: Record<string, string>) {
  switch (kind) {
    case 'bank': return `${d.accountName} · ${d.bank} ${d.accountNumber}`
    case 'airtime': return `${d.network} airtime · ${d.phone}`
    case 'data': return `${d.network} ${d.plan} · ${d.phone}`
    case 'electricity': return `${d.disco} · meter ${d.meterNumber}`
    case 'tv': return `${d.provider} ${d.plan} · ${d.smartcard}`
    default: return kind
  }
}
