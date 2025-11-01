import { NextApiRequest, NextApiResponse } from 'next'
import { kv } from '@vercel/kv'
import { Wallet } from './create'
import { CronJobConfig } from '../cron/create'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { walletId } = req.query

    if (!walletId || typeof walletId !== 'string') {
      return res.status(400).json({ error: 'Wallet ID is required' })
    }

    const wallet = await kv.get<Wallet>(`wallet:${walletId}`)

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' })
    }

    // Delete all cron jobs associated with this wallet
    const walletJobsKey = `wallet:${walletId}:jobs`
    const jobIds = await kv.smembers(walletJobsKey) as string[]
    
    if (jobIds && jobIds.length > 0) {
      for (const jobId of jobIds) {
        // Remove from active jobs set
        await kv.srem('cron:jobs:active', jobId)
        // Delete the job config
        await kv.del(`cron:job:${jobId}`)
      }
      // Delete the wallet jobs tracking set
      await kv.del(walletJobsKey)
    }

    // Check for active worker wallets under this master
    const walletIds = await kv.smembers('wallets:active') as string[]
    if (walletIds && walletIds.length > 0) {
      const childWallets = await Promise.all(
        walletIds.map(async (id) => {
          if (id === walletId) return null
          const candidate = await kv.get<Wallet>(`wallet:${id}`)
          return candidate && candidate.parentId === walletId ? candidate : null
        })
      )
      const activeChildren = childWallets.filter((child) => child !== null)
      if (activeChildren.length > 0) {
        return res.status(400).json({
          error: 'Cannot delete master wallet with active worker wallets. Delete the associated cron jobs first.',
        })
      }
    }

    // Remove from active wallets set
    await kv.srem('wallets:active', walletId)
    
    // Delete wallet data
    await kv.del(`wallet:${walletId}`)

    return res.status(200).json({
      success: true,
      message: 'Wallet deleted successfully',
    })
  } catch (error: any) {
    console.error('Error deleting wallet:', error)
    return res.status(500).json({ 
      error: 'Failed to delete wallet',
      message: error.message 
    })
  }
}

