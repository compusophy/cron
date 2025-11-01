import { NextApiRequest, NextApiResponse } from 'next'
import { kv } from '@vercel/kv'
import { CronJobConfig } from './create'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { jobId, name, schedule, type, toAddress, amount, chain, walletId, fromToken, toToken, swapAmount, tokenAddress, useMax, swapDirection } = req.body

    if (!jobId) {
      return res.status(400).json({ error: 'Missing jobId' })
    }

    // Get existing job config
    const existingJob = await kv.get<CronJobConfig>(`cron:job:${jobId}`)
    
    if (!existingJob) {
      return res.status(404).json({ error: 'Cron job not found' })
    }

    // Validate type if provided
    if (type) {
      const validTypes = ['eth_transfer', 'swap', 'token_swap'] as const
      if (!validTypes.includes(type)) {
        return res.status(400).json({ 
          error: 'Invalid type. Must be "eth_transfer", "swap", or "token_swap"' 
        })
      }
    }

    // Update job config with new values
    const updatedJob: CronJobConfig = {
      ...existingJob,
      name: name !== undefined ? name : existingJob.name,
      schedule: schedule !== undefined ? schedule : existingJob.schedule,
      type: type !== undefined ? type : existingJob.type,
      chain: chain !== undefined ? chain : existingJob.chain,
      walletId: walletId !== undefined ? walletId : existingJob.walletId,
      useMax: useMax !== undefined ? useMax : existingJob.useMax,
    }

    // Update type-specific fields
    if (updatedJob.type === 'eth_transfer') {
      updatedJob.toAddress = toAddress !== undefined ? toAddress : existingJob.toAddress
      if (!useMax && amount !== undefined) {
        updatedJob.amount = amount
      } else if (useMax) {
        delete updatedJob.amount
      }
      // Clear swap fields
      delete updatedJob.fromToken
      delete updatedJob.toToken
      delete updatedJob.swapAmount
      delete updatedJob.tokenAddress
      delete updatedJob.swapDirection
    } else if (updatedJob.type === 'swap') {
      updatedJob.fromToken = fromToken !== undefined ? fromToken : existingJob.fromToken
      updatedJob.toToken = toToken !== undefined ? toToken : existingJob.toToken
      if (!useMax && swapAmount !== undefined) {
        updatedJob.swapAmount = swapAmount
      } else if (useMax) {
        delete updatedJob.swapAmount
      }
      // Clear eth_transfer and token_swap fields
      delete updatedJob.toAddress
      delete updatedJob.amount
      delete updatedJob.tokenAddress
      delete updatedJob.swapDirection
    } else if (updatedJob.type === 'token_swap') {
      updatedJob.tokenAddress = tokenAddress !== undefined ? tokenAddress : existingJob.tokenAddress
      updatedJob.swapDirection = swapDirection !== undefined ? swapDirection : (existingJob.swapDirection || 'eth_to_token')
      if (!useMax && swapAmount !== undefined) {
        updatedJob.swapAmount = swapAmount
      } else if (useMax) {
        delete updatedJob.swapAmount
      }
      // Clear eth_transfer and swap fields
      delete updatedJob.toAddress
      delete updatedJob.amount
      delete updatedJob.fromToken
      delete updatedJob.toToken
    }

    // Save updated job config
    await kv.set(`cron:job:${jobId}`, updatedJob)

        // Auto-track token address for token_swap jobs
        if (updatedJob.type === 'token_swap' && updatedJob.tokenAddress && updatedJob.walletId) {
          try {
            const tokenKey = `wallet:${updatedJob.walletId}:tokens`
            await kv.sadd(tokenKey, updatedJob.tokenAddress.toLowerCase())
          } catch (error) {
            console.error('Failed to track token address:', error)
            // Don't fail job update if token tracking fails
          }
        }

    // Return safe version without private key
    const responseJob: any = {
      id: updatedJob.id,
      name: updatedJob.name,
      schedule: updatedJob.schedule,
      type: updatedJob.type,
      chain: updatedJob.chain,
      address: updatedJob.address,
      createdAt: updatedJob.createdAt,
      lastRunTime: updatedJob.lastRunTime,
      enabled: updatedJob.enabled,
      walletId: updatedJob.walletId,
    }

    if (updatedJob.type === 'eth_transfer') {
      responseJob.toAddress = updatedJob.toAddress
      if (updatedJob.amount) {
        responseJob.amount = updatedJob.amount
      }
      responseJob.useMax = updatedJob.useMax
    } else if (updatedJob.type === 'swap') {
      responseJob.fromToken = updatedJob.fromToken
      responseJob.toToken = updatedJob.toToken
      if (updatedJob.swapAmount) {
        responseJob.swapAmount = updatedJob.swapAmount
      }
      responseJob.useMax = updatedJob.useMax
    } else if (updatedJob.type === 'token_swap') {
      if (updatedJob.swapAmount) {
        responseJob.swapAmount = updatedJob.swapAmount
      }
      responseJob.tokenAddress = updatedJob.tokenAddress
      responseJob.swapDirection = updatedJob.swapDirection
      responseJob.useMax = updatedJob.useMax
    }

    return res.status(200).json({
      success: true,
      job: responseJob,
    })
  } catch (error: any) {
    console.error('Error updating cron job:', error)
    return res.status(500).json({ 
      error: 'Failed to update cron job',
      message: error.message 
    })
  }
}

