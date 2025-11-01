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
  amount?: string // Amount in ETH (ignored if useMax is true)
  useMax?: boolean // Use max balance at runtime
  // For swap
  fromToken?: 'ETH' | 'USDC'
  toToken?: 'ETH' | 'USDC'
  swapAmount?: string // Amount to swap (ignored if useMax is true)
  // For token swaps
  tokenAddress?: string
  swapDirection?: 'eth_to_token' | 'token_to_eth' // Direction for token swaps
  chain: string // Chain name: 'base', 'sepolia', 'mainnet'
  privateKey: string
  publicKey: string
  address: string
  walletId: string // The wallet this job belongs to (replaces workerWalletId)
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
    const { name, schedule, type, toAddress, amount, chain, walletId, fromToken, toToken, swapAmount, tokenAddress, fundingAmount, useMax, swapDirection } = req.body

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
      if (!toAddress) {
        return res.status(400).json({ 
          error: 'Missing required fields for eth_transfer: toAddress' 
        })
      }
      if (!useMax && !amount) {
        return res.status(400).json({ 
          error: 'Missing required field for eth_transfer: amount (or enable Max)' 
        })
      }
    } else if (type === 'swap') {
      if (!fromToken || !toToken) {
        return res.status(400).json({ 
          error: 'Missing required fields for swap: fromToken, toToken' 
        })
      }
      if (!useMax && !swapAmount) {
        return res.status(400).json({ 
          error: 'Missing required field for swap: swapAmount (or enable Max)' 
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
      if (!tokenAddress || typeof tokenAddress !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
        return res.status(400).json({
          error: 'Invalid token address'
        })
      }
      if (!useMax && !swapAmount) {
        return res.status(400).json({
          error: 'Missing required field for token_swap: swapAmount (or enable Max)'
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

    // Validate amount is a number (only if useMax is false)
    if (!useMax) {
      const amountToValidate = type === 'eth_transfer' ? amount : swapAmount
      if (!amountToValidate) {
        return res.status(400).json({ 
          error: 'Amount is required when Max is not enabled' 
        })
      }
      const amountNum = parseFloat(amountToValidate)
      if (isNaN(amountNum) || amountNum <= 0) {
        return res.status(400).json({ 
          error: 'Amount must be a positive number' 
        })
      }
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

    // Use the wallet directly - no worker wallet creation
    let jobConfig: CronJobConfig

    try {
      jobConfig = {
        id: jobId,
        name,
        schedule,
        type: type as 'eth_transfer' | 'swap' | 'token_swap',
        chain,
        privateKey: wallet.privateKey,
        publicKey: wallet.publicKey || '',
        address: wallet.address,
        walletId: walletId,
        createdAt: Date.now(),
        lastRunTime: null,
        enabled: true,
        consecutiveFailures: 0,
        useMax: useMax === true,
      }
    
      // Add type-specific fields
      if (type === 'eth_transfer') {
        jobConfig.toAddress = toAddress
        if (!useMax && amount) {
          jobConfig.amount = amount.toString()
        }
      } else if (type === 'swap') {
        jobConfig.fromToken = fromToken as 'ETH' | 'USDC'
        jobConfig.toToken = toToken as 'ETH' | 'USDC'
        if (!useMax && swapAmount) {
          jobConfig.swapAmount = swapAmount.toString()
        }
      } else if (type === 'token_swap') {
        jobConfig.tokenAddress = (tokenAddress as string).toLowerCase()
        jobConfig.swapDirection = (swapDirection || 'eth_to_token') as 'eth_to_token' | 'token_to_eth'
        if (!useMax && swapAmount) {
          jobConfig.swapAmount = swapAmount.toString()
        }
      }

      // Store in Redis
      await kv.set(`cron:job:${jobId}`, jobConfig)
      await kv.sadd('cron:jobs:active', jobId)

      // Auto-track token address for token_swap jobs
      if (type === 'token_swap' && tokenAddress) {
        try {
          const tokenKey = `wallet:${walletId}:tokens`
          await kv.sadd(tokenKey, (tokenAddress as string).toLowerCase())
        } catch (error) {
          console.error('Failed to track token address:', error)
          // Don't fail job creation if token tracking fails
        }
      }
    } catch (error) {
      throw error
    }

    const responseJob: any = {
      id: jobConfig.id,
      name: jobConfig.name,
      schedule: jobConfig.schedule,
      type: jobConfig.type,
      address: jobConfig.address,
      createdAt: jobConfig.createdAt,
      walletId: jobConfig.walletId,
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

