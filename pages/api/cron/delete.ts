import { NextApiRequest, NextApiResponse } from 'next'
import { kv } from '@vercel/kv'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { jobId } = req.query

    if (!jobId || typeof jobId !== 'string') {
      return res.status(400).json({ error: 'Missing jobId parameter' })
    }

    // Remove from active jobs set
    await kv.srem('cron:jobs:active', jobId)

    // Delete the job config
    await kv.del(`cron:job:${jobId}`)

    return res.status(200).json({
      success: true,
      message: 'Cron job deleted successfully',
    })
  } catch (error: any) {
    console.error('Error deleting cron job:', error)
    return res.status(500).json({
      error: 'Failed to delete cron job',
      message: error.message
    })
  }
}

