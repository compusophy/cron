import { NextApiRequest, NextApiResponse } from 'next'
import { kv } from '@vercel/kv'
import { randomBytes } from 'crypto'
import { Wallet } from '../wallets/create'

export interface CronJobConfig {
  id: string
  name: string
  schedule: string // Cron format: * * * * *
  type: 'eth_transfer'
  toAddress: string
  amount: string // Amount in ETH
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
    const { name, schedule, toAddress, amount, chain, walletId } = req.body

    // Validate inputs
    if (!name || !schedule || !toAddress || !amount || !chain || !walletId) {
      return res.status(400).json({ 
        error: 'Missing required fields: name, schedule, toAddress, amount, chain, walletId' 
      })
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
    const amountNum = parseFloat(amount)
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
      type: 'eth_transfer',
      toAddress,
      amount: amount.toString(),
      chain,
      privateKey: wallet.privateKey,
      publicKey: wallet.publicKey || '',
      address: wallet.address,
      createdAt: Date.now(),
      lastRunTime: null,
      enabled: true,
      consecutiveFailures: 0,
    }

    // Store in Redis
    // Store the job config
    await kv.set(`cron:job:${jobId}`, jobConfig)
    
    // Add to list of active job IDs
    await kv.sadd('cron:jobs:active', jobId)

    return res.status(201).json({
      success: true,
      job: {
        id: jobConfig.id,
        name: jobConfig.name,
        schedule: jobConfig.schedule,
        toAddress: jobConfig.toAddress,
        amount: jobConfig.amount,
        address: jobConfig.address, // From address (the generated wallet)
        createdAt: jobConfig.createdAt,
      },
    })
  } catch (error: any) {
    console.error('Error creating cron job:', error)
    return res.status(500).json({ 
      error: 'Failed to create cron job',
      message: error.message 
    })
  }
}

