import { NextApiRequest, NextApiResponse } from 'next'
import { kv } from '@vercel/kv'
import { generateEthKeyPair, sendEth } from '@/lib/eth'
import { randomBytes } from 'crypto'

export type WalletType = 'master' | 'worker'

export interface Wallet {
  id: string
  name: string
  address: string
  privateKey: string
  publicKey: string
  createdAt: number
  type: WalletType
  parentId?: string | null
  jobId?: string | null
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { name, parentId, fundingAmount } = req.body || {}

    let parentWallet: Wallet | null = null

    if (parentId) {
      parentWallet = await kv.get<Wallet>(`wallet:${parentId}`)
      if (!parentWallet) {
        return res.status(400).json({ error: 'Parent wallet not found' })
      }
    }

    // Determine if a master wallet already exists
    const walletIds = await kv.smembers('wallets:active')
    let existingMasterId: string | null = null

    if (walletIds && walletIds.length > 0) {
      for (const id of walletIds) {
        const current = await kv.get<Wallet>(`wallet:${id}`)
        if (current && !current.parentId) {
          existingMasterId = current.id
          break
        }
      }
    }

    // Generate ETH key pair
    const keyPair = generateEthKeyPair()

    // Create wallet with unique ID
    const walletId = `wallet_${randomBytes(16).toString('hex')}`
    const isMaster = !parentWallet

    if (isMaster && existingMasterId) {
      return res.status(400).json({
        error: 'A master wallet already exists. Demote it before creating a new master wallet.',
      })
    }

    // Validate child wallet naming schema
    if (parentWallet) {
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({
          error: 'Wallet name is required for child wallets',
        })
      }

      const requiredPrefix = `${parentWallet.name}-`
      if (!name.startsWith(requiredPrefix)) {
        return res.status(400).json({
          error: `Child wallet name must start with "${requiredPrefix}"`,
        })
      }

      const suffix = name.slice(requiredPrefix.length)
      if (!suffix || !/^\d+$/.test(suffix)) {
        return res.status(400).json({
          error: `Name must end with a number after "${requiredPrefix}"`,
        })
      }
    }

    const wallet: Wallet = {
      id: walletId,
      name: name || (isMaster ? `Wallet ${Date.now()}` : `${parentWallet?.name || 'Wallet'}-1`),
      address: keyPair.address as string,
      privateKey: keyPair.privateKey as string,
      publicKey: keyPair.publicKey || '',
      createdAt: Date.now(),
      type: isMaster ? 'master' : 'worker',
      parentId: parentWallet ? parentWallet.id : null,
      jobId: null,
    }

    // Store in Redis
    await kv.set(`wallet:${walletId}`, wallet)
    await kv.sadd('wallets:active', walletId)

    // Fund the wallet if parent exists and funding amount is provided
    if (parentWallet && fundingAmount) {
      const fundingAmountNum = parseFloat(fundingAmount)
      if (!isNaN(fundingAmountNum) && fundingAmountNum > 0) {
        try {
          // Use 'base' as default chain - you might want to make this configurable
          await sendEth(parentWallet.privateKey, wallet.address, fundingAmount, 'base')
        } catch (fundingError: any) {
          // Log error but don't fail wallet creation
          console.error('Failed to fund wallet:', fundingError)
          // Optionally delete the wallet if funding fails
          // await kv.srem('wallets:active', walletId)
          // await kv.del(`wallet:${walletId}`)
          // return res.status(500).json({ error: `Failed to fund wallet: ${fundingError.message}` })
        }
      }
    }

    return res.status(201).json({
      success: true,
      wallet: {
        id: wallet.id,
        name: wallet.name,
        address: wallet.address,
        createdAt: wallet.createdAt,
        parentId: wallet.parentId,
        type: wallet.type,
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

