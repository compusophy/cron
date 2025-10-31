import { useState } from 'react'
import useSWR from 'swr'

interface CronJob {
  id: string
  name: string
  schedule: string
  type: string
  toAddress: string
  amount: string
  address: string
  createdAt: number
  lastRunTime: number | null
  enabled: boolean
}

interface Wallet {
  id: string
  name: string
  address: string
  createdAt: number
}

interface CronJobFormProps {
  onJobCreated: () => void
  isOpen: boolean
  onClose: () => void
}

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export default function CronJobForm({ onJobCreated, isOpen, onClose }: CronJobFormProps) {
  const { data: walletsData } = useSWR<{ wallets: Wallet[] }>('/api/wallets/list', fetcher)
  const wallets = walletsData?.wallets || []

  const [formData, setFormData] = useState({
    name: '',
    schedule: '* * * * *',
    type: 'eth_transfer' as 'eth_transfer' | 'swap',
    toAddress: '',
    amount: '0.0000001',
    chain: 'base',
    walletId: '',
    fromToken: 'ETH' as 'ETH' | 'USDC',
    toToken: 'USDC' as 'ETH' | 'USDC',
    swapAmount: '0.0000001',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/cron/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create cron job')
      }

          setFormData({
            name: '',
            schedule: '* * * * *',
            type: 'eth_transfer',
            toAddress: '',
            amount: '0.0000001',
            chain: 'base',
            walletId: '',
            fromToken: 'ETH',
            toToken: 'USDC',
            swapAmount: '0.0000001',
          })
      onJobCreated()
      onClose()
    } catch (err: any) {
      setError(err.message)
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
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <h3 className="text-xl font-semibold">Create New Cron Job</h3>
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
          Job Name
        </label>
        <input
          id="name"
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="px-3 py-2 border border-gray-300 rounded-md"
          required
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="type" className="text-sm font-medium">
          Job Type
        </label>
        <select
          id="type"
          value={formData.type}
          onChange={(e) => setFormData({ ...formData, type: e.target.value as 'eth_transfer' | 'swap' })}
          className="px-3 py-2 border border-gray-300 rounded-md"
          required
        >
          <option value="eth_transfer">ETH Transfer</option>
          <option value="swap">Swap (ETH ↔ USDC)</option>
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="schedule" className="text-sm font-medium">
          Cron Schedule <span className="text-gray-500">(* * * * *)</span>
        </label>
        <input
          id="schedule"
          type="text"
          value={formData.schedule}
          onChange={(e) => setFormData({ ...formData, schedule: e.target.value })}
          className="px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
          placeholder="* * * * *"
          required
        />
        <p className="text-xs text-gray-500">
          Examples: <code className="bg-gray-100 px-1 rounded">* * * * *</code> (every minute),{' '}
          <code className="bg-gray-100 px-1 rounded">*/10 * * * *</code> (every 10 minutes)
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="walletId" className="text-sm font-medium">
          From Wallet
        </label>
        <select
          id="walletId"
          value={formData.walletId}
          onChange={(e) => setFormData({ ...formData, walletId: e.target.value })}
          className="px-3 py-2 border border-gray-300 rounded-md"
          required
        >
          <option value="">Select a wallet</option>
          {wallets.map((wallet) => (
            <option key={wallet.id} value={wallet.id}>
              {wallet.name} ({wallet.address.slice(0, 6)}...{wallet.address.slice(-4)})
            </option>
          ))}
        </select>
        {wallets.length === 0 && (
          <p className="text-xs text-gray-500">
            No wallets available. <a href="#" onClick={(e) => { e.preventDefault(); onClose(); }} className="text-blue-600 hover:underline">Create one first</a>.
          </p>
        )}
      </div>

      {formData.type === 'eth_transfer' ? (
        <>
          <div className="flex flex-col gap-2">
            <label htmlFor="toAddress" className="text-sm font-medium">
              Recipient Address
            </label>
            <input
              id="toAddress"
              type="text"
              value={formData.toAddress}
              onChange={(e) => setFormData({ ...formData, toAddress: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
              placeholder="0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
              required={formData.type === 'eth_transfer'}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="amount" className="text-sm font-medium">
              Amount (ETH)
            </label>
                <input
                  id="amount"
                  type="number"
                  step="0.000001"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="0.0000001"
                  required={formData.type === 'eth_transfer'}
                />
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <label htmlFor="fromToken" className="text-sm font-medium">
              From Token
            </label>
            <select
              id="fromToken"
              value={formData.fromToken}
              onChange={(e) => {
                const newFromToken = e.target.value as 'ETH' | 'USDC'
                setFormData({ 
                  ...formData, 
                  fromToken: newFromToken,
                  toToken: newFromToken === 'ETH' ? 'USDC' : 'ETH'
                })
              }}
              className="px-3 py-2 border border-gray-300 rounded-md"
              required={formData.type === 'swap'}
            >
              <option value="ETH">ETH</option>
              <option value="USDC">USDC</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="toToken" className="text-sm font-medium">
              To Token
            </label>
            <select
              id="toToken"
              value={formData.toToken}
              onChange={(e) => {
                const newToToken = e.target.value as 'ETH' | 'USDC'
                setFormData({ 
                  ...formData, 
                  toToken: newToToken,
                  fromToken: newToToken === 'ETH' ? 'USDC' : 'ETH'
                })
              }}
              className="px-3 py-2 border border-gray-300 rounded-md"
              required={formData.type === 'swap'}
            >
              <option value="ETH">ETH</option>
              <option value="USDC">USDC</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="swapAmount" className="text-sm font-medium">
              Amount ({formData.fromToken})
            </label>
                <input
                  id="swapAmount"
                  type="number"
                  step="0.000001"
                  value={formData.swapAmount}
                  onChange={(e) => setFormData({ ...formData, swapAmount: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="0.0000001"
                  required={formData.type === 'swap'}
                />
          </div>
        </>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor="chain" className="text-sm font-medium">
          Chain
        </label>
        <select
          id="chain"
          value={formData.chain}
          onChange={(e) => setFormData({ ...formData, chain: e.target.value })}
          className="px-3 py-2 border border-gray-300 rounded-md"
          required
        >
          <option value="base">Base</option>
          <option value="sepolia">Sepolia</option>
          <option value="mainnet">Ethereum Mainnet</option>
        </select>
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
              {loading ? 'Creating...' : 'Create Cron Job'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

