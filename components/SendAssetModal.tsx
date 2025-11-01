import { useState } from 'react'
import { useToast } from './ToastProvider'

type AssetOption = {
  label: string
  value: 'ETH' | 'WETH' | 'USDC' | 'TEST'
  tokenAddress?: `0x${string}`
  decimals: number
}

const ASSET_OPTIONS: AssetOption[] = [
  { label: 'ETH (native)', value: 'ETH', decimals: 18 },
  { label: 'WETH', value: 'WETH', tokenAddress: '0x4200000000000000000000000000000000000006', decimals: 18 },
  { label: 'USDC', value: 'USDC', tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6 },
  {
    label: 'TestCoin',
    value: 'TEST',
    tokenAddress: (process.env.NEXT_PUBLIC_DEFAULT_TOKEN_ADDRESS || '0x4961015f34b0432e86e6d9841858c4ff87d4bb07') as `0x${string}`,
    decimals: 18,
  },
]

interface SendAssetModalProps {
  isOpen: boolean
  onClose: () => void
  wallet: {
    id: string
    name: string
    address: string
  }
  onSuccess?: (txHash: string) => void
}

interface FormState {
  toAddress: string
  amount: string
  chain: string
  asset: AssetOption
}

export default function SendAssetModal({ isOpen, onClose, wallet, onSuccess }: SendAssetModalProps) {
  const [formData, setFormData] = useState<FormState>({
    toAddress: '',
    amount: '0.0001',
    chain: 'base',
    asset: ASSET_OPTIONS[0],
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { showToast } = useToast()
  if (!isOpen) return null

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
      const response = await fetch('/api/wallets/send-once', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletId: wallet.id,
          toAddress: formData.toAddress,
          amount: formData.amount,
          chain: formData.chain,
          tokenAddress: formData.asset.tokenAddress,
          decimals: formData.asset.decimals,
          asset: formData.asset.value,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send asset')
      }

      const shortRecipient = `${formData.toAddress.slice(0, 6)}...${formData.toAddress.slice(-4)}`
      showToast({
        type: 'success',
        message: `Sent ${formData.amount} ${formData.asset.label} to ${shortRecipient}`,
      })
      if (onSuccess) onSuccess(data.txHash)
      onClose()
    } catch (err: any) {
      setError(err.message || 'Unexpected error occurred')
      showToast({
        type: 'error',
        message: err.message || 'Failed to send asset',
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
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 p-4">
          <div>
            <h3 className="text-lg font-semibold">Send Asset</h3>
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

        <form onSubmit={handleSubmit} className="space-y-4 p-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="asset" className="text-sm font-medium text-gray-700">
              Asset
            </label>
            <select
              id="asset"
              value={formData.asset.value}
              onChange={(e) => {
                const selected = ASSET_OPTIONS.find((opt) => opt.value === e.target.value)
                if (!selected) return
                setFormData((prev) => ({ ...prev, asset: selected }))
              }}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring"
            >
              {ASSET_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="toAddress" className="text-sm font-medium text-gray-700">
              Recipient Address
            </label>
            <input
              id="toAddress"
              type="text"
              value={formData.toAddress}
              onChange={(e) => setFormData({ ...formData, toAddress: e.target.value })}
              placeholder="0x..."
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring"
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="amount" className="text-sm font-medium text-gray-700">
              Amount
            </label>
            <input
              id="amount"
              type="number"
              step="0.00000001"
              min="0"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring"
              required
            />
            <p className="text-xs text-gray-500">Amount is interpreted with {formData.asset.decimals} decimals.</p>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="chain" className="text-sm font-medium text-gray-700">
              Chain
            </label>
            <select
              id="chain"
              value={formData.chain}
              onChange={(e) => setFormData({ ...formData, chain: e.target.value })}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring"
            >
              <option value="base">Base</option>
              <option value="sepolia">Sepolia</option>
              <option value="mainnet">Mainnet</option>
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
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-indigo-300"
              disabled={loading}
            >
              {loading ? 'Sending…' : 'Send'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

