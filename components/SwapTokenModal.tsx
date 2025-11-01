import { useEffect, useState } from 'react'
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
  amount: string
  tokenAddress: string
  chain: string
}

export default function SwapTokenModal({ isOpen, onClose, wallet, defaultTokenAddress, onSuccess }: SwapTokenModalProps) {
  const [formData, setFormData] = useState<FormState>({
    amount: '0.0001',
    tokenAddress: defaultTokenAddress,
    chain: 'base',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { showToast } = useToast()

  if (!isOpen) return null

  useEffect(() => {
    setFormData((prev) => ({ ...prev, tokenAddress: defaultTokenAddress }))
  }, [defaultTokenAddress, wallet.id])

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !loading) {
      onClose()
    }
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
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to perform swap')
      }

      showToast({
        type: 'success',
        message: `Swap queued: ${formData.amount} ETH → token at ${formData.tokenAddress.slice(0, 6)}...${formData.tokenAddress.slice(-4)}`,
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
      onClick={handleBackdropClick}
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
            <label htmlFor="swap-amount" className="text-sm font-medium text-gray-700">
              Amount (ETH)
            </label>
            <input
              id="swap-amount"
              type="number"
              step="0.00000001"
              min="0"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring"
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="swap-token-address" className="text-sm font-medium text-gray-700">
              Token Address
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
