import { NextApiRequest, NextApiResponse } from 'next'
import { kv } from '@vercel/kv'
import { CronJobConfig } from './create'
import { sendEth } from '@/lib/eth'
import { swapTokens } from '@/lib/swap'
import { randomBytes } from 'crypto'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { jobId } = req.body

    if (!jobId) {
      return res.status(400).json({ error: 'Missing jobId parameter' })
    }

    const jobConfig = await kv.get<CronJobConfig>(`cron:job:${jobId}`)

    if (!jobConfig) {
      return res.status(404).json({ error: 'Cron job not found' })
    }

    if (!jobConfig.enabled) {
      return res.status(400).json({ error: 'Cron job is paused' })
    }

    // Execute the job immediately
    let result: any

    if (jobConfig.type === 'eth_transfer') {
      try {
        const rpcUrl = process.env.ETH_RPC_URL
        const chainName = jobConfig.chain || 'sepolia'

        console.log(`[Test Run] Executing job ${jobId}: ${jobConfig.name}`)
        console.log(`[Test Run] Chain: ${chainName}, From: ${jobConfig.address}, To: ${jobConfig.toAddress}, Amount: ${jobConfig.amount}`)

        const txHash = await sendEth(
          jobConfig.privateKey,
          jobConfig.toAddress!,
          jobConfig.amount!,
          chainName,
          rpcUrl
        )

        console.log(`[Test Run] Success! TX Hash: ${txHash}`)

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

        // Store log entry
        const logId = `log_${randomBytes(16).toString('hex')}`
        const logEntry = {
          id: logId,
          jobId,
          status: 'success' as const,
          txHash,
          executedAt: Date.now(),
          from: jobConfig.address,
          to: jobConfig.toAddress!,
          amount: jobConfig.amount!,
        }
        await kv.set(`cron:log:${logId}`, logEntry)
        await kv.lpush(`cron:job:${jobId}:logs`, logId)
        await kv.ltrim(`cron:job:${jobId}:logs`, 0, 99)
      } catch (error: any) {
        console.error(`[Test Run] Error executing job ${jobId}:`, error)
        result = {
          jobId,
          jobName: jobConfig.name,
          type: 'eth_transfer',
          status: 'error',
          error: error.message,
          executedAt: Date.now(),
        }

        // Store error log entry
        const logId = `log_${randomBytes(16).toString('hex')}`
        const logEntry = {
          id: logId,
          jobId,
          status: 'error' as const,
          error: error.message,
          executedAt: Date.now(),
        }
        await kv.set(`cron:log:${logId}`, logEntry)
        await kv.lpush(`cron:job:${jobId}:logs`, logId)
        await kv.ltrim(`cron:job:${jobId}:logs`, 0, 99)
      }
    } else if (jobConfig.type === 'swap') {
      try {
        const rpcUrl = process.env.ETH_RPC_URL
        const chainName = jobConfig.chain || 'base'

        console.log(`[Test Run] Executing swap job ${jobId}: ${jobConfig.name}`)
        console.log(`[Test Run] Chain: ${chainName}, From: ${jobConfig.address}, Swap: ${jobConfig.swapAmount} ${jobConfig.fromToken} -> ${jobConfig.toToken}`)

        if (!jobConfig.fromToken || !jobConfig.toToken || !jobConfig.swapAmount) {
          throw new Error('Missing swap configuration: fromToken, toToken, or swapAmount')
        }

        const txHash = await swapTokens(
          jobConfig.privateKey,
          jobConfig.fromToken,
          jobConfig.toToken,
          jobConfig.swapAmount,
          chainName,
          rpcUrl
        )

        console.log(`[Test Run] Swap success! TX Hash: ${txHash}`)

        result = {
          jobId,
          jobName: jobConfig.name,
          type: 'swap',
          status: 'success',
          txHash,
          from: jobConfig.address,
          fromToken: jobConfig.fromToken,
          toToken: jobConfig.toToken,
          amount: jobConfig.swapAmount,
          executedAt: Date.now(),
        }

        // Store log entry
        const logId = `log_${randomBytes(16).toString('hex')}`
        const logEntry = {
          id: logId,
          jobId,
          status: 'success' as const,
          txHash,
          executedAt: Date.now(),
          from: jobConfig.address,
          fromToken: jobConfig.fromToken,
          toToken: jobConfig.toToken,
          amount: jobConfig.swapAmount,
        }
        await kv.set(`cron:log:${logId}`, logEntry)
        await kv.lpush(`cron:job:${jobId}:logs`, logId)
        await kv.ltrim(`cron:job:${jobId}:logs`, 0, 99)
      } catch (error: any) {
        console.error(`[Test Run] Error executing swap job ${jobId}:`, error)
        result = {
          jobId,
          jobName: jobConfig.name,
          type: 'swap',
          status: 'error',
          error: error.message,
          executedAt: Date.now(),
        }

        // Store error log entry
        const logId = `log_${randomBytes(16).toString('hex')}`
        const logEntry = {
          id: logId,
          jobId,
          status: 'error' as const,
          error: error.message,
          executedAt: Date.now(),
        }
        await kv.set(`cron:log:${logId}`, logEntry)
        await kv.lpush(`cron:job:${jobId}:logs`, logId)
        await kv.ltrim(`cron:job:${jobId}:logs`, 0, 99)
      }
    } else {
      return res.status(400).json({ error: 'Unsupported job type' })
    }

    return res.status(200).json({
      success: true,
      result,
    })
  } catch (error: any) {
    console.error('Error testing cron job:', error)
    return res.status(500).json({
      error: 'Failed to test cron job',
      message: error.message
    })
  }
}

