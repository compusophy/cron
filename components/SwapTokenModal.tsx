import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { useToast } from './ToastProvider'

interface SwapTokenModalProps {
  isOpen: boolean
  onClose: () => void
  wallet: {
    id: string
    name: string
    address: string
  }
  defaultTokenAddress: string
  onSuccess?: (txHash: string) => void
}

interface FormState {
  swapDirection: 'eth_to_token' | 'token_to_eth'
  amount: string
  tokenAddress: string
  chain: string
  useMax: boolean
}

interface TokenBalance {
  address: string
  symbol: string
  name: string
  balance: string
  decimals: number
}

interface Balances {
  eth: string
  weth: string
  usdc: string
  testCoin: string
  tokens?: TokenBalance[]
}

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export default function SwapTokenModal({ isOpen, onClose, wallet, defaultTokenAddress, onSuccess }: SwapTokenModalProps) {
  const [formData, setFormData] = useState<FormState>({
    swapDirection: 'eth_to_token',
    amount: '0.0001',
    tokenAddress: defaultTokenAddress,
    chain: 'base',
    useMax: false,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { showToast } = useToast()

  // Fetch balances for Max feature
  const balanceKey = `/api/wallets/balances?address=${wallet.address}&walletId=${wallet.id}`
  const { data: balanceData } = useSWR<{ balances: Balances }>(isOpen ? balanceKey : null, fetcher)
  const balances = balanceData?.balances

  if (!isOpen) return null

  useEffect(() => {
    setFormData((prev) => ({ ...prev, tokenAddress: defaultTokenAddress }))
  }, [defaultTokenAddress, wallet.id])

  // Get current balance for Max feature
  const getCurrentBalance = (): string => {
    if (formData.swapDirection === 'eth_to_token') {
      return balances?.eth || '0'
    } else {
      // Find token balance
      const token = balances?.tokens?.find(t => t.address.toLowerCase() === formData.tokenAddress.toLowerCase())
      if (token) {
        return token.balance
      }
      // Check standard tokens
      const lowerToken = formData.tokenAddress.toLowerCase()
      if (lowerToken === '0x4200000000000000000000000000000000000006') {
        return balances?.weth || '0'
      }
      if (lowerToken === '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913') {
        return balances?.usdc || '0'
      }
      const testCoinAddr = (process.env.NEXT_PUBLIC_DEFAULT_TOKEN_ADDRESS || '0x4961015f34b0432e86e6d9841858c4ff87d4bb07').toLowerCase()
      if (lowerToken === testCoinAddr) {
        return balances?.testCoin || '0'
      }
      return '0'
    }
  }

  // Update amount when Max is enabled and balance/token changes
  useEffect(() => {
    if (formData.useMax && balances) {
      const balance = getCurrentBalance()
      if (balance !== formData.amount) {
        setFormData(prev => ({ ...prev, amount: balance }))
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.useMax, formData.swapDirection, formData.tokenAddress, balances?.eth, balances?.weth, balances?.usdc, balances?.testCoin, balances?.tokens])

  const handleMaxToggle = () => {
    const newUseMax = !formData.useMax
    if (newUseMax) {
      const balance = getCurrentBalance()
      setFormData({ ...formData, useMax: true, amount: balance })
    } else {
      setFormData({ ...formData, useMax: false })
    }
  }

  const handleSwapDirectionChange = (direction: 'eth_to_token' | 'token_to_eth') => {
    setFormData({ ...formData, swapDirection: direction, useMax: false, amount: direction === 'eth_to_token' ? '0.0001' : '0' })
  }


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/wallets/swap-once', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletId: wallet.id,
          amount: formData.amount,
          chain: formData.chain,
          tokenAddress: formData.tokenAddress,
          swapDirection: formData.swapDirection,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to perform swap')
      }

      const directionLabel = formData.swapDirection === 'eth_to_token' ? 'ETH → Token' : 'Token → ETH'
      showToast({
        type: 'success',
        message: `Swap queued: ${formData.amount} ${directionLabel} at ${formData.tokenAddress.slice(0, 6)}...${formData.tokenAddress.slice(-4)}`,
      })
      if (onSuccess) onSuccess(data.txHash)
      onClose()
    } catch (err: any) {
      setError(err.message || 'Unexpected error occurred')
      showToast({
        type: 'error',
        message: err.message || 'Failed to perform swap',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
    >
      <div className="max-w-lg w-full rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 p-4">
          <div>
            <h3 className="text-lg font-semibold">Swap</h3>
            <p className="mt-1 text-xs text-gray-500">
              From <span className="font-mono">{wallet.name}</span> ({wallet.address.slice(0, 6)}...{wallet.address.slice(-4)})
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-2xl font-bold text-gray-400 hover:text-gray-600"
            disabled={loading}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-700">
              Swap Direction
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleSwapDirectionChange('eth_to_token')}
                className={`flex-1 rounded-md border px-3 py-2 text-sm ${
                  formData.swapDirection === 'eth_to_token'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                ETH → Token
              </button>
              <button
                type="button"
                onClick={() => handleSwapDirectionChange('token_to_eth')}
                className={`flex-1 rounded-md border px-3 py-2 text-sm ${
                  formData.swapDirection === 'token_to_eth'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Token → ETH
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label htmlFor="swap-amount" className="text-sm font-medium text-gray-700">
                Amount {formData.swapDirection === 'eth_to_token' ? '(ETH)' : '(Tokens)'}
              </label>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={formData.useMax}
                    onChange={handleMaxToggle}
                    className="rounded border-gray-300"
                  />
                  Max
                </label>
                {formData.useMax && (
                  <span className="text-xs text-gray-500">
                    Balance: {parseFloat(getCurrentBalance()).toFixed(6)}
                  </span>
                )}
              </div>
            </div>
            <input
              id="swap-amount"
              type="number"
              step="0.00000001"
              min="0"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value, useMax: false })}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring"
              required
              disabled={formData.useMax}
            />
          </div>

          {formData.swapDirection === 'token_to_eth' && (
            <div className="flex flex-col gap-2">
              <label htmlFor="swap-token-address" className="text-sm font-medium text-gray-700">
                Token Address (to sell)
              </label>
              <input
                id="swap-token-address"
                type="text"
                value={formData.tokenAddress}
                onChange={(e) => {
                  setFormData({ ...formData, tokenAddress: e.target.value, useMax: false })
                }}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring"
                required
              />
              <p className="text-xs text-gray-500">
                Defaults to TestCoin ({defaultTokenAddress.slice(0, 6)}...{defaultTokenAddress.slice(-4)}).
              </p>
            </div>
          )}
          {formData.swapDirection === 'eth_to_token' && (
            <div className="flex flex-col gap-2">
              <label htmlFor="swap-token-address" className="text-sm font-medium text-gray-700">
                Token Address (to buy)
              </label>
              <input
                id="swap-token-address"
                type="text"
                value={formData.tokenAddress}
                onChange={(e) => setFormData({ ...formData, tokenAddress: e.target.value })}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring"
                required
              />
              <p className="text-xs text-gray-500">
                Defaults to TestCoin ({defaultTokenAddress.slice(0, 6)}...{defaultTokenAddress.slice(-4)}).
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label htmlFor="swap-chain" className="text-sm font-medium text-gray-700">
              Chain
            </label>
            <select
              id="swap-chain"
              value={formData.chain}
              onChange={(e) => setFormData({ ...formData, chain: e.target.value })}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring"
            >
              <option value="base">Base</option>
            </select>
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
              disabled={loading}
            >
              {loading ? 'Swapping…' : 'Swap'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
