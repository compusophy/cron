import { NextApiRequest, NextApiResponse } from 'next'
import { kv } from '@vercel/kv'
import { CronJobConfig } from './create'
import { shouldRunJob } from '@/lib/cron-scheduler'
import { sendEth } from '@/lib/eth'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Verify this is a cron request from Vercel
  // Vercel sends cron jobs with a specific header, but for local dev/testing
  // we can allow manual calls if CRON_SECRET is set
  const cronSecret = req.headers['authorization']?.replace('Bearer ', '')
  const vercelCronHeader = req.headers['vercel-cron'] || req.headers['x-vercel-cron']
  
  // For production, Vercel automatically includes the cron header
  // For local dev, check CRON_SECRET env var
  if (!vercelCronHeader && cronSecret !== process.env.CRON_SECRET) {
    // Allow if no CRON_SECRET is set (for easier local development)
    if (process.env.CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
  }

  try {
    // Get all active job IDs from Redis
    const jobIds = await kv.smembers('cron:jobs:active')
    
    if (!jobIds || jobIds.length === 0) {
      return res.status(200).json({ 
        message: 'No active cron jobs',
        executed: []
      })
    }

    const results = []

    // Process each job
    for (const jobId of jobIds) {
      try {
        const jobConfig = await kv.get<CronJobConfig>(`cron:job:${jobId}`)
        
        if (!jobConfig || !jobConfig.enabled) {
          continue
        }

        // Check if job should run based on schedule
        const shouldRun = shouldRunJob(jobConfig.schedule, jobConfig.lastRunTime)
        
        if (!shouldRun) {
          continue
        }

        // Execute the job based on type
        let result: any = { jobId, status: 'skipped' }

        if (jobConfig.type === 'eth_transfer') {
          try {
            // Get RPC URL from environment or use default
            const rpcUrl = process.env.ETH_RPC_URL
            
            const txHash = await sendEth(
              jobConfig.privateKey,
              jobConfig.toAddress!,
              jobConfig.amount!,
              rpcUrl
            )

            result = {
              jobId,
              jobName: jobConfig.name,
              type: 'eth_transfer',
              status: 'success',
              txHash,
              from: jobConfig.address,
              to: jobConfig.toAddress!,
              amount: jobConfig.amount!,
              executedAt: Date.now(),
            }
          } catch (error: any) {
            result = {
              jobId,
              jobName: jobConfig.name,
              type: 'eth_transfer',
              status: 'error',
              error: error.message,
              executedAt: Date.now(),
            }
          }
        }

        // Update last run time
        jobConfig.lastRunTime = Date.now()
        await kv.set(`cron:job:${jobId}`, jobConfig)

        results.push(result)
      } catch (error: any) {
        console.error(`Error processing job ${jobId}:`, error)
        results.push({
          jobId,
          status: 'error',
          error: error.message,
        })
      }
    }

    return res.status(200).json({
      message: `Processed ${jobIds.length} job(s)`,
      executed: results.filter(r => r.status !== 'skipped'),
      timestamp: Date.now(),
    })
  } catch (error: any) {
    console.error('Error in cron handler:', error)
    return res.status(500).json({
      error: 'Failed to process cron jobs',
      message: error.message,
    })
  }
}
