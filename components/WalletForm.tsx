import { useState, useEffect, useMemo } from 'react'
import { useToast } from './ToastProvider'

interface WalletFormProps {
  onWalletCreated: () => void
  isOpen: boolean
  onClose: () => void
  parentWallet?: {
    id: string
    name: string
    address: string
  } | null
  allWallets?: Array<{ id: string; name: string; parentId?: string | null }>
}

export default function WalletForm({ onWalletCreated, isOpen, onClose, parentWallet = null, allWallets = [] }: WalletFormProps) {
  const requiredPrefix = useMemo(() => {
    if (!parentWallet) return ''
    return `${parentWallet.name}-`
  }, [parentWallet])

  const defaultName = useMemo(() => {
    if (!parentWallet) return ''

    const existingChildren = allWallets.filter((w) => w.parentId === parentWallet.id)
    const nextNumber = existingChildren.length + 1
    return `${requiredPrefix}${nextNumber}`
  }, [parentWallet, allWallets, requiredPrefix])

  const [formData, setFormData] = useState({
    name: '',
    fundingAmount: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { showToast } = useToast()

  useEffect(() => {
    if (isOpen) {
      const numberPart = parentWallet ? defaultName.slice(requiredPrefix.length) : ''
      setFormData({ 
        name: numberPart,
        fundingAmount: ''
      })
      setError(null)
    } else {
      setFormData({ name: '', fundingAmount: '' })
      setError(null)
    }
  }, [isOpen, defaultName, requiredPrefix, parentWallet])

  const handleNameChange = (value: string) => {
    // Only allow numbers for child wallets
    if (parentWallet) {
      const numericValue = value.replace(/[^0-9]/g, '')
      setFormData({ ...formData, name: numericValue })
    } else {
      setFormData({ ...formData, name: value })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Ensure name is provided for child wallets
    if (parentWallet && !formData.name.trim()) {
      setError('Wallet number is required')
      setLoading(false)
      return
    }

    // Construct full name
    const fullName = parentWallet 
      ? `${requiredPrefix}${formData.name}` 
      : formData.name

    try {
      const response = await fetch('/api/wallets/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: fullName,
          parentId: parentWallet?.id ?? null,
          fundingAmount: formData.fundingAmount || undefined,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create wallet')
      }

      const createdName = data.wallet?.name || fullName || 'Wallet'
      setFormData({ name: '', fundingAmount: '' })
      onWalletCreated()
      showToast({
        type: 'success',
        message: parentWallet
          ? `Child wallet "${createdName}" created under ${parentWallet.name}`
          : `Master wallet "${createdName}" created`,
      })
      onClose()
    } catch (err: any) {
      setError(err.message)
      showToast({
        type: 'error',
        message: err.message || 'Failed to create wallet',
      })
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
    >
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <div>
            <h3 className="text-xl font-semibold">
              {parentWallet ? 'Create Child Wallet' : 'Create Master Wallet'}
            </h3>
            {parentWallet && (
              <p className="mt-1 text-xs text-gray-500">
                Parent: <span className="font-mono">{parentWallet.name}</span> ({parentWallet.address.slice(0, 6)}...{parentWallet.address.slice(-4)})
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
          >
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="name" className="text-sm font-medium">
              Wallet Name {parentWallet && <span className="text-red-500">*</span>}
            </label>
            {parentWallet ? (
              <div className="flex items-center gap-2">
                <span className="px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-700 font-mono">
                  {requiredPrefix}
                </span>
                <input
                  id="name"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md flex-1"
                  placeholder="1"
                  required
                />
              </div>
            ) : (
              <input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => handleNameChange(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md"
                placeholder="My Wallet"
              />
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="fundingAmount" className="text-sm font-medium">
              Initial Funding Amount (ETH) <span className="text-gray-500 font-normal">(optional)</span>
            </label>
            <input
              id="fundingAmount"
              type="number"
              step="0.000001"
              min="0"
              value={formData.fundingAmount}
              onChange={(e) => setFormData({ ...formData, fundingAmount: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-md"
              placeholder="0.0"
            />
            <p className="text-xs text-gray-500">
              Amount of ETH to send to the new wallet from the parent wallet (if creating a child wallet)
            </p>
          </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
                {error}
              </div>
            )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 rounded-md font-medium shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ 
                backgroundColor: '#2563eb', 
                color: '#ffffff',
                border: 'none'
              }}
              onMouseEnter={(e) => !loading && (e.currentTarget.style.backgroundColor = '#1d4ed8')}
              onMouseLeave={(e) => !loading && (e.currentTarget.style.backgroundColor = '#2563eb')}
            >
              {loading ? 'Creating...' : parentWallet ? 'Create Child Wallet' : 'Create Master Wallet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

