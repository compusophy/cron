import { NextApiRequest, NextApiResponse } from 'next'
import { fetchWalletLogs } from '@/lib/wallet-logs'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { walletId, limit } = req.query

  if (!walletId || typeof walletId !== 'string') {
    return res.status(400).json({ error: 'walletId query param is required' })
  }

  const limitNum = limit ? Number(limit) : 50
  const safeLimit = Number.isFinite(limitNum) && limitNum > 0 ? Math.min(limitNum, 100) : 50

  try {
    const logs = await fetchWalletLogs(walletId, safeLimit)
    return res.status(200).json({ logs })
  } catch (error: any) {
    console.error('Error fetching wallet logs:', error)
    return res.status(500).json({
      error: 'Failed to fetch wallet logs',
      message: error.message,
    })
  }
}

