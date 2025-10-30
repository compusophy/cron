import { NextApiRequest, NextApiResponse } from 'next'
import { kv } from '@vercel/kv'
import { generateEthKeyPair } from '@/lib/eth'
import { randomBytes } from 'crypto'

export interface Wallet {
  id: string
  name: string
  address: string
  privateKey: string
  publicKey: string
  createdAt: number
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { name } = req.body

    // Generate ETH key pair
    const keyPair = generateEthKeyPair()

    // Create wallet with unique ID
    const walletId = `wallet_${randomBytes(16).toString('hex')}`
    const wallet: Wallet = {
      id: walletId,
      name: name || `Wallet ${Date.now()}`,
      address: keyPair.address as string,
      privateKey: keyPair.privateKey as string,
      publicKey: keyPair.publicKey || '',
      createdAt: Date.now(),
    }

    // Store in Redis
    await kv.set(`wallet:${walletId}`, wallet)
    await kv.sadd('wallets:active', walletId)

    return res.status(201).json({
      success: true,
      wallet: {
        id: wallet.id,
        name: wallet.name,
        address: wallet.address,
        createdAt: wallet.createdAt,
      },
    })
  } catch (error: any) {
    console.error('Error creating wallet:', error)
    return res.status(500).json({ 
      error: 'Failed to create wallet',
      message: error.message 
    })
  }
}

