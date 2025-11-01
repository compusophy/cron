import { kv } from '@vercel/kv'
import { randomBytes } from 'crypto'

export type WalletLogStatus = 'success' | 'error'

export interface WalletLogEntry {
  id: string
  walletId: string
  type: string
  status: WalletLogStatus
  txHash?: string
  message?: string
  details?: Record<string, any>
  createdAt: number
}

const LOG_PREFIX = 'wallet:log:'
const WALLET_LOG_LIST_PREFIX = 'wallet:'
const MAX_LOGS_PER_WALLET = 100

export async function recordWalletLog(entry: Omit<WalletLogEntry, 'id' | 'createdAt'>) {
  const logId = `wallet_log_${randomBytes(12).toString('hex')}`
  const timestamp = Date.now()
  const fullEntry: WalletLogEntry = {
    id: logId,
    createdAt: timestamp,
    ...entry,
  }

  await kv.set(`${LOG_PREFIX}${logId}`, fullEntry)
  await kv.lpush(`${WALLET_LOG_LIST_PREFIX}${entry.walletId}:logs`, logId)
  await kv.ltrim(`${WALLET_LOG_LIST_PREFIX}${entry.walletId}:logs`, 0, MAX_LOGS_PER_WALLET - 1)

  return fullEntry
}

export async function fetchWalletLogs(walletId: string, limit = 50) {
  const logIds = await kv.lrange<string>(`${WALLET_LOG_LIST_PREFIX}${walletId}:logs`, 0, limit - 1)
  if (!logIds || logIds.length === 0) return []

  const pipeline = logIds.map((id) => kv.get<WalletLogEntry>(`${LOG_PREFIX}${id}`))
  const entries = await Promise.all(pipeline)

  return entries.filter((entry): entry is WalletLogEntry => Boolean(entry))
    .sort((a, b) => b.createdAt - a.createdAt)
}


