import { NextApiRequest, NextApiResponse } from 'next'
import { kv } from '@vercel/kv'
import { Wallet } from './create'
import { sendEth } from '@/lib/eth'
import { createPublicClient, createWalletClient, http, parseUnits } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base, sepolia, mainnet } from 'viem/chains'
import { recordWalletLog } from '@/lib/wallet-logs'
import { withNonceLock } from '@/lib/nonce-lock'

const ERC20_TRANSFER_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

function resolveRpcUrl(targetChain: string) {
  if (targetChain === 'base') {
    return process.env.BASE_RPC_URL || 'https://base.publicnode.com'
  }

  if (process.env.ETH_RPC_URL) {
    return process.env.ETH_RPC_URL
  }

  if (targetChain === 'mainnet') {
    return 'https://eth.llamarpc.com'
  }

  return 'https://rpc.sepolia.org'
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { walletId, toAddress, amount, chain = 'base', tokenAddress, decimals, asset } = req.body || {}

  if (!walletId || typeof walletId !== 'string') {
    return res.status(400).json({ error: 'walletId is required' })
  }

  if (!toAddress || typeof toAddress !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(toAddress)) {
    return res.status(400).json({ error: 'Valid toAddress is required' })
  }

  if (!amount || typeof amount !== 'string' || Number(amount) <= 0) {
    return res.status(400).json({ error: 'Amount must be a positive number string' })
  }

  if (tokenAddress && (typeof tokenAddress !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(tokenAddress))) {
    return res.status(400).json({ error: 'tokenAddress must be a valid contract address' })
  }

  const assetType = tokenAddress ? (typeof asset === 'string' ? asset : 'ERC20') : 'ETH'
  const logDetails = {
    to: toAddress,
    amount,
    chain,
    tokenAddress,
    asset: assetType,
  }

  try {
    const wallet = await kv.get<Wallet>(`wallet:${walletId}`)

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' })
    }

    if (!tokenAddress) {
      const txHash = await sendEth(wallet.privateKey, toAddress, amount, chain)

      await recordWalletLog({
        walletId,
        type: 'send',
        status: 'success',
        txHash,
        details: logDetails,
      }).catch((err) => console.warn('Failed to record wallet send log:', err))

      return res.status(200).json({ success: true, txHash })
    }

    const tokenDecimals = typeof decimals === 'number' ? decimals : Number(decimals) || 18

    let chainConfig
    switch (chain) {
      case 'base':
        chainConfig = base
        break
      case 'mainnet':
        chainConfig = mainnet
        break
      case 'sepolia':
      default:
        chainConfig = sepolia
        break
    }

    const transport = http(resolveRpcUrl(chain))

    const account = privateKeyToAccount(wallet.privateKey as `0x${string}`)

    const publicClient = createPublicClient({
      chain: chainConfig,
      transport,
    })

    const walletClient = createWalletClient({
      account,
      chain: chainConfig,
      transport,
    })

    const amountUnits = parseUnits(amount, tokenDecimals)

    const txHash = await withNonceLock(account.address, async () => {
      const { request } = await publicClient.simulateContract({
        account,
        address: tokenAddress as `0x${string}`,
        abi: ERC20_TRANSFER_ABI,
        functionName: 'transfer',
        args: [toAddress as `0x${string}`, amountUnits],
      })

      const hash = await walletClient.writeContract(request)
      await publicClient.waitForTransactionReceipt({ hash })

      return hash
    }, chainConfig.id)

    await recordWalletLog({
      walletId,
      type: 'send',
      status: 'success',
      txHash,
      details: logDetails,
    }).catch((err) => console.warn('Failed to record wallet send log:', err))

    return res.status(200).json({ success: true, txHash })
  } catch (error: any) {
    console.error('Error sending asset once:', error)

    await recordWalletLog({
      walletId,
      type: 'send',
      status: 'error',
      message: error.message,
      details: logDetails,
    }).catch((err) => console.warn('Failed to record wallet send error log:', err))

    return res.status(500).json({
      error: 'Failed to send transaction',
      message: error.message,
    })
  }
}
