// This endpoint is called by Vercel cron every minute
// It checks Redis for active cron jobs and executes them based on their schedules
import { NextApiRequest, NextApiResponse } from 'next'
import { kv } from '@vercel/kv'
import { CronJobConfig } from './create'
import { shouldRunJob } from '@/lib/cron-scheduler'
import { sendEth } from '@/lib/eth'
import { randomBytes } from 'crypto'

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
    console.log(`[Cron Runner] Starting cron runner at ${new Date().toISOString()}`)
    
    // Get all active job IDs from Redis
    const jobIds = await kv.smembers('cron:jobs:active')
    
    console.log(`[Cron Runner] Found ${jobIds.length} active job(s)`)
    
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
          console.log(`[Cron Runner] Job ${jobId} skipped - schedule doesn't match or already ran recently`)
          continue
        }
        
        console.log(`[Cron Runner] Job ${jobId} should run! Schedule: ${jobConfig.schedule}, Last run: ${jobConfig.lastRunTime}`)

        // Execute the job based on type
        let result: any = { jobId, status: 'skipped' }

        if (jobConfig.type === 'eth_transfer') {
          try {
            // Get RPC URL from environment or use default
            const rpcUrl = process.env.ETH_RPC_URL
            const chainName = jobConfig.chain || 'sepolia'
            
            console.log(`[Cron Runner] Executing job ${jobId}: ${jobConfig.name}`)
            console.log(`[Cron Runner] Chain: ${chainName}, From: ${jobConfig.address}, To: ${jobConfig.toAddress}, Amount: ${jobConfig.amount}`)
            
            const txHash = await sendEth(
              jobConfig.privateKey,
              jobConfig.toAddress,
              jobConfig.amount,
              chainName,
              rpcUrl
            )
            
            console.log(`[Cron Runner] Success! TX Hash: ${txHash}`)

            result = {
              jobId,
              jobName: jobConfig.name,
              type: 'eth_transfer',
              status: 'success',
              txHash,
              from: jobConfig.address,
              to: jobConfig.toAddress,
              amount: jobConfig.amount,
              executedAt: Date.now(),
            }

            // Reset failure count on success
            jobConfig.consecutiveFailures = 0

            // Store log entry
            const logId = `log_${randomBytes(16).toString('hex')}`
            const logEntry = {
              id: logId,
              jobId,
              status: 'success' as const,
              txHash,
              executedAt: Date.now(),
              from: jobConfig.address,
              to: jobConfig.toAddress,
              amount: jobConfig.amount,
            }
            await kv.set(`cron:log:${logId}`, logEntry)
            await kv.lpush(`cron:job:${jobId}:logs`, logId)
            // Keep only last 100 logs per job
            await kv.ltrim(`cron:job:${jobId}:logs`, 0, 99)
          } catch (error: any) {
            console.error(`[Cron Runner] Error executing job ${jobId}:`, error)
            
            // Increment failure count
            const failureCount = (jobConfig.consecutiveFailures || 0) + 1
            jobConfig.consecutiveFailures = failureCount
            
            // Auto-pause after 3 consecutive failures
            const MAX_FAILURES = 3
            if (failureCount >= MAX_FAILURES) {
              jobConfig.enabled = false
              console.log(`[Cron Runner] Auto-pausing job ${jobId} after ${failureCount} consecutive failures`)
            }

            result = {
              jobId,
              jobName: jobConfig.name,
              type: 'eth_transfer',
              status: 'error',
              error: error.message,
              executedAt: Date.now(),
              autoPaused: failureCount >= MAX_FAILURES,
            }

            // Store error log entry
            const logId = `log_${randomBytes(16).toString('hex')}`
            const logEntry = {
              id: logId,
              jobId,
              status: 'error' as const,
              error: error.message,
              executedAt: Date.now(),
              autoPaused: failureCount >= MAX_FAILURES,
            }
            await kv.set(`cron:log:${logId}`, logEntry)
            await kv.lpush(`cron:job:${jobId}:logs`, logId)
            // Keep only last 100 logs per job
            await kv.ltrim(`cron:job:${jobId}:logs`, 0, 99)
          }
        }

        // Update last run time and config
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

