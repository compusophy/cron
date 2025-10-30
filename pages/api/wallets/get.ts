import { NextApiRequest, NextApiResponse } from 'next'
import { kv } from '@vercel/kv'
import { Wallet } from './create'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { walletId } = req.query

    if (!walletId || typeof walletId !== 'string') {
      return res.status(400).json({ error: 'Wallet ID is required' })
    }

    const wallet = await kv.get<Wallet>(`wallet:${walletId}`)

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' })
    }

    // Return wallet with private key (this endpoint should be protected in production)
    return res.status(200).json({ wallet })
  } catch (error: any) {
    console.error('Error getting wallet:', error)
    return res.status(500).json({ 
      error: 'Failed to get wallet',
      message: error.message 
    })
  }
}

