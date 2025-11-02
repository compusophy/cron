import { useState } from 'react'
import { Copy, Check, ExternalLink } from 'lucide-react'
import useSWR from 'swr'
import BalancesCard from './BalancesCard'

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

interface CronJob {
  id: string
  name?: string
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
  cronJobs?: CronJob[]
  onCreateCronJob?: () => void
  onPauseCronJob?: (jobId: string) => void
  onEditCronJob?: (jobId: string) => void
  onDeleteCronJob?: (jobId: string) => void
  onSend?: (wallet: Wallet) => void
  onSwap?: (wallet: Wallet) => void
  onDrain?: (wallet: Wallet) => void
  onViewLogs?: (wallet: Wallet) => void
  onAddChild?: (wallet: Wallet) => void
  onAssignParent?: (wallet: Wallet) => void
}

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export default function WalletCard({ wallet, copiedAddress, onCopyAddress, onShowPrivateKey, onDelete, variant = 'master', parentName, cronJobs = [], onCreateCronJob, onPauseCronJob, onEditCronJob, onDeleteCronJob, onSend, onSwap, onDrain, onViewLogs, onAddChild, onAssignParent }: WalletCardProps) {
  const balanceKey = `/api/wallets/balances?address=${wallet.address}&walletId=${wallet.id}`
  const { data: balanceData } = useSWR<{ balances: Balances }>(balanceKey, fetcher, {
    revalidateOnFocus: false,
  })

  const balances = balanceData?.balances

  // Get task label for a job
  const getTaskLabel = (jobType: string) => {
    const typeLabels: Record<string, string> = {
      'eth_transfer': 'task: send',
      'swap': 'task: swap',
      'token_swap': 'task: swap',
    }
    return typeLabels[jobType] || 'task: idle'
  }

  return (
    <div className="p-4 border border-gray-200 rounded-lg hover:shadow-sm transition-shadow relative">
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h4 className="text-base font-semibold">{wallet.name}</h4>
          </div>
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

          {/* Cron Jobs */}
          {cronJobs.length > 0 && (
            <div className="mt-4 border-t border-gray-200 pt-3">
              <div className="flex flex-col gap-2">
                {cronJobs.map((job) => (
                  <div key={job.id} className="flex items-center justify-between border border-gray-300 rounded px-3 py-2 bg-gray-50">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{job.name || `Job ${job.id.slice(-6)}`}</span>
                        <span className="text-xs text-gray-600">{getTaskLabel(job.type)}</span>
                        {job.enabled ? (
                          <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">
                            Active
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs font-medium">
                            Paused
                          </span>
                        )}
                      </div>
                    </div>
                    <CronJobMenu
                      job={job}
                      onPauseCronJob={onPauseCronJob}
                      onEditCronJob={onEditCronJob}
                      onDeleteCronJob={onDeleteCronJob}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Create job button */}
          {onCreateCronJob && (
            <div className="mt-2">
              <button
                onClick={onCreateCronJob}
                className="inline-flex items-center rounded-md border border-indigo-300 px-3 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
              >
                + Create Cron Job
              </button>
            </div>
          )}

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
          <BalancesCard balances={balances} />
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
          cronJobs={cronJobs}
        />
      </div>
    </div>
  )
}

interface CronJobMenuProps {
  job: CronJob
  onPauseCronJob?: (jobId: string) => void
  onEditCronJob?: (jobId: string) => void
  onDeleteCronJob?: (jobId: string) => void
}

function CronJobMenu({ job, onPauseCronJob, onEditCronJob, onDeleteCronJob }: CronJobMenuProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null)

  return (
    <div className="relative ml-3 flex-shrink-0">
      <button
        onClick={() => setOpenMenu(openMenu === job.id ? null : job.id)}
        className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
        title="Menu"
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
        </svg>
      </button>

      {openMenu === job.id && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />
          <div className="absolute right-0 top-8 z-20 w-48 bg-white border border-gray-200 rounded-md shadow-lg">
            <div className="py-1">
              {onPauseCronJob && (
                <button
                  onClick={() => {
                    onPauseCronJob(job.id)
                    setOpenMenu(null)
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  {job.enabled ? 'Pause Job' : 'Resume Job'}
                </button>
              )}
              {onEditCronJob && (
                <button
                  onClick={() => {
                    onEditCronJob(job.id)
                    setOpenMenu(null)
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  Edit Job
                </button>
              )}
              {onDeleteCronJob && (
                <button
                  onClick={() => {
                    onDeleteCronJob(job.id)
                    setOpenMenu(null)
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-red-700 hover:bg-red-50"
                >
                  Delete Job
                </button>
              )}
            </div>
          </div>
        </>
      )}
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
  cronJobs?: CronJob[]
}

function WalletMenu({ wallet, onShowPrivateKey, onDelete, onDrain, onViewLogs, onAddChild, onAssignParent, onCreateCronJob, cronJobs = [] }: WalletMenuProps) {
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
