import { useState, useEffect } from 'react'
import useSWR from 'swr'

interface LogEntry {
  id: string
  jobId: string
  status: 'success' | 'error' | 'skipped'
  txHash?: string
  error?: string
  executedAt: number
  from?: string
  to?: string
  amount?: string
  fromToken?: 'ETH' | 'USDC'
  toToken?: 'ETH' | 'USDC'
  tokenAddress?: string
}

interface CronJobLogsModalProps {
  isOpen: boolean
  onClose: () => void
  jobId: string
  jobName: string
}

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export default function CronJobLogsModal({ isOpen, onClose, jobId, jobName }: CronJobLogsModalProps) {
  const { data, error } = useSWR<{ logs: LogEntry[] }>(
    isOpen ? `/api/cron/logs?jobId=${jobId}` : null,
    fetcher,
    { refreshInterval: 5000 }
  )

  if (!isOpen) return null


  const logs = data?.logs || []

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
    >
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <h3 className="text-xl font-semibold">Execution Logs - {jobName}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
          >
            ×
          </button>
        </div>
        <div className="p-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm mb-4">
              Failed to load logs
            </div>
          )}
          {!data && !error && (
            <div className="text-center text-gray-500 py-8">Loading logs...</div>
          )}
          {logs.length === 0 && data && (
            <div className="text-center text-gray-500 py-8">No execution logs yet</div>
          )}
          {logs.length > 0 && (
            <div className="flex flex-col gap-3">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="p-3 border border-gray-200 rounded-md"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      {log.status === 'success' && (
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
                          Success
                        </span>
                      )}
                      {log.status === 'error' && (
                        <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium">
                          Error
                        </span>
                      )}
                      {log.status === 'skipped' && (
                        <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                          Skipped
                        </span>
                      )}
                      <span className="text-xs text-gray-500">
                        {new Date(log.executedAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  {log.status === 'success' && log.txHash && (
                    <div className="text-sm space-y-1">
                      <div>
                        <span className="text-gray-500">TX Hash:</span>{' '}
                        <span className="font-mono text-xs">{log.txHash}</span>
                      </div>
                      {log.from && (
                        <div>
                          <span className="text-gray-500">From:</span>{' '}
                          <span className="font-mono text-xs">{log.from}</span>
                        </div>
                      )}
                      {log.to && (
                        <div>
                          <span className="text-gray-500">To:</span>{' '}
                          <span className="font-mono text-xs">{log.to}</span>
                        </div>
                      )}
                      {log.tokenAddress && (
                        <div>
                          <span className="text-gray-500">Token:</span>{' '}
                          <span className="font-mono text-xs">{log.tokenAddress}</span>
                        </div>
                      )}
                      {log.fromToken && log.toToken && log.amount ? (
                        <div>
                          <span className="text-gray-500">Swap:</span>{' '}
                          <span className="font-semibold">{log.amount} {log.fromToken} → {log.toToken}</span>
                        </div>
                      ) : log.tokenAddress && log.amount ? (
                        <div>
                          <span className="text-gray-500">Swap:</span>{' '}
                          <span className="font-semibold">{log.amount} ETH → Token</span>
                        </div>
                      ) : log.amount && (
                        <div>
                          <span className="text-gray-500">Amount:</span>{' '}
                          <span className="font-semibold">{log.amount} ETH</span>
                        </div>
                      )}
                    </div>
                  )}
                  {log.status === 'error' && log.error && (
                    <div className="text-sm text-red-700 mt-2">
                      <span className="font-medium">Error:</span> {log.error}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

