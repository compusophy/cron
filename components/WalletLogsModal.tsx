import useSWR from 'swr'

interface WalletLogEntry {
  id: string
  walletId: string
  type: string
  status: 'success' | 'error'
  txHash?: string
  message?: string
  details?: Record<string, any>
  createdAt: number
}

interface WalletLogsModalProps {
  isOpen: boolean
  onClose: () => void
  walletId: string
  walletName: string
  walletAddress: string
}

const fetcher = (url: string) => fetch(url).then((res) => res.json())

const formatDetail = (key: string, value: any) => {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch (err) {
      return String(value)
    }
  }
  return String(value)
}

export default function WalletLogsModal({ isOpen, onClose, walletId, walletName, walletAddress }: WalletLogsModalProps) {
  const { data, error } = useSWR<{ logs: WalletLogEntry[] }>(
    isOpen ? `/api/wallets/logs?walletId=${walletId}` : null,
    fetcher,
    { refreshInterval: 5000 }
  )

  if (!isOpen) return null

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const logs = data?.logs || []

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-4 border-b border-gray-200">
          <div>
            <h3 className="text-xl font-semibold">Wallet Logs</h3>
            <p className="text-xs text-gray-500 mt-1">
              {walletName} · <span className="font-mono">{walletAddress}</span>
            </p>
          </div>
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
              Failed to load wallet logs
            </div>
          )}

          {!data && !error && (
            <div className="text-center text-gray-500 py-8">Loading logs...</div>
          )}

          {logs.length === 0 && data && (
            <div className="text-center text-gray-500 py-8">No actions recorded for this wallet yet.</div>
          )}

          {logs.length > 0 && (
            <div className="flex flex-col gap-3">
              {logs.map((log) => (
                <div key={log.id} className="border border-gray-200 rounded-md p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-xs font-medium uppercase tracking-wide">
                        {log.type}
                      </span>
                      {log.status === 'success' ? (
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
                          Success
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium">
                          Error
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">
                      {new Date(log.createdAt).toLocaleString()}
                    </span>
                  </div>

                  {log.txHash && (
                    <div className="mt-2 text-sm">
                      <span className="text-gray-500">TX:</span>{' '}
                      <a
                        href={`https://basescan.org/tx/${log.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-indigo-600 hover:text-indigo-800"
                      >
                        {log.txHash}
                      </a>
                    </div>
                  )}

                  {log.message && (
                    <p className="mt-2 text-sm text-gray-700">{log.message}</p>
                  )}

                  {log.details && (
                    <dl className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                      {Object.entries(log.details)
                        .map(([key, value]) => ({ key, value: formatDetail(key, value) }))
                        .filter((entry) => entry.value)
                        .map((entry) => (
                          <div key={entry.key} className="flex justify-between gap-2">
                            <dt className="uppercase tracking-wide text-[10px] text-gray-500">{entry.key}</dt>
                            <dd className="font-mono text-[11px] text-gray-700 text-right">
                              {entry.value}
                            </dd>
                          </div>
                        ))}
                    </dl>
                  )}

                  {log.status === 'error' && log.message && (
                    <div className="mt-2 text-xs text-red-600">{log.message}</div>
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


