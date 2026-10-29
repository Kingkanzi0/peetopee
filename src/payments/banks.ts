/**
 * Banks and mobile-money providers people can be paid into, per country.
 * Countries without a list let the user type the bank name.
 */

export interface BankRules {
  banks: string[]
  /** e.g. Nigerian NUBAN account numbers are exactly 10 digits */
  accountPattern?: RegExp
  accountHint: string
}

export const BANKS_BY_COUNTRY: Record<string, BankRules> = {
  NG: {
    banks: [
      'OPay', 'Moniepoint', 'PalmPay', 'Kuda', 'UBA', 'GTBank', 'Access Bank', 'Zenith Bank',
      'First Bank', 'FCMB', 'Fidelity Bank', 'Union Bank', 'Sterling Bank', 'Wema Bank (ALAT)',
      'Stanbic IBTC', 'Ecobank', 'Polaris Bank', 'Keystone Bank', 'Providus Bank', 'Unity Bank',
      'Jaiz Bank', 'Globus Bank', 'Titan Trust Bank', 'Standard Chartered', 'Citibank',
      'FairMoney', 'Carbon', 'VFD Microfinance Bank',
    ],
    accountPattern: /^\d{10}$/,
    accountHint: '10-digit account number',
  },
  GH: {
    banks: ['MTN Mobile Money', 'Telecel Cash', 'AirtelTigo Money', 'GCB Bank', 'Ecobank Ghana', 'Stanbic Bank Ghana', 'Absa Ghana', 'Fidelity Bank Ghana', 'CalBank'],
    accountHint: 'Account or mobile money number',
  },
  KE: {
    banks: ['M-Pesa', 'Airtel Money', 'Equity Bank', 'KCB', 'Co-operative Bank', 'NCBA', 'Absa Kenya', 'Stanbic Kenya'],
    accountHint: 'Account or M-Pesa number',
  },
}

export function bankRulesFor(countryCode: string): BankRules {
  return BANKS_BY_COUNTRY[countryCode] ?? { banks: [], accountHint: 'Account number / IBAN' }
}

/** The text stored with the trade and shown to the trader. Keep it stable and readable. */
export function formatBankDetails(d: { bank: string; accountNumber: string; accountName: string; note?: string }) {
  return [
    `Bank: ${d.bank.trim()}`,
    `Account number: ${d.accountNumber.trim()}`,
    `Account name: ${d.accountName.trim()}`,
    ...(d.note?.trim() ? [`Note: ${d.note.trim()}`] : []),
  ].join('\n')
}
