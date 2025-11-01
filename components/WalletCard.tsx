import { useState } from 'react'
import { Copy, Check, ExternalLink } from 'lucide-react'
import useSWR from 'swr'

type WalletType = 'master' | 'worker'

interface Wallet {
  id: string
  name: string
  address: string
  createdAt: number
  type: WalletType
  parentId?: string | null
  jobId?: string | null
}

interface Balances {
  eth: string
  weth: string
  usdc: string
  testCoin: string
}

interface CronJob {
  id: string
  type: 'eth_transfer' | 'swap' | 'token_swap'
  enabled: boolean
}

interface WalletCardProps {
  wallet: Wallet
  copiedAddress: string | null
  onCopyAddress: (address: string) => void
  onShowPrivateKey: (walletId: string) => void
  onDelete: (walletId: string, walletName: string) => void
  variant?: WalletType
  parentName?: string
  cronJob?: CronJob | null
  cronJobId?: string | null
  onCreateCronJob?: () => void
  onPauseCronJob?: () => void
  onEditCronJob?: () => void
  onSend?: (wallet: Wallet) => void
  onSwap?: (wallet: Wallet) => void
  onDrain?: (wallet: Wallet) => void
  onViewLogs?: (wallet: Wallet) => void
  onAddChild?: (wallet: Wallet) => void
  onAssignParent?: (wallet: Wallet) => void
}

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export default function WalletCard({ wallet, copiedAddress, onCopyAddress, onShowPrivateKey, onDelete, variant = 'master', parentName, cronJob, cronJobId, onCreateCronJob, onPauseCronJob, onEditCronJob, onSend, onSwap, onDrain, onViewLogs, onAddChild, onAssignParent }: WalletCardProps) {
  const balanceKey = `/api/wallets/balances?address=${wallet.address}`
  const { data: balanceData } = useSWR<{ balances: Balances }>(balanceKey, fetcher, {
    revalidateOnFocus: false,
  })

  const balances = balanceData?.balances

  // Determine task label based on cron job type
  const getTaskLabel = () => {
    if (!cronJob) return 'task: idle'
    const typeLabels: Record<string, string> = {
      'eth_transfer': 'task: send',
      'swap': 'task: swap',
      'token_swap': 'task: swap',
    }
    return typeLabels[cronJob.type] || 'task: idle'
  }

  return (
    <div className="p-4 border border-gray-200 rounded-lg hover:shadow-sm transition-shadow relative">
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h4 className="text-base font-semibold">{wallet.name}</h4>
            {cronJob?.enabled && (
              <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">
                Active
              </span>
            )}
          </div>
          <p className="text-xs text-gray-600 font-medium mb-2">
            {getTaskLabel()}
          </p>
          <div className="flex items-center gap-2 mb-2">
            <p className="text-sm text-gray-500 font-mono break-all">{wallet.address}</p>
            <button
              onClick={() => onCopyAddress(wallet.address)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              title="Copy address"
            >
              <span className="sr-only">Copy address</span>
              {copiedAddress === wallet.address ? (
                <Check className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
            <a
              href={`https://basescan.org/address/${wallet.address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              title="View on BaseScan"
            >
              <span className="sr-only">View on BaseScan</span>
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>

          {(onSend || onSwap) && (
            <div className="mt-2 flex flex-wrap gap-2">
              {onSend && (
                <button
                  onClick={() => onSend(wallet)}
                  className="inline-flex items-center rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  Send
                </button>
              )}
              {onSwap && (
                <button
                  onClick={() => onSwap(wallet)}
                  className="inline-flex items-center rounded-md border border-indigo-300 px-3 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                >
                  Swap
                </button>
              )}
            </div>
          )}

          {/* Balance display */}
          <dl className="mt-3 space-y-1 text-xs">
            <div className="flex items-center justify-between">
              <dt className="text-gray-500">ETH</dt>
              <dd className="font-mono font-semibold tabular-nums">
                {balances ? parseFloat(balances.eth).toFixed(6) : '...'}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-gray-500">WETH</dt>
              <dd className="font-mono font-semibold tabular-nums">
                {balances ? parseFloat(balances.weth).toFixed(6) : '...'}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-gray-500">USDC</dt>
              <dd className="font-mono font-semibold tabular-nums">
                {balances ? parseFloat(balances.usdc).toFixed(6) : '...'}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-gray-500">TestCoin</dt>
              <dd className="font-mono font-semibold tabular-nums">
                {balances ? parseFloat(balances.testCoin).toFixed(6) : '...'}
              </dd>
            </div>
          </dl>
        </div>

        {/* 3-dot menu */}
        <WalletMenu
          wallet={wallet}
          onShowPrivateKey={onShowPrivateKey}
          onDelete={onDelete}
          onDrain={onDrain}
          onViewLogs={onViewLogs}
          onAddChild={onAddChild}
          onAssignParent={onAssignParent}
          onCreateCronJob={onCreateCronJob}
          onPauseCronJob={onPauseCronJob}
          onEditCronJob={onEditCronJob}
          cronJobEnabled={cronJob?.enabled}
        />
      </div>
    </div>
  )
}

interface WalletMenuProps {
  wallet: Wallet
  onShowPrivateKey: (walletId: string) => void
  onDelete: (walletId: string, walletName: string) => void
  onDrain?: (wallet: Wallet) => void
  onViewLogs?: (wallet: Wallet) => void
  onAddChild?: (wallet: Wallet) => void
  onAssignParent?: (wallet: Wallet) => void
  onCreateCronJob?: () => void
  onPauseCronJob?: () => void
  onEditCronJob?: () => void
  cronJobEnabled?: boolean
}

function WalletMenu({ wallet, onShowPrivateKey, onDelete, onDrain, onViewLogs, onAddChild, onAssignParent, onCreateCronJob, onPauseCronJob, onEditCronJob, cronJobEnabled }: WalletMenuProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null)

  return (
    <div className="relative ml-3 flex-shrink-0">
      <button
        onClick={() => setOpenMenu(openMenu === wallet.id ? null : wallet.id)}
        className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
        title="Menu"
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
        </svg>
      </button>

      {openMenu === wallet.id && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />
          <div className="absolute right-0 top-8 z-20 w-48 bg-white border border-gray-200 rounded-md shadow-lg">
            <div className="py-1">
                {onCreateCronJob && (
                  <button
                    onClick={() => {
                      onCreateCronJob()
                      setOpenMenu(null)
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-indigo-700 hover:bg-indigo-50 font-medium"
                  >
                    Create Cron Job
                  </button>
                )}
                {onPauseCronJob && (
                  <button
                    onClick={() => {
                      onPauseCronJob()
                      setOpenMenu(null)
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    {cronJobEnabled ? 'Pause Job' : 'Resume Job'}
                  </button>
                )}
                {onEditCronJob && (
                  <button
                    onClick={() => {
                      onEditCronJob()
                      setOpenMenu(null)
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Edit Job
                  </button>
                )}
                {onAddChild && (
                  <button
                    onClick={() => {
                      onAddChild(wallet)
                      setOpenMenu(null)
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Add Child Wallet
                  </button>
                )}
                {onAssignParent && (
                  <button
                    onClick={() => {
                      onAssignParent(wallet)
                      setOpenMenu(null)
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Change Parent / Promote
                  </button>
                )}
                {onViewLogs && (
                  <button
                    onClick={() => {
                      onViewLogs(wallet)
                      setOpenMenu(null)
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    View Logs
                  </button>
                )}
                {onShowPrivateKey && (
                  <button
                    onClick={() => {
                      onShowPrivateKey(wallet.id)
                      setOpenMenu(null)
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Show Keys
                  </button>
                )}
                {onDrain && (
                  <button
                    onClick={() => {
                      onDrain(wallet)
                      setOpenMenu(null)
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    Drain Assets
                  </button>
                )}
                <button
                  onClick={() => {
                    onDelete(wallet.id, wallet.name)
                    setOpenMenu(null)
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-red-700 hover:bg-red-50"
                >
                  Delete Wallet
                </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
