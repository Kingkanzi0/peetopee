// Peetopee ID system — assigns each user a unique @handle and allows lookup by email.
// In production this would be a server-side registry. For the demo it uses localStorage.

const ID_REGISTRY_KEY = 'ptp_id_registry' // { email -> { ptpId, name, avatarDataUrl } }
const MY_ID_KEY = 'ptp_my_id'

export interface PtpIdRecord {
  ptpId: string      // e.g. "@reeky123"
  email: string
  name: string
  avatarDataUrl?: string
  /** chainId (as string) → EVM address. Linked when the user connects a wallet. */
  walletAddresses?: Record<string, `0x${string}`>
}

/**
 * Link an EVM wallet address to this user's Peetopee ID.
 * Called automatically when the user connects a wallet.
 */
export function linkWallet(email: string, chainId: number, address: `0x${string}`): void {
  const registry = loadRegistry()
  const record = registry[email]
  if (!record) return
  registry[email] = {
    ...record,
    walletAddresses: { ...(record.walletAddresses ?? {}), [String(chainId)]: address },
  }
  saveRegistry(registry)
}

/**
 * Get the wallet address for a recipient on a given chain.
 * Returns null if the recipient has no linked wallet on that chain.
 */
export function getWalletAddress(record: PtpIdRecord, chainId: number): `0x${string}` | null {
  return record.walletAddresses?.[String(chainId)] ?? null
}

function loadRegistry(): Record<string, PtpIdRecord> {
  try {
    const raw = localStorage.getItem(ID_REGISTRY_KEY)
    return raw ? (JSON.parse(raw) as Record<string, PtpIdRecord>) : {}
  } catch { return {} }
}

function saveRegistry(r: Record<string, PtpIdRecord>) {
  localStorage.setItem(ID_REGISTRY_KEY, JSON.stringify(r))
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10)
}

function generateId(name: string, email: string): string {
  const base = slugify(name) || slugify(email.split('@')[0]) || 'user'
  const suffix = Math.floor(1000 + Math.random() * 8999)
  return `@${base}${suffix}`
}

export function registerPtpId(email: string, name: string, avatarDataUrl?: string): PtpIdRecord {
  const registry = loadRegistry()
  if (registry[email]) {
    // Update name/avatar but keep the same ID
    registry[email] = { ...registry[email], name, avatarDataUrl }
    saveRegistry(registry)
    localStorage.setItem(MY_ID_KEY, registry[email].ptpId)
    return registry[email]
  }
  const record: PtpIdRecord = { ptpId: generateId(name, email), email, name, avatarDataUrl }
  registry[email] = record
  saveRegistry(registry)
  localStorage.setItem(MY_ID_KEY, record.ptpId)
  return record
}

export function getMyPtpId(): string | null {
  return localStorage.getItem(MY_ID_KEY)
}

export function lookupByEmail(email: string): PtpIdRecord | null {
  const registry = loadRegistry()
  return registry[email.toLowerCase().trim()] ?? null
}

export function updateHandle(email: string, newHandle: string): boolean {
  const registry = loadRegistry()
  const record = registry[email]
  if (!record) return false
  const handle = newHandle.startsWith('@') ? newHandle : `@${newHandle}`
  // Check uniqueness
  const taken = Object.values(registry).some(r => r.ptpId === handle && r.email !== email)
  if (taken) return false
  registry[email] = { ...record, ptpId: handle }
  saveRegistry(registry)
  localStorage.setItem(MY_ID_KEY, handle)
  return true
}

export function lookupByPtpId(ptpId: string): PtpIdRecord | null {
  const registry = loadRegistry()
  const normalised = ptpId.startsWith('@') ? ptpId : `@${ptpId}`
  return Object.values(registry).find(r => r.ptpId === normalised) ?? null
}

/** Seed demo Peetopee users so the lookup flow works in demos without needing
 *  a second real device. Safe to call on every app load — skips already-seeded users. */
export function seedDemoUsers(): void {
  const registry = loadRegistry()
  const DEMO_USERS: PtpIdRecord[] = [
    {
      ptpId: '@demo_nigeria',
      email: 'demo.nigeria@peetopee.app',
      name: 'Chukwudi Okafor',
      walletAddresses: {
        '5042002': '0x742d35Cc6634C0532925a3b8D4C9f44Abe3e3501',
        '84532':   '0x742d35Cc6634C0532925a3b8D4C9f44Abe3e3501',
      },
    },
    {
      ptpId: '@alex_vn',
      email: 'alex.nguyen@peetopee.app',
      name: 'Alex Nguyen',
      walletAddresses: {
        '5042002': '0x8Ba1f109551bD432803012645Ac136ddd64DBA72',
        '84532':   '0x8Ba1f109551bD432803012645Ac136ddd64DBA72',
      },
    },
    {
      ptpId: '@marie_fr',
      email: 'marie.dupont@peetopee.app',
      name: 'Marie Dupont',
      walletAddresses: {
        '5042002': '0xdD2FD4581271e230360230F9337D5c0430Bf44C0',
        '84532':   '0xdD2FD4581271e230360230F9337D5c0430Bf44C0',
      },
    },
    {
      ptpId: '@kwame_gh',
      email: 'kwame.asante@peetopee.app',
      name: 'Kwame Asante',
      walletAddresses: {
        '5042002': '0x5B38Da6a701c568545dCfcB03FcB875f56beddC4',
      },
    },
    {
      ptpId: '@priya_in',
      email: 'priya.sharma@peetopee.app',
      name: 'Priya Sharma',
      walletAddresses: {
        '5042002': '0xAb8483F64d9C6d1EcF9b849Ae677dD3315835cb2',
        '421614':  '0xAb8483F64d9C6d1EcF9b849Ae677dD3315835cb2',
      },
    },
  ]

  let changed = false
  for (const user of DEMO_USERS) {
    if (!registry[user.email]) {
      registry[user.email] = user
      changed = true
    }
  }
  if (changed) saveRegistry(registry)
}
