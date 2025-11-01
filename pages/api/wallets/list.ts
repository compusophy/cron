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
    // Get all active wallet IDs from Redis
    const walletIds = await kv.smembers('wallets:active')
    
    if (!walletIds || walletIds.length === 0) {
      return res.status(200).json({ wallets: [] })
    }

    // Fetch all wallet configs
    const wallets = await Promise.all(
      walletIds.map(async (walletId) => {
        const wallet = await kv.get<Wallet>(`wallet:${walletId}`)
        if (!wallet) return null
        
        // Return safe version without private key
        return {
          id: wallet.id,
          name: wallet.name,
          address: wallet.address,
          createdAt: wallet.createdAt,
          type: wallet.type,
          parentId: wallet.parentId || null,
          jobId: wallet.jobId || null,
        }
      })
    )

    // Filter out nulls
    const validWallets = wallets.filter((wallet) => wallet !== null)

    return res.status(200).json({ wallets: validWallets })
  } catch (error: any) {
    console.error('Error listing wallets:', error)
    return res.status(500).json({ 
      error: 'Failed to list wallets',
      message: error.message 
    })
  }
}

