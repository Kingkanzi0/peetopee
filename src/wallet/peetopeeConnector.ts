/**
 * peetopeeConnector — plugs the built-in wallet's Funds (trading) account into
 * wagmi, so every screen that uses wagmi hooks (Sell, Trader dashboard, Trade
 * status, Funds) works on phones and desktops with no browser extension.
 *
 * Transactions are signed in the page with the Funds key (only available after
 * the PIN/biometric unlock) and sent to Arc Testnet. Read calls go straight to
 * the Arc RPC.
 */
import { createConnector } from 'wagmi'
import {
  createPublicClient, createWalletClient, getAddress, numberToHex, fromHex,
  SwitchChainError, UserRejectedRequestError,
  type EIP1193Provider, type Hex, type Address,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from 'viem/chains'
import { arcTransport } from './arcNetwork'
import { getFundsPrivateKey, isWalletUnlocked, loadStoredWallet, subscribeWallet } from './standaloneWallet'

export const PEETOPEE_CONNECTOR_ID = 'peetopee'

const publicClient = createPublicClient({ chain: arcTestnet, transport: arcTransport() })

function fundsAccount() {
  const key = getFundsPrivateKey()
  if (!key) throw new UserRejectedRequestError(new Error('Unlock Peetopee to continue.'))
  return privateKeyToAccount(key)
}

function currentAccounts(): Address[] {
  const w = loadStoredWallet()
  return isWalletUnlocked() && w ? [getAddress(w.fundsAddress)] : []
}

type TxParams = { to?: Address; data?: Hex; value?: Hex; gas?: Hex; nonce?: Hex }

const provider = {
  async request({ method, params }: { method: string; params?: unknown[] }): Promise<unknown> {
    switch (method) {
      case 'eth_accounts':
      case 'eth_requestAccounts':
        return currentAccounts()
      case 'eth_chainId':
        return numberToHex(arcTestnet.id)
      case 'wallet_switchEthereumChain': {
        const { chainId } = (params?.[0] ?? {}) as { chainId?: Hex }
        if (chainId && fromHex(chainId, 'number') !== arcTestnet.id) {
          throw new SwitchChainError(new Error('Peetopee Wallet works on Arc Testnet only.'))
        }
        return null
      }
      case 'eth_sendTransaction': {
        const tx = (params?.[0] ?? {}) as TxParams
        const account = fundsAccount()
        const wallet = createWalletClient({ account, chain: arcTestnet, transport: arcTransport() })
        return wallet.sendTransaction({
          account,
          chain: arcTestnet,
          to: tx.to,
          data: tx.data,
          value: tx.value ? fromHex(tx.value, 'bigint') : undefined,
          gas: tx.gas ? fromHex(tx.gas, 'bigint') : undefined,
        })
      }
      case 'personal_sign': {
        const [data] = (params ?? []) as [Hex]
        return fundsAccount().signMessage({ message: { raw: data } })
      }
      case 'eth_signTypedData_v4': {
        const [, typed] = (params ?? []) as [Address, string]
        return fundsAccount().signTypedData(JSON.parse(typed))
      }
      default:
        return publicClient.request({ method, params } as never)
    }
  },
  on() { /* events are emitted through wagmi's emitter below */ },
  removeListener() { /* no-op */ },
} as unknown as EIP1193Provider

export function peetopeeWallet() {
  return createConnector<EIP1193Provider>((config) => {
    let unsubscribe: (() => void) | undefined
    return {
      id: PEETOPEE_CONNECTOR_ID,
      name: 'Peetopee Wallet',
      type: 'peetopee',

      async setup() {
        unsubscribe?.()
        unsubscribe = subscribeWallet(() => {
          const accounts = currentAccounts()
          if (accounts.length === 0) config.emitter.emit('disconnect')
          else config.emitter.emit('change', { accounts })
        })
      },

      async connect(params?: { chainId?: number; withCapabilities?: boolean }) {
        const accounts = currentAccounts()
        if (accounts.length === 0) throw new UserRejectedRequestError(new Error('Unlock Peetopee first.'))
        return {
          accounts: params?.withCapabilities ? accounts.map(address => ({ address, capabilities: {} })) : accounts,
          chainId: arcTestnet.id,
        } as never
      },

      async disconnect() { /* the key stays on the device; nothing to tear down */ },
      async getAccounts() { return currentAccounts() },
      async getChainId() { return arcTestnet.id },
      async getProvider() { return provider },
      async isAuthorized() { return currentAccounts().length > 0 },

      async switchChain({ chainId }: { chainId: number }) {
        const chain = config.chains.find(c => c.id === chainId)
        if (!chain || chainId !== arcTestnet.id) {
          throw new SwitchChainError(new Error('Peetopee Wallet works on Arc Testnet only.'))
        }
        return chain
      },

      onAccountsChanged(accounts: string[]) {
        if (accounts.length === 0) config.emitter.emit('disconnect')
        else config.emitter.emit('change', { accounts: accounts.map(a => getAddress(a)) })
      },
      onChainChanged(chain: string) {
        config.emitter.emit('change', { chainId: Number(chain) })
      },
      async onDisconnect() {
        config.emitter.emit('disconnect')
      },
    }
  })
}
