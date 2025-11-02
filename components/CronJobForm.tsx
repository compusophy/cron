import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { useToast } from './ToastProvider'
import { BASE_TOKEN_ADDRESSES } from '@/lib/token-constants'

interface CronJob {
  id: string
  name?: string
  schedule?: string
  type: string
  toAddress?: string
  amount?: string
  address?: string
  createdAt?: number
  lastRunTime?: number | null
  enabled: boolean
  walletId?: string
  parentWalletId?: string // Legacy field for backward compatibility
  fromToken?: 'ETH' | 'USDC'
  toToken?: 'ETH' | 'USDC'
  swapAmount?: string
  tokenAddress?: string
  chain?: string
  swapDirection?: 'eth_to_token' | 'token_to_eth'
  useMax?: boolean
  priority?: number
}

type WalletType = 'master' | 'worker'

interface Wallet {
  id: string
  name: string
  address: string
  createdAt: number
  type: WalletType
  parentId?: string | null
}

interface CronJobFormProps {
  onJobCreated: () => void
  isOpen: boolean
  onClose: () => void
  defaultWalletId?: string
  jobId?: string
}

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export default function CronJobForm({ onJobCreated, isOpen, onClose, defaultWalletId, jobId }: CronJobFormProps) {
  const { data: walletsData } = useSWR<{ wallets: Wallet[] }>('/api/wallets/list', fetcher)
  const { data: jobsData } = useSWR<{ jobs: CronJob[] }>('/api/cron/list', fetcher)
  const wallets = walletsData?.wallets || []
  const jobs = jobsData?.jobs || []
  const { showToast } = useToast()

  // Get existing job if editing
  const existingJob = jobId ? jobs.find(j => j.id === jobId) : null
  const isEditMode = !!jobId

  // Get default wallet: use existing job's walletId, provided defaultWalletId, or first wallet
  const defaultWallet = existingJob?.walletId
    ? wallets.find(w => w.id === existingJob.walletId) || null
    : defaultWalletId 
    ? wallets.find(w => w.id === defaultWalletId) || wallets[0] || null
    : wallets.length > 0 ? wallets[0] : null
  
  // Auto-generate job name (not displayed to user for create mode)
  const getDefaultJobName = () => {
    return `job_${Date.now()}`
  }

  const [formData, setFormData] = useState({
    name: '',
    schedule: '* * * * *',
    type: 'token_swap' as 'eth_transfer' | 'swap' | 'token_swap',
    toAddress: '',
    amount: '0.0000001',
    useMax: false,
    chain: 'base',
    walletId: '',
    fromToken: 'ETH' as 'ETH' | 'USDC',
    toToken: 'USDC' as 'ETH' | 'USDC',
    swapAmount: '0.0000001',
    tokenAddress: BASE_TOKEN_ADDRESSES.TEST,
    swapDirection: 'eth_to_token' as 'eth_to_token' | 'token_to_eth',
    fundingAmount: '',
    priority: 0,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load existing job data when editing
  useEffect(() => {
    if (!isOpen) return

    if (isEditMode && jobId) {
      // Find the job (might be loading)
      const job = jobs.find(j => j.id === jobId)
      if (job) {
        // Job data is loaded, populate form
      setFormData({
        name: job.name || '',
        schedule: job.schedule || '* * * * *',
        type: (job.type || 'token_swap') as 'eth_transfer' | 'swap' | 'token_swap',
        toAddress: job.toAddress || '',
        amount: job.amount || '0.0000001',
        useMax: job.useMax || false,
        chain: job.chain || 'base',
        walletId: job.walletId || '',
        fromToken: (job.fromToken || 'ETH') as 'ETH' | 'USDC',
        toToken: (job.toToken || 'USDC') as 'ETH' | 'USDC',
        swapAmount: job.swapAmount || '0.0000001',
        tokenAddress: (job.tokenAddress || BASE_TOKEN_ADDRESSES.TEST) as `0x${string}`,
        swapDirection: job.swapDirection || 'eth_to_token',
        fundingAmount: '', // Don't show funding amount in edit mode
        priority: job.priority ?? 0,
      })
      }
    } else if (!isEditMode && defaultWallet) {
      // Reset to defaults for create mode
      const newWalletId = defaultWallet.id
      setFormData({
        name: getDefaultJobName(),
        schedule: '* * * * *',
        type: 'token_swap',
        toAddress: '',
        amount: '0.0000001',
        useMax: false,
        chain: 'base',
        walletId: newWalletId,
        fromToken: 'ETH',
        toToken: 'USDC',
        swapAmount: '0.0000001',
        tokenAddress: BASE_TOKEN_ADDRESSES.TEST,
        swapDirection: 'eth_to_token',
        fundingAmount: '',
        priority: 0,
      })
    }
  }, [isOpen, isEditMode, jobId, jobs, defaultWallet?.id, defaultWalletId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const url = isEditMode ? `/api/cron/update` : '/api/cron/create'
      const method = isEditMode ? 'PUT' : 'POST'
      
      const requestBody: any = {
        ...formData,
      }
      
      if (isEditMode) {
        requestBody.jobId = jobId
        // Don't send fundingAmount when editing
      } else {
        requestBody.fundingAmount = formData.fundingAmount || undefined
      }

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || `Failed to ${isEditMode ? 'update' : 'create'} cron job`)
      }

      if (!isEditMode) {
        setFormData({
          name: getDefaultJobName(),
          schedule: '* * * * *',
          type: 'token_swap',
          toAddress: '',
          amount: '0.0000001',
          useMax: false,
          chain: 'base',
          walletId: defaultWallet?.id || '',
          fromToken: 'ETH',
          toToken: 'USDC',
          swapAmount: '0.0000001',
          tokenAddress: BASE_TOKEN_ADDRESSES.TEST,
          swapDirection: 'eth_to_token',
          fundingAmount: '',
          priority: 0,
        })
      }
      
      onJobCreated()
      showToast({
        type: 'success',
        message: isEditMode ? 'Cron job updated successfully' : 'Cron job created successfully',
      })
      onClose()
    } catch (err: any) {
      setError(err.message)
      showToast({
        type: 'error',
        message: err.message || `Failed to ${isEditMode ? 'update' : 'create'} cron job`,
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
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <h3 className="text-xl font-semibold">{isEditMode ? 'Edit Cron Job' : 'Create New Cron Job'}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
          >
            ×
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
      
      {isEditMode && (
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
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor="type" className="text-sm font-medium">
          Job Type
        </label>
        <select
          id="type"
          value={formData.type}
          onChange={(e) => {
            const newType = e.target.value as 'eth_transfer' | 'swap' | 'token_swap'
            setFormData((prev) => ({
              ...prev,
              type: newType,
              ...(newType === 'swap'
                ? { fromToken: 'ETH', toToken: 'USDC' }
                : {}),
              ...(newType === 'token_swap'
                ? {
                    tokenAddress: (prev.tokenAddress || BASE_TOKEN_ADDRESSES.TEST) as `0x${string}`,
                  }
                : {}),
            }))
          }}
          className="px-3 py-2 border border-gray-300 rounded-md"
          required
        >
          <option value="eth_transfer">ETH Transfer</option>
          <option value="swap">Swap (ETH ↔ USDC)</option>
          <option value="token_swap">Swap (ETH → Token)</option>
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
        <label htmlFor="priority" className="text-sm font-medium">
          Priority <span className="text-gray-500">(higher = runs first)</span>
        </label>
        <input
          id="priority"
          type="number"
          value={formData.priority}
          onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
          className="px-3 py-2 border border-gray-300 rounded-md"
          placeholder="0"
          min="0"
        />
        <p className="text-xs text-gray-500">
          Jobs with higher priority execute first. Default: 0. For jobs with the same schedule (e.g., every minute), use priority to control execution order.
        </p>
      </div>

      {isEditMode ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="walletId" className="text-sm font-medium">
            Parent Wallet
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
        </div>
      ) : defaultWallet ? (
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">
            Wallet
          </label>
          <div className="px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-700">
            {defaultWallet.name} ({defaultWallet.address.slice(0, 6)}...{defaultWallet.address.slice(-4)})
          </div>
        </div>
      ) : null}

      {formData.type === 'eth_transfer' && (
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
      )}

      {formData.type === 'swap' && (
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

      {formData.type === 'token_swap' && (
        <>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">
              Swap Direction
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, swapDirection: 'eth_to_token' })}
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
                onClick={() => setFormData({ ...formData, swapDirection: 'token_to_eth' })}
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
            <label htmlFor="tokenAddress" className="text-sm font-medium">
              Token Address {formData.swapDirection === 'eth_to_token' ? '(to buy)' : '(to sell)'}
            </label>
            <input
              id="tokenAddress"
              type="text"
              value={formData.tokenAddress}
              onChange={(e) => setFormData({ ...formData, tokenAddress: e.target.value as `0x${string}` })}
              className="px-3 py-2 border border-gray-300 rounded-md font-mono text-sm"
              placeholder="0x0000000000000000000000000000000000000000"
              required={formData.type === 'token_swap'}
            />
            <p className="text-xs text-gray-500">Defaults to {BASE_TOKEN_ADDRESSES.TEST.slice(0, 6)}...{BASE_TOKEN_ADDRESSES.TEST.slice(-4)}</p>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label htmlFor="customSwapAmount" className="text-sm font-medium">
                Amount {formData.swapDirection === 'eth_to_token' ? '(ETH)' : '(Tokens)'}
              </label>
              <label className="flex items-center gap-1 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={formData.useMax}
                  onChange={(e) => setFormData({ ...formData, useMax: e.target.checked })}
                  className="rounded border-gray-300"
                />
                Max
              </label>
            </div>
            <input
              id="customSwapAmount"
              type="number"
              step="0.000001"
              value={formData.swapAmount}
              onChange={(e) => setFormData({ ...formData, swapAmount: e.target.value, useMax: false })}
              className="px-3 py-2 border border-gray-300 rounded-md"
              placeholder="0.0000001"
              required={formData.type === 'token_swap' && !formData.useMax}
              disabled={formData.useMax}
            />
            {formData.useMax && (
              <p className="text-xs text-gray-500">
                Will use the full {formData.swapDirection === 'eth_to_token' ? 'ETH' : 'token'} balance (minus gas fees) at execution time
              </p>
            )}
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

      {!isEditMode && (
        <div className="flex flex-col gap-2">
          <label htmlFor="fundingAmount" className="text-sm font-medium">
            Worker Wallet Funding Amount (ETH) <span className="text-gray-500 font-normal">(optional)</span>
          </label>
          <input
            id="fundingAmount"
            type="number"
            step="0.000001"
            min="0"
            value={formData.fundingAmount}
            onChange={(e) => setFormData({ ...formData, fundingAmount: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-md"
            placeholder="0.0005"
          />
          <p className="text-xs text-gray-500">
            Amount of ETH to send to the worker wallet from the parent wallet. Defaults to 0.0005 ETH if not specified.
          </p>
        </div>
      )}

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
              {loading ? (isEditMode ? 'Updating...' : 'Creating...') : (isEditMode ? 'Update Cron Job' : 'Create Cron Job')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

