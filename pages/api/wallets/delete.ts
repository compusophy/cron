import { NextApiRequest, NextApiResponse } from 'next'
import { kv } from '@vercel/kv'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { walletId } = req.query

    if (!walletId || typeof walletId !== 'string') {
      return res.status(400).json({ error: 'Wallet ID is required' })
    }

    // Remove from active wallets set
    await kv.srem('wallets:active', walletId)
    
    // Delete wallet data
    await kv.del(`wallet:${walletId}`)

    return res.status(200).json({
      success: true,
      message: 'Wallet deleted successfully',
    })
  } catch (error: any) {
    console.error('Error deleting wallet:', error)
    return res.status(500).json({ 
      error: 'Failed to delete wallet',
      message: error.message 
    })
  }
}

