import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { useToast } from './ToastProvider'
import { STANDARD_TOKENS, BASE_TOKEN_ADDRESSES } from '@/lib/token-constants'

type AssetOption = {
  label: string
  value: 'ETH' | 'WETH' | 'USDC' | 'TEST' | 'WRPLT' | 'CUSTOM'
  tokenAddress?: `0x${string}`
  decimals: number
  symbol?: string
}

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
  wrplt: string
  tokens?: TokenBalance[]
}

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export default function SendAssetModal({ isOpen, onClose, wallet, onSuccess }: SendAssetModalProps) {
  const [formData, setFormData] = useState<FormState>({
    toAddress: '',
    amount: '0.0001',
    chain: 'base',
    asset: { label: 'ETH (native)', value: 'ETH', decimals: 18 },
    useMax: false,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { showToast } = useToast()

  // Fetch balances for Max feature and asset list
  const balanceKey = `/api/wallets/balances?address=${wallet.address}&walletId=${wallet.id}`
  const { data: balanceData } = useSWR<{ balances: Balances }>(isOpen ? balanceKey : null, fetcher)
  const balances = balanceData?.balances

  if (!isOpen) return null

  // Build dynamic asset options list
  const getAssetOptions = (): AssetOption[] => {
    const standardAssets: AssetOption[] = [
      { label: 'ETH (native)', value: 'ETH', decimals: 18 },
      ...STANDARD_TOKENS.map(token => ({
        label: token.symbol,
        value: token.symbol as 'WETH' | 'USDC' | 'TEST' | 'WRPLT',
        tokenAddress: token.address,
        decimals: token.decimals,
      })),
    ]

    // Add tracked tokens (only those with balance > 0)
    const trackedAssets: AssetOption[] = []
    if (balances?.tokens && balances.tokens.length > 0) {
      for (const token of balances.tokens) {
        // Skip if it's a standard token we already have
        const lowerAddress = token.address.toLowerCase()
        const isStandard = standardAssets.some(
          asset => asset.tokenAddress?.toLowerCase() === lowerAddress
        )
        
        if (!isStandard && parseFloat(token.balance) > 0) {
          trackedAssets.push({
            label: `${token.symbol} (${token.name})`,
            value: 'CUSTOM',
            tokenAddress: token.address as `0x${string}`,
            decimals: token.decimals,
            symbol: token.symbol,
          })
        }
      }
    }

    return [...standardAssets, ...trackedAssets]
  }

  const assetOptions = getAssetOptions()

  // Get current balance for Max feature
  // For ETH, reserve ~0.001 ETH for gas fees
  const getCurrentBalance = (): string => {
    if (formData.asset.value === 'ETH') {
      const ethBalance = parseFloat(balances?.eth || '0')
      const gasReserve = 0.001
      const maxSendable = Math.max(0, ethBalance - gasReserve)
      return maxSendable.toString()
    } else if (formData.asset.value === 'WETH') {
      return balances?.weth || '0'
    } else if (formData.asset.value === 'USDC') {
      return balances?.usdc || '0'
    } else if (formData.asset.value === 'TEST') {
      return balances?.testCoin || '0'
    } else if (formData.asset.value === 'WRPLT') {
      return balances?.wrplt || '0'
    } else if (formData.asset.value === 'CUSTOM' && formData.asset.tokenAddress) {
      // For custom tokens, find in tokens array
      const token = balances?.tokens?.find(t => t.address.toLowerCase() === formData.asset.tokenAddress?.toLowerCase())
      return token?.balance || '0'
    }
    return '0'
  }

  // Update amount when Max is enabled and asset/balances change
  useEffect(() => {
    if (formData.useMax && balances) {
      const balance = getCurrentBalance()
      if (balance !== formData.amount) {
        setFormData(prev => ({ ...prev, amount: balance }))
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.useMax, formData.asset.value, formData.asset.tokenAddress, balances?.eth, balances?.weth, balances?.usdc, balances?.testCoin, balances?.wrplt, balances?.tokens])

  // Reset to ETH if selected asset is no longer available
  useEffect(() => {
    if (formData.asset.value === 'CUSTOM' && formData.asset.tokenAddress) {
      const stillAvailable = assetOptions.some(
        opt => opt.value === 'CUSTOM' && opt.tokenAddress?.toLowerCase() === formData.asset.tokenAddress?.toLowerCase()
      )
      if (!stillAvailable && assetOptions.length > 0) {
        setFormData(prev => ({
          ...prev,
          asset: assetOptions[0], // Reset to ETH
          useMax: false,
        }))
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetOptions])

  const handleMaxToggle = () => {
    const newUseMax = !formData.useMax
    if (newUseMax) {
      const balance = getCurrentBalance()
      setFormData({ ...formData, useMax: true, amount: balance })
    } else {
      setFormData({ ...formData, useMax: false })
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
          tokenAddress: formData.asset.value === 'ETH' ? undefined : formData.asset.tokenAddress,
          decimals: formData.asset.decimals,
          asset: formData.asset.value === 'CUSTOM' ? 'ERC20' : formData.asset.value,
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
              value={`${formData.asset.value}:${formData.asset.tokenAddress || ''}`}
              onChange={(e) => {
                const selectedValue = e.target.value
                // Parse the value: "VALUE:ADDRESS" or just "VALUE"
                const [value, tokenAddress] = selectedValue.includes(':') 
                  ? selectedValue.split(':')
                  : [selectedValue, '']
                
                const selected = assetOptions.find((opt) => {
                  if (value === 'CUSTOM') {
                    return opt.value === 'CUSTOM' && opt.tokenAddress?.toLowerCase() === tokenAddress?.toLowerCase()
                  }
                  return opt.value === value
                })
                
                if (selected) {
                  setFormData((prev) => ({ ...prev, asset: selected, useMax: false }))
                }
              }}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring"
            >
              {assetOptions.map((option, idx) => {
                const optionValue = option.value === 'CUSTOM' 
                  ? `${option.value}:${option.tokenAddress || ''}`
                  : option.value
                return (
                  <option key={optionValue} value={optionValue}>
                    {option.label}
                  </option>
                )
              })}
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
            <div className="flex items-center justify-between">
              <label htmlFor="amount" className="text-sm font-medium text-gray-700">
                Amount
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
              id="amount"
              type="number"
              step="0.00000001"
              min="0"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value, useMax: false })}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring"
              required={!formData.useMax}
              disabled={formData.useMax}
            />
            <p className="text-xs text-gray-500">Amount is interpreted with {formData.asset.decimals} decimals.</p>
            {formData.useMax && (
              <p className="text-xs text-gray-500">
                Will send the full {formData.asset.label} balance (minus gas fees for ETH).
              </p>
            )}
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

