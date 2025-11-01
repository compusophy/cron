import { NextApiRequest, NextApiResponse } from 'next'
import { kv } from '@vercel/kv'
import { Wallet } from './create'
import { createPublicClient, createWalletClient, formatUnits, http, parseUnits } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base, mainnet, sepolia } from 'viem/chains'
import { recordWalletLog } from '@/lib/wallet-logs'
import { withNonceLock } from '@/lib/nonce-lock'

const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
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

const TOKEN_CONFIG = [
  { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`, decimals: 6, symbol: 'USDC' },
  { address: '0x4200000000000000000000000000000000000006' as `0x${string}`, decimals: 18, symbol: 'WETH' },
  {
    address: (process.env.DEFAULT_TOKEN_ADDRESS || process.env.NEXT_PUBLIC_DEFAULT_TOKEN_ADDRESS || '0x4961015f34b0432e86e6d9841858c4ff87d4bb07') as `0x${string}`,
    decimals: 18,
    symbol: 'TestCoin',
  },
]

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

async function getFeeData(publicClient: any) {
  try {
    const fees = await publicClient.estimateFeesPerGas()
    if (fees.maxFeePerGas && fees.maxPriorityFeePerGas) {
      return {
        maxFeePerGas: fees.maxFeePerGas,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      }
    }
  } catch (err) {
    // ignore, fall back to legacy gas price
  }

  const gasPrice = await publicClient.getGasPrice()
  return {
    maxFeePerGas: gasPrice,
    maxPriorityFeePerGas: gasPrice,
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { walletId, recipient, chain = 'base' } = req.body || {}

  if (!walletId || typeof walletId !== 'string') {
    return res.status(400).json({ error: 'walletId is required' })
  }

  if (!recipient || typeof recipient !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
    return res.status(400).json({ error: 'Valid recipient address is required' })
  }

  try {
    const wallet = await kv.get<Wallet>(`wallet:${walletId}`)

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' })
    }

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

    const publicClient = createPublicClient({ chain: chainConfig, transport })
    const walletClient = createWalletClient({ account, chain: chainConfig, transport })

    const txHashes: string[] = []
    const tokenResults: Array<{ symbol: string; address: `0x${string}`; amount: string; txHash?: string; error?: string }> = []
    let ethResult: { amount: string; txHash?: string } | null = null

    await withNonceLock(account.address, async () => {
      for (const token of TOKEN_CONFIG) {
        try {
          const balance = (await publicClient.readContract({
            address: token.address,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [account.address],
          })) as bigint

          if (balance > 0n) {
            const { request } = await publicClient.simulateContract({
              account,
              address: token.address,
              abi: ERC20_ABI,
              functionName: 'transfer',
              args: [recipient as `0x${string}`, balance],
            })

            const hash = await walletClient.writeContract(request)
            await publicClient.waitForTransactionReceipt({ hash })

            txHashes.push(hash)
            tokenResults.push({
              symbol: token.symbol,
              address: token.address,
              amount: formatUnits(balance, token.decimals),
              txHash: hash,
            })
          }
        } catch (tokenError: any) {
          console.warn(`Failed to drain token ${token.address}:`, tokenError)
          tokenResults.push({
            symbol: token.symbol,
            address: token.address,
            amount: '0',
            error: tokenError?.message || 'Failed to drain token',
          })
        }
      }

      const ethBalance = await publicClient.getBalance({ address: account.address })
      if (ethBalance > 0n) {
        const { maxFeePerGas, maxPriorityFeePerGas } = await getFeeData(publicClient)
        const gasLimit = await publicClient
          .estimateGas({
            account: account.address,
            to: recipient as `0x${string}`,
            value: 0n,
          })
          .catch(() => 21000n)

        const gasCost = gasLimit * maxFeePerGas
        const minimumCushion = parseUnits('0.00001', 18)
        const dynamicCushion = gasCost / 5n
        const cushion = minimumCushion > dynamicCushion ? minimumCushion : dynamicCushion

        let value = ethBalance > gasCost + cushion ? ethBalance - gasCost - cushion : 0n

        if (value > 0n) {
          const hash = await walletClient.sendTransaction({
            account,
            chain: undefined,
            to: recipient as `0x${string}`,
            value,
            gas: gasLimit,
            maxFeePerGas,
            maxPriorityFeePerGas,
          })

          await publicClient.waitForTransactionReceipt({ hash })

          txHashes.push(hash)
          ethResult = {
            amount: formatUnits(value, 18),
            txHash: hash,
          }
        }
      }
    }, chainConfig.id)

    await recordWalletLog({
      walletId,
      type: 'drain',
      status: 'success',
      details: {
        recipient,
        chain,
        txHashes,
        tokens: tokenResults,
        eth: ethResult,
      },
    }).catch((err) => console.warn('Failed to record wallet drain log:', err))

    return res.status(200).json({ success: true, txHashes, tokenResults, ethResult })
  } catch (error: any) {
    console.error('Error draining wallet:', error)

    await recordWalletLog({
      walletId,
      type: 'drain',
      status: 'error',
      message: error.message,
      details: {
        recipient,
        chain,
      },
    }).catch((err) => console.warn('Failed to record wallet drain error log:', err))

    return res.status(500).json({
      error: 'Failed to drain wallet',
      message: error.message,
    })
  }
}

