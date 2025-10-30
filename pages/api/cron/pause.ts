import { NextApiRequest, NextApiResponse } from 'next'
import { kv } from '@vercel/kv'
import { CronJobConfig } from './create'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { jobId, enabled } = req.body

    if (!jobId || typeof enabled !== 'boolean') {
      return res.status(400).json({
        error: 'Missing required fields: jobId, enabled'
      })
    }

    const jobConfig = await kv.get<CronJobConfig>(`cron:job:${jobId}`)

    if (!jobConfig) {
      return res.status(404).json({ error: 'Cron job not found' })
    }

    jobConfig.enabled = enabled
    
    // Reset failure count when manually enabling
    if (enabled) {
      jobConfig.consecutiveFailures = 0
    }
    
    await kv.set(`cron:job:${jobId}`, jobConfig)

    return res.status(200).json({
      success: true,
      job: {
        id: jobConfig.id,
        enabled: jobConfig.enabled,
      },
    })
  } catch (error: any) {
    console.error('Error pausing cron job:', error)
    return res.status(500).json({
      error: 'Failed to pause cron job',
      message: error.message
    })
  }
}

