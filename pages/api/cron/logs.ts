import { NextApiRequest, NextApiResponse } from 'next'
import { kv } from '@vercel/kv'

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
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { jobId } = req.query

    if (!jobId || typeof jobId !== 'string') {
      return res.status(400).json({ error: 'Missing jobId parameter' })
    }

    // Get logs from Redis (stored as a list for each job)
    const logIds = await kv.lrange(`cron:job:${jobId}:logs`, 0, -1)

    if (!logIds || logIds.length === 0) {
      return res.status(200).json({ logs: [] })
    }

    // Fetch all log entries
    const logs = await Promise.all(
      logIds.map(async (logId: string) => {
        const log = await kv.get<LogEntry>(`cron:log:${logId}`)
        return log
      })
    )

    // Filter out nulls and sort by executedAt (newest first)
    const validLogs = logs
      .filter((log): log is LogEntry => log !== null)
      .sort((a, b) => b.executedAt - a.executedAt)

    return res.status(200).json({ logs: validLogs })
  } catch (error: any) {
    console.error('Error fetching logs:', error)
    return res.status(500).json({
      error: 'Failed to fetch logs',
      message: error.message
    })
  }
}

