import { useEffect, useMemo, useState } from 'react'
import { useToast } from './ToastProvider'

interface WalletSummary {
  id: string
  name: string
  address: string
  parentId: string | null
}

interface ReparentWalletModalProps {
  isOpen: boolean
  onClose: () => void
  wallet: WalletSummary | null
  wallets: WalletSummary[]
  onSuccess: () => void
}

function getDescendants(wallets: WalletSummary[], walletId: string): Set<string> {
  const map = wallets.reduce<Record<string, WalletSummary[]>>((acc, wallet) => {
    const key = wallet.parentId || '__root__'
    if (!acc[key]) acc[key] = []
    acc[key].push(wallet)
    return acc
  }, {})

  const descendants = new Set<string>()
  const stack = [...(map[walletId] || [])]

  while (stack.length > 0) {
    const current = stack.pop()!
    if (descendants.has(current.id)) continue
    descendants.add(current.id)
    const children = map[current.id] || []
    stack.push(...children)
  }

  return descendants
}

export default function ReparentWalletModal({ isOpen, onClose, wallet, wallets, onSuccess }: ReparentWalletModalProps) {
  const { showToast } = useToast()
  const [selectedParent, setSelectedParent] = useState<string>(wallet?.parentId ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (wallet) {
      setSelectedParent(wallet.parentId ?? '')
      setError(null)
      setLoading(false)
    }
  }, [wallet])

  const options = useMemo(() => {
    if (!wallet) return []
    const invalidIds = getDescendants(wallets, wallet.id)
    invalidIds.add(wallet.id)

    return wallets
      .filter((candidate) => !invalidIds.has(candidate.id))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [wallet, wallets])

  if (!isOpen || !wallet) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/wallets/reparent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletId: wallet.id,
          parentId: selectedParent === '' ? null : selectedParent,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update wallet parent')
      }

      if (selectedParent === '') {
        showToast({
          type: 'success',
          message: `Wallet “${wallet.name}” promoted to master`,
        })
      } else {
        const parentName = wallets.find((w) => w.id === selectedParent)?.name || 'selected parent'
        showToast({
          type: 'success',
          message: `Wallet “${wallet.name}” assigned under ${parentName}`,
        })
      }

      onSuccess()
      onClose()
    } catch (err: any) {
      const message = err.message || 'Failed to update wallet parent'
      setError(message)
      showToast({ type: 'error', message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
    >
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 p-4">
          <div>
            <h3 className="text-lg font-semibold">Update Wallet Grouping</h3>
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
          <div className="flex flex-col gap-2">
            <label htmlFor="parent-select" className="text-sm font-medium text-gray-700">
              Parent Wallet
            </label>
            <select
              id="parent-select"
              value={selectedParent}
              onChange={(e) => setSelectedParent(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring"
              disabled={loading}
            >
              <option value="">No parent (promote to master)</option>
              {options.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name} ({candidate.address.slice(0, 6)}...{candidate.address.slice(-4)})
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500">
              Assigning a parent will treat this wallet as a child of the selected wallet. Choose “No parent” to promote it to the top level.
            </p>
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
              {loading ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}


