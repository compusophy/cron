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

  const validateName = (name: string): string | null => {
    if (!parentWallet) {
      // Master wallet - no validation needed
      return null
    }

    if (!name.trim()) {
      return 'Wallet name is required'
    }

    if (!name.startsWith(requiredPrefix)) {
      return `Child wallet name must start with "${requiredPrefix}"`
    }

    // Check that after the prefix, there's a valid number
    const suffix = name.slice(requiredPrefix.length)
    if (!suffix || !/^\d+$/.test(suffix)) {
      return `Name must end with a number after "${requiredPrefix}"`
    }

    return null
  }

  const [formData, setFormData] = useState({
    name: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const { showToast } = useToast()

  useEffect(() => {
    if (isOpen) {
      setFormData({ name: defaultName })
      setError(null)
      setValidationError(null)
    } else {
      setFormData({ name: '' })
      setError(null)
      setValidationError(null)
    }
  }, [isOpen, defaultName])

  const handleNameChange = (value: string) => {
    setFormData({ name: value })
    if (parentWallet) {
      const validation = validateName(value)
      setValidationError(validation)
    } else {
      setValidationError(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Validate name if it's a child wallet
    if (parentWallet) {
      const validation = validateName(formData.name)
      if (validation) {
        setValidationError(validation)
        setLoading(false)
        return
      }
    }

    // Ensure name is provided for child wallets
    if (parentWallet && !formData.name.trim()) {
      setValidationError('Wallet name is required')
      setLoading(false)
      return
    }

    try {
      const response = await fetch('/api/wallets/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          parentId: parentWallet?.id ?? null,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create wallet')
      }

      const createdName = data.wallet?.name || formData.name || 'Wallet'
      setFormData({ name: '' })
      onWalletCreated()
      showToast({
        type: 'success',
        message: parentWallet
          ? `Child wallet “${createdName}” created under ${parentWallet.name}`
          : `Master wallet “${createdName}” created`,
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

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
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
            {parentWallet && (
              <div className="text-xs text-gray-600 bg-gray-50 px-2 py-1 rounded border border-gray-200">
                Required prefix: <span className="font-mono font-semibold">{requiredPrefix}</span>
              </div>
            )}
            <input
              id="name"
              type="text"
              value={formData.name}
              onChange={(e) => handleNameChange(e.target.value)}
              className={`px-3 py-2 border rounded-md ${
                validationError
                  ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                  : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
              }`}
              placeholder={parentWallet ? defaultName : 'My Wallet'}
              required={!!parentWallet}
            />
            {validationError && (
              <p className="text-xs text-red-600">{validationError}</p>
            )}
            {parentWallet && !validationError && formData.name && (
              <p className="text-xs text-green-600">✓ Name format is valid</p>
            )}
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

