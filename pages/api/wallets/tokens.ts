import { NextApiRequest, NextApiResponse } from 'next'
import { kv } from '@vercel/kv'

// Track token addresses for a wallet
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'POST') {
    // Add a token address to a wallet's tracked tokens
    try {
      const { walletId, tokenAddress } = req.body

      if (!walletId || !tokenAddress) {
        return res.status(400).json({ error: 'Missing walletId or tokenAddress' })
      }

      // Validate token address format
      if (!/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
        return res.status(400).json({ error: 'Invalid token address format' })
      }

      // Get wallet to verify it exists
      const wallet = await kv.get(`wallet:${walletId}`)
      if (!wallet) {
        return res.status(404).json({ error: 'Wallet not found' })
      }

      // Add token to wallet's tracked tokens set
      const tokenKey = `wallet:${walletId}:tokens`
      await kv.sadd(tokenKey, tokenAddress.toLowerCase())

      return res.status(200).json({ success: true })
    } catch (error: any) {
      console.error('Error tracking token:', error)
      return res.status(500).json({ error: 'Failed to track token', message: error.message })
    }
  } else if (req.method === 'GET') {
    // Get tracked tokens for a wallet
    try {
      const { walletId } = req.query

      if (!walletId || typeof walletId !== 'string') {
        return res.status(400).json({ error: 'Missing walletId parameter' })
      }

      const tokenKey = `wallet:${walletId}:tokens`
      const tokens = await kv.smembers(tokenKey) as string[]

      return res.status(200).json({ tokens: tokens || [] })
    } catch (error: any) {
      console.error('Error fetching tracked tokens:', error)
      return res.status(500).json({ error: 'Failed to fetch tracked tokens', message: error.message })
    }
  } else {
    return res.status(405).json({ error: 'Method not allowed' })
  }
}

