import { NextApiRequest, NextApiResponse } from 'next'
import { kv } from '@vercel/kv'
import { CronJobConfig } from '../cron/create'

// Helper endpoint to backfill token tracking for existing cron jobs
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Get all active job IDs
    const jobIds = await kv.smembers('cron:jobs:active') as string[]
    
    let tracked = 0
    let skipped = 0
    let errors = 0

    for (const jobId of jobIds) {
      try {
        const jobConfig = await kv.get<CronJobConfig>(`cron:job:${jobId}`)
        
        if (!jobConfig) {
          skipped++
          continue
        }

        // Track token for token_swap jobs
        if (jobConfig.type === 'token_swap' && jobConfig.tokenAddress && jobConfig.walletId) {
          const tokenKey = `wallet:${jobConfig.walletId}:tokens`
          await kv.sadd(tokenKey, jobConfig.tokenAddress.toLowerCase())
          tracked++
        } else {
          skipped++
        }
      } catch (error) {
        console.error(`Error processing job ${jobId}:`, error)
        errors++
      }
    }

    return res.status(200).json({
      success: true,
      tracked,
      skipped,
      errors,
      message: `Backfilled ${tracked} token addresses, skipped ${skipped}, errors: ${errors}`,
    })
  } catch (error: any) {
    console.error('Error backfilling tokens:', error)
    return res.status(500).json({
      error: 'Failed to backfill tokens',
      message: error.message
    })
  }
}

