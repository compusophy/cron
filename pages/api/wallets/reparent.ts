import { NextApiRequest, NextApiResponse } from 'next'
import { kv } from '@vercel/kv'
import { Wallet } from './create'

async function getWallet(id: string): Promise<Wallet | null> {
  return kv.get<Wallet>(`wallet:${id}`)
}

async function isDescendant(targetId: string, potentialAncestorId: string): Promise<boolean> {
  let currentParentId: string | null | undefined = potentialAncestorId

  while (currentParentId) {
    if (currentParentId === targetId) {
      return true
    }
    const parentWallet = await getWallet(currentParentId)
    currentParentId = parentWallet?.parentId ?? null
  }

  return false
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { walletId, parentId } = req.body || {}

  if (!walletId || typeof walletId !== 'string') {
    return res.status(400).json({ error: 'walletId is required' })
  }

  try {
    const wallet = await getWallet(walletId)

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' })
    }

    if (!parentId) {
      wallet.parentId = null
      wallet.type = 'master'

      await kv.set(`wallet:${wallet.id}`, wallet)

      return res.status(200).json({ success: true, wallet: { id: wallet.id, parentId: wallet.parentId, type: wallet.type } })
    }

    if (typeof parentId !== 'string') {
      return res.status(400).json({ error: 'parentId must be a string or null' })
    }

    if (parentId === wallet.id) {
      return res.status(400).json({ error: 'Wallet cannot be its own parent' })
    }

    const parentWallet = await getWallet(parentId)

    if (!parentWallet) {
      return res.status(404).json({ error: 'Parent wallet not found' })
    }

    const createsCycle = await isDescendant(wallet.id, parentWallet.id)
    if (createsCycle) {
      return res.status(400).json({ error: 'Invalid parent selection: would create a cycle.' })
    }

    wallet.parentId = parentWallet.id
    wallet.type = 'worker'

    await kv.set(`wallet:${wallet.id}`, wallet)

    return res.status(200).json({ success: true, wallet: { id: wallet.id, parentId: wallet.parentId, type: wallet.type } })
  } catch (error: any) {
    console.error('Error updating wallet parent:', error)
    return res.status(500).json({
      error: 'Failed to update wallet parent',
      message: error.message,
    })
  }
}


