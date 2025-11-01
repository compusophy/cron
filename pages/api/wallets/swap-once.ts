import { NextApiRequest, NextApiResponse } from 'next'
import { kv } from '@vercel/kv'
import { Wallet } from './create'
import { swapEthForToken } from '@/lib/swap'
import { recordWalletLog } from '@/lib/wallet-logs'

const DEFAULT_TOKEN_ADDRESS = (process.env.DEFAULT_TOKEN_ADDRESS || process.env.NEXT_PUBLIC_DEFAULT_TOKEN_ADDRESS || '0x4961015f34b0432e86e6d9841858c4ff87d4bb07') as `0x${string}`

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { walletId, amount, tokenAddress = DEFAULT_TOKEN_ADDRESS, chain = 'base' } = req.body || {}

  if (!walletId || typeof walletId !== 'string') {
    return res.status(400).json({ error: 'walletId is required' })
  }

  if (!amount || typeof amount !== 'string' || Number(amount) <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive number string' })
  }

  if (!tokenAddress || typeof tokenAddress !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
    return res.status(400).json({ error: 'Valid tokenAddress is required' })
  }

  const logDetails = {
    amount,
    tokenAddress,
    chain,
  }

  try {
    const wallet = await kv.get<Wallet>(`wallet:${walletId}`)

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' })
    }

    const txHash = await swapEthForToken(
      wallet.privateKey,
      tokenAddress,
      amount,
      chain
    )

    await recordWalletLog({
      walletId,
      type: 'swap',
      status: 'success',
      txHash,
      details: logDetails,
    }).catch((err) => console.warn('Failed to record wallet swap log:', err))

    return res.status(200).json({ success: true, txHash })
  } catch (error: any) {
    console.error('Error performing one-off swap:', error)

    await recordWalletLog({
      walletId,
      type: 'swap',
      status: 'error',
      message: error.message,
      details: logDetails,
    }).catch((err) => console.warn('Failed to record wallet swap error log:', err))

    return res.status(500).json({
      error: 'Failed to perform swap',
      message: error.message,
    })
  }
}
