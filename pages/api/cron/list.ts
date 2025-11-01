import { NextApiRequest, NextApiResponse } from 'next'
import { kv } from '@vercel/kv'
import { CronJobConfig } from './create'
import { Wallet } from '../wallets/create'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Get all active job IDs from Redis
    const jobIds = await kv.smembers('cron:jobs:active')
    
    if (!jobIds || jobIds.length === 0) {
      return res.status(200).json({ jobs: [] })
    }

    // Fetch all job configs
    const jobs = await Promise.all(
      jobIds.map(async (jobId) => {
        const jobConfig = await kv.get<CronJobConfig>(`cron:job:${jobId}`)
        if (!jobConfig) return null

        let parentWallet: Wallet | null = null
        if (jobConfig.parentWalletId) {
          parentWallet = await kv.get<Wallet>(`wallet:${jobConfig.parentWalletId}`)
        }
        
        // Return safe version without private key
        const job: any = {
          id: jobConfig.id,
          name: jobConfig.name,
          schedule: jobConfig.schedule,
          type: jobConfig.type,
          chain: jobConfig.chain,
          address: jobConfig.address, // From address
          createdAt: jobConfig.createdAt,
          lastRunTime: jobConfig.lastRunTime,
          enabled: jobConfig.enabled,
          parentWalletId: jobConfig.parentWalletId,
          workerWalletId: jobConfig.workerWalletId,
          workerWalletName: jobConfig.workerWalletName,
          fundingAmount: jobConfig.fundingAmount,
          parentWalletName: parentWallet?.name,
          parentWalletAddress: parentWallet?.address,
        }
        
        // Add type-specific fields
        if (jobConfig.type === 'eth_transfer') {
          job.toAddress = jobConfig.toAddress
          job.amount = jobConfig.amount
        } else if (jobConfig.type === 'swap') {
          job.fromToken = jobConfig.fromToken
          job.toToken = jobConfig.toToken
          job.swapAmount = jobConfig.swapAmount
        } else if (jobConfig.type === 'token_swap') {
          job.swapAmount = jobConfig.swapAmount
          job.tokenAddress = jobConfig.tokenAddress
        }
        
        return job
      })
    )

    // Filter out nulls
    const validJobs = jobs.filter((job) => job !== null)

    return res.status(200).json({ jobs: validJobs })
  } catch (error: any) {
    console.error('Error listing cron jobs:', error)
    return res.status(500).json({ 
      error: 'Failed to list cron jobs',
      message: error.message 
    })
  }
}

