import { NextApiRequest, NextApiResponse } from 'next'
import { kv } from '@vercel/kv'
import { randomBytes } from 'crypto'
import { Wallet } from '../wallets/create'

export interface CronJobConfig {
  id: string
  name: string
  schedule: string // Cron format: * * * * *
  type: 'eth_transfer' | 'swap'
  // For eth_transfer
  toAddress?: string
  amount?: string // Amount in ETH
  // For swap
  fromToken?: 'ETH' | 'USDC'
  toToken?: 'ETH' | 'USDC'
  swapAmount?: string // Amount to swap
  chain: string // Chain name: 'base', 'sepolia', 'mainnet'
  privateKey: string
  publicKey: string
  address: string
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
    const { name, schedule, type, toAddress, amount, chain, walletId, fromToken, toToken, swapAmount } = req.body

    // Validate type
    if (!type || (type !== 'eth_transfer' && type !== 'swap')) {
      return res.status(400).json({ 
        error: 'Invalid type. Must be "eth_transfer" or "swap"' 
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
    const amountToValidate = type === 'swap' ? swapAmount : amount
    const amountNum = parseFloat(amountToValidate)
    if (isNaN(amountNum) || amountNum <= 0) {
      return res.status(400).json({ 
        error: 'Amount must be a positive number' 
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
    const jobConfig: CronJobConfig = {
      id: jobId,
      name,
      schedule,
      type: type as 'eth_transfer' | 'swap',
      chain,
      privateKey: wallet.privateKey,
      publicKey: wallet.publicKey || '',
      address: wallet.address,
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
    }

    // Store in Redis
    // Store the job config
    await kv.set(`cron:job:${jobId}`, jobConfig)
    
    // Add to list of active job IDs
    await kv.sadd('cron:jobs:active', jobId)

    const responseJob: any = {
      id: jobConfig.id,
      name: jobConfig.name,
      schedule: jobConfig.schedule,
      type: jobConfig.type,
      address: jobConfig.address,
      createdAt: jobConfig.createdAt,
    }

    if (type === 'eth_transfer') {
      responseJob.toAddress = jobConfig.toAddress
      responseJob.amount = jobConfig.amount
    } else if (type === 'swap') {
      responseJob.fromToken = jobConfig.fromToken
      responseJob.toToken = jobConfig.toToken
      responseJob.swapAmount = jobConfig.swapAmount
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

