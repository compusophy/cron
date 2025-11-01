import useSWR from 'swr'
import { useState } from 'react'
import ms from 'ms'
import DeleteConfirmModal from './DeleteConfirmModal'
import CronJobLogsModal from './CronJobLogsModal'

interface CronJob {
  id: string
  name: string
  schedule: string
  type: 'eth_transfer' | 'swap' | 'token_swap'
  toAddress?: string
  amount?: string
  chain: string
  address: string
  createdAt: number
  lastRunTime: number | null
  enabled: boolean
  fromToken?: 'ETH' | 'USDC'
  toToken?: 'ETH' | 'USDC'
  swapAmount?: string
  tokenAddress?: string
  parentWalletId?: string
  parentWalletName?: string
  parentWalletAddress?: string
  workerWalletId?: string
  workerWalletName?: string
  fundingAmount?: string
}

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export default function CronJobList() {
  const { data, error, mutate } = useSWR<{ jobs: CronJob[] }>('/api/cron/list', fetcher)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ jobId: string; jobName: string } | null>(null)
  const [pausingJob, setPausingJob] = useState<string | null>(null)
  const [showLogsFor, setShowLogsFor] = useState<string | null>(null)
  const [testingJob, setTestingJob] = useState<string | null>(null)

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-md text-red-700">
        Failed to load cron jobs
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex flex-col gap-3">
        <div className="h-24 bg-gray-200 animate-pulse rounded-lg" />
        <div className="h-24 bg-gray-200 animate-pulse rounded-lg" />
      </div>
    )
  }

  const jobs = (data.jobs || []).sort((a, b) => b.createdAt - a.createdAt)

  const handlePauseToggle = async (jobId: string, currentEnabled: boolean) => {
    setPausingJob(jobId)
    try {
      const response = await fetch('/api/cron/pause', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ jobId, enabled: !currentEnabled }),
      })

      if (response.ok) {
        mutate()
      } else {
        const data = await response.json()
        alert(data.error || 'Failed to pause/unpause cron job')
      }
    } catch (err) {
      console.error('Failed to pause/unpause cron job:', err)
      alert('Failed to pause/unpause cron job')
    } finally {
      setPausingJob(null)
      setOpenMenu(null)
    }
  }

  const handleDeleteJob = async (jobId: string) => {
    try {
      const response = await fetch(`/api/cron/delete?jobId=${jobId}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        mutate()
      } else {
        const data = await response.json()
        alert(data.error || 'Failed to delete cron job')
      }
    } catch (err) {
      console.error('Failed to delete cron job:', err)
      alert('Failed to delete cron job')
    } finally {
      setOpenMenu(null)
    }
  }

  const handleTestRun = async (jobId: string) => {
    setTestingJob(jobId)
    try {
      const response = await fetch('/api/cron/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ jobId }),
      })

      const data = await response.json()

      if (response.ok) {
        // Refresh the data to show the new log
        mutate()
        // Optionally open logs modal
        setShowLogsFor(jobId)
      } else {
        alert(data.error || 'Failed to test run cron job')
      }
    } catch (err) {
      console.error('Failed to test run cron job:', err)
      alert('Failed to test run cron job')
    } finally {
      setTestingJob(null)
      setOpenMenu(null)
    }
  }

  if (jobs.length === 0) {
    return (
      <div className="p-6 border border-gray-200 rounded-lg text-center text-gray-500">
        No cron jobs yet. Create one above!
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {jobs.map((job) => (
          <div
            key={job.id}
            className="p-4 border border-gray-200 rounded-lg hover:shadow-sm transition-shadow relative"
          >
            <div className="flex justify-between items-start mb-2">
              <div className="flex-1 min-w-0">
                <h4 className="text-base font-semibold mb-1">{job.name}</h4>
                <p className="text-sm text-gray-500 font-mono">{job.schedule}</p>
              </div>
              <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                {job.enabled ? (
                  <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
                    Active
                  </span>
                ) : (
                  <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                    Paused
                  </span>
                )}

                {/* 3-dot menu */}
                <div className="relative">
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
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setOpenMenu(null)}
                      />
                      <div className="absolute right-0 top-8 z-20 w-48 bg-white border border-gray-200 rounded-md shadow-lg">
                        <div className="py-1">
                          <button
                            onClick={() => {
                              setShowLogsFor(job.id)
                              setOpenMenu(null)
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          >
                            Show Logs
                          </button>
                          <button
                            onClick={() => handleTestRun(job.id)}
                            disabled={testingJob === job.id || pausingJob === job.id || !job.enabled}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {testingJob === job.id ? 'Running...' : 'Test Run'}
                          </button>
                          <button
                            onClick={() => handlePauseToggle(job.id, job.enabled)}
                            disabled={pausingJob === job.id || testingJob === job.id}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {job.enabled ? 'Pause' : 'Resume'}
                          </button>
                          <button
                            onClick={() => {
                              setDeleteConfirm({ jobId: job.id, jobName: job.name })
                              setOpenMenu(null)
                            }}
                            disabled={pausingJob === job.id || testingJob === job.id}
                            className="w-full text-left px-4 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-3 text-xs md:text-sm mt-3 mb-3">
              <div>
                <span className="text-gray-500 uppercase tracking-wide text-[11px]">Worker Wallet</span>
                <p className="font-mono text-xs mt-1 break-all">{job.address}</p>
                {job.workerWalletName && (
                  <p className="text-[11px] text-indigo-600 mt-1">{job.workerWalletName}</p>
                )}
              </div>
              <div>
                <span className="text-gray-500 uppercase tracking-wide text-[11px]">Parent Wallet</span>
                <p className="font-mono text-xs mt-1 break-all">
                  {job.parentWalletAddress || job.parentWalletId || '—'}
                </p>
                {job.parentWalletName && (
                  <p className="text-[11px] text-gray-500 mt-1">{job.parentWalletName}</p>
                )}
              </div>
            </div>
            {job.fundingAmount && (
              <div className="text-[11px] text-gray-500 mb-3">
                Initial funding: <span className="font-semibold text-sm text-gray-700">{job.fundingAmount} ETH</span>
              </div>
            )}

              {job.type === 'eth_transfer' && (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500 text-xs">From:</span>
                    <p className="font-mono text-xs mt-1 break-all">{job.address}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">To:</span>
                    <p className="font-mono text-xs mt-1 break-all">{job.toAddress}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Amount:</span>
                    <p className="font-semibold text-sm mt-1">{job.amount} ETH</p>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Chain:</span>
                    <p className="text-sm mt-1 capitalize">{job.chain}</p>
                  </div>
                </div>
              )}
              {job.type === 'swap' && (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500 text-xs">From:</span>
                    <p className="font-mono text-xs mt-1 break-all">{job.address}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Swap:</span>
                    <p className="font-semibold text-sm mt-1">{job.swapAmount} {job.fromToken} → {job.toToken}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Chain:</span>
                    <p className="text-sm mt-1 capitalize">{job.chain}</p>
                  </div>
                </div>
              )}
              {job.type === 'token_swap' && (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500 text-xs">From:</span>
                    <p className="font-mono text-xs mt-1 break-all">{job.address}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Swap:</span>
                    <p className="font-semibold text-sm mt-1">{job.swapAmount} ETH → Token</p>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Token:</span>
                    <p className="font-mono text-xs mt-1 break-all">{job.tokenAddress}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Chain:</span>
                    <p className="text-sm mt-1 capitalize">{job.chain}</p>
                  </div>
                </div>
              )}
        </div>
      ))}
      </div>

      {deleteConfirm && (
        <DeleteConfirmModal
          isOpen={true}
          onClose={() => setDeleteConfirm(null)}
          onConfirm={() => handleDeleteJob(deleteConfirm.jobId)}
          title="Delete Cron Job"
          message="Are you sure you want to delete this cron job? This action cannot be undone."
          itemName={deleteConfirm.jobName}
        />
      )}

      {showLogsFor && (
        <CronJobLogsModal
          isOpen={true}
          onClose={() => setShowLogsFor(null)}
          jobId={showLogsFor}
          jobName={jobs.find(j => j.id === showLogsFor)?.name || 'Unknown'}
        />
      )}
    </>
  )
}

