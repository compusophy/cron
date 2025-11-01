import { NextApiRequest, NextApiResponse } from 'next'
import { kv } from '@vercel/kv'
import { randomBytes } from 'crypto'
import { Wallet } from '../wallets/create'
import { generateEthKeyPair, sendEth } from '@/lib/eth'

export interface CronJobConfig {
  id: string
  name: string
  schedule: string // Cron format: * * * * *
  type: 'eth_transfer' | 'swap' | 'token_swap'
  // For eth_transfer
  toAddress?: string
  amount?: string // Amount in ETH
  // For swap
  fromToken?: 'ETH' | 'USDC'
  toToken?: 'ETH' | 'USDC'
  swapAmount?: string // Amount to swap
  // For token swaps
  tokenAddress?: string
  chain: string // Chain name: 'base', 'sepolia', 'mainnet'
  privateKey: string
  publicKey: string
  address: string
  parentWalletId: string
  workerWalletId: string
  workerWalletName: string
  fundingAmount?: string
  createdAt: number
  lastRunTime: number | null
  enabled: boolean
  consecutiveFailures: number // Track consecutive failures for auto-pause
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { name, schedule, type, toAddress, amount, chain, walletId, fromToken, toToken, swapAmount, tokenAddress, fundingAmount } = req.body

    // Validate type
    const validTypes = ['eth_transfer', 'swap', 'token_swap'] as const
    if (!type || !validTypes.includes(type)) {
      return res.status(400).json({ 
        error: 'Invalid type. Must be "eth_transfer", "swap", or "token_swap"' 
      })
    }

    // Validate common fields
    if (!name || !schedule || !chain || !walletId) {
      return res.status(400).json({ 
        error: 'Missing required fields: name, schedule, chain, walletId' 
      })
    }

    // Validate type-specific fields
    if (type === 'eth_transfer') {
      if (!toAddress || !amount) {
        return res.status(400).json({ 
          error: 'Missing required fields for eth_transfer: toAddress, amount' 
        })
      }
    } else if (type === 'swap') {
      if (!fromToken || !toToken || !swapAmount) {
        return res.status(400).json({ 
          error: 'Missing required fields for swap: fromToken, toToken, swapAmount' 
        })
      }
      if (fromToken === toToken) {
        return res.status(400).json({ 
          error: 'fromToken and toToken must be different' 
        })
      }
      if (fromToken !== 'ETH' && fromToken !== 'USDC') {
        return res.status(400).json({ 
          error: 'fromToken must be ETH or USDC' 
        })
      }
      if (toToken !== 'ETH' && toToken !== 'USDC') {
        return res.status(400).json({ 
          error: 'toToken must be ETH or USDC' 
        })
      }
    } else if (type === 'token_swap') {
      if (!swapAmount) {
        return res.status(400).json({
          error: 'Missing required field for token_swap: swapAmount'
        })
      }
      if (!tokenAddress || typeof tokenAddress !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
        return res.status(400).json({
          error: 'Invalid token address'
        })
      }
    }

    // Validate chain
    const validChains = ['base', 'sepolia', 'mainnet']
    if (!validChains.includes(chain)) {
      return res.status(400).json({ 
        error: `Invalid chain. Must be one of: ${validChains.join(', ')}` 
      })
    }

    // Validate cron schedule format (basic check)
    const cronParts = schedule.split(' ').filter((p: string) => p !== '')
    if (cronParts.length !== 5) {
      return res.status(400).json({ 
        error: 'Invalid cron schedule format. Expected: * * * * *' 
      })
    }

    // Validate amount is a number
    const amountToValidate = type === 'eth_transfer' ? amount : swapAmount
    const amountNum = parseFloat(amountToValidate)
    if (isNaN(amountNum) || amountNum <= 0) {
      return res.status(400).json({ 
        error: 'Amount must be a positive number' 
      })
    }

    const defaultFundingAmount = process.env.CRON_WORKER_FUNDING_ETH || '0.0005'
    const fundingAmountToUse = typeof fundingAmount === 'string' && fundingAmount !== '' ? fundingAmount : defaultFundingAmount
    const fundingAmountNum = parseFloat(fundingAmountToUse)
    if (isNaN(fundingAmountNum) || fundingAmountNum < 0) {
      return res.status(400).json({
        error: 'Funding amount must be a non-negative number',
      })
    }

    // Get wallet from Redis
    const wallet = await kv.get<Wallet>(`wallet:${walletId}`)
    if (!wallet) {
      return res.status(404).json({ 
        error: 'Wallet not found' 
      })
    }

    // Create cron job config with unique ID
    const jobId = `cron_${randomBytes(16).toString('hex')}`

    // Count existing children to determine the next number
    const walletIds = await kv.smembers('wallets:active')
    const existingChildren: Wallet[] = []
    if (walletIds && walletIds.length > 0) {
      const allWallets = await Promise.all(
        walletIds.map(async (id) => {
          if (id === walletId) return null
          const w = await kv.get<Wallet>(`wallet:${id}`)
          return w && w.parentId === walletId ? w : null
        })
      )
      existingChildren.push(...allWallets.filter((w): w is Wallet => w !== null))
    }
    const nextNumber = existingChildren.length + 1

    // Create a dedicated worker wallet for this cron job
    const workerKeyPair = generateEthKeyPair()
    const workerWalletId = `wallet_${randomBytes(16).toString('hex')}`
    const workerWalletName = `${wallet.name}-${nextNumber}`
    const workerWallet: Wallet = {
      id: workerWalletId,
      name: workerWalletName,
      address: workerKeyPair.address as string,
      privateKey: workerKeyPair.privateKey as string,
      publicKey: workerKeyPair.publicKey || '',
      createdAt: Date.now(),
      type: 'worker',
      parentId: walletId,
      jobId,
    }

    await kv.set(`wallet:${workerWalletId}`, workerWallet)
    await kv.sadd('wallets:active', workerWalletId)

    const cleanupWorkerWallet = async () => {
      await kv.srem('wallets:active', workerWalletId)
      await kv.del(`wallet:${workerWalletId}`)
    }

    if (fundingAmountNum > 0) {
      try {
        await sendEth(wallet.privateKey, workerWallet.address, fundingAmountToUse, chain)
      } catch (error: any) {
        await cleanupWorkerWallet()
        throw new Error(`Failed to fund worker wallet: ${error.message}`)
      }
    }

    let jobConfig: CronJobConfig

    try {
      jobConfig = {
        id: jobId,
        name,
        schedule,
        type: type as 'eth_transfer' | 'swap' | 'token_swap',
        chain,
        privateKey: workerWallet.privateKey,
        publicKey: workerWallet.publicKey || '',
        address: workerWallet.address,
        parentWalletId: walletId,
        workerWalletId,
        workerWalletName,
        fundingAmount: fundingAmountNum > 0 ? fundingAmountToUse : undefined,
        createdAt: Date.now(),
        lastRunTime: null,
        enabled: true,
        consecutiveFailures: 0,
      }
    
      // Add type-specific fields
      if (type === 'eth_transfer') {
        jobConfig.toAddress = toAddress
        jobConfig.amount = amount.toString()
      } else if (type === 'swap') {
        jobConfig.fromToken = fromToken as 'ETH' | 'USDC'
        jobConfig.toToken = toToken as 'ETH' | 'USDC'
        jobConfig.swapAmount = swapAmount.toString()
      } else if (type === 'token_swap') {
        jobConfig.swapAmount = swapAmount.toString()
        jobConfig.tokenAddress = (tokenAddress as string).toLowerCase()
      }

      // Store in Redis
      await kv.set(`cron:job:${jobId}`, jobConfig)
      await kv.sadd('cron:jobs:active', jobId)
    } catch (error) {
      await cleanupWorkerWallet()
      throw error
    }

    const responseJob: any = {
      id: jobConfig.id,
      name: jobConfig.name,
      schedule: jobConfig.schedule,
      type: jobConfig.type,
      address: jobConfig.address,
      createdAt: jobConfig.createdAt,
      parentWalletId: jobConfig.parentWalletId,
      workerWalletId: jobConfig.workerWalletId,
      workerWalletName: jobConfig.workerWalletName,
      fundingAmount: jobConfig.fundingAmount,
    }

    if (type === 'eth_transfer') {
      responseJob.toAddress = jobConfig.toAddress
      responseJob.amount = jobConfig.amount
    } else if (type === 'swap') {
      responseJob.fromToken = jobConfig.fromToken
      responseJob.toToken = jobConfig.toToken
      responseJob.swapAmount = jobConfig.swapAmount
    } else if (type === 'token_swap') {
      responseJob.swapAmount = jobConfig.swapAmount
      responseJob.tokenAddress = jobConfig.tokenAddress
    }

    return res.status(201).json({
      success: true,
      job: responseJob,
    })
  } catch (error: any) {
    console.error('Error creating cron job:', error)
    return res.status(500).json({ 
      error: 'Failed to create cron job',
      message: error.message 
    })
  }
}

