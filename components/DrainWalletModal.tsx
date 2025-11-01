import { useState } from 'react'
import { useToast } from './ToastProvider'

interface DrainWalletModalProps {
  isOpen: boolean
  onClose: () => void
  wallet: {
    id: string
    name: string
    address: string
  }
  onSuccess?: (txHashes: string[]) => void
}

export default function DrainWalletModal({ isOpen, onClose, wallet, onSuccess }: DrainWalletModalProps) {
  const [recipient, setRecipient] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { showToast } = useToast()

  if (!isOpen) return null


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/wallets/drain', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletId: wallet.id,
          recipient,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to drain wallet')
      }

      const successCount = Array.isArray(data.txHashes) ? data.txHashes.length : 0
      const shortRecipient = `${recipient.slice(0, 6)}...${recipient.slice(-4)}`
      showToast({
        type: 'success',
        message: `Drain complete. Sent assets to ${shortRecipient} (${successCount} tx)`
      })
      if (onSuccess) onSuccess(data.txHashes || [])
      onClose()
    } catch (err: any) {
      setError(err.message || 'Unexpected error occurred')
      showToast({
        type: 'error',
        message: err.message || 'Failed to drain wallet',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4"
    >
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 p-4">
          <div>
            <h3 className="text-lg font-semibold text-red-600">Drain Wallet</h3>
            <p className="mt-1 text-xs text-gray-500">
              Wallet <span className="font-mono">{wallet.name}</span> ({wallet.address.slice(0, 6)}...{wallet.address.slice(-4)})
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
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            Sends all assets (ETH and all tokens) from this wallet to the recipient address. Use with caution.
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="drain-recipient" className="text-sm font-medium text-gray-700">
              Recipient Address
            </label>
            <input
              id="drain-recipient"
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="0x..."
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring"
              required
            />
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
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
              disabled={loading}
            >
              {loading ? 'Draining…' : 'Drain Assets'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

