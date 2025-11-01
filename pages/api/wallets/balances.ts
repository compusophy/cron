import { NextApiRequest, NextApiResponse } from 'next'
import { createPublicClient, http, formatEther, formatUnits } from 'viem'
import { base } from 'viem/chains'

const BASE_TOKENS = {
  WETH: '0x4200000000000000000000000000000000000006' as `0x${string}`,
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`,
  TEST: (process.env.DEFAULT_TOKEN_ADDRESS || '0x4961015f34b0432e86e6d9841858c4ff87d4bb07') as `0x${string}`,
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { address } = req.query

  if (!address || typeof address !== 'string') {
    return res.status(400).json({ error: 'Address parameter required' })
  }

  try {
    const transport = process.env.BASE_RPC_URL
      ? http(process.env.BASE_RPC_URL)
      : http('https://base.publicnode.com')

    const publicClient = createPublicClient({
      chain: base,
      transport,
    })

    // Get ETH balance
    const ethBalance = await publicClient.getBalance({
      address: address as `0x${string}`,
    })

    // Get WETH balance
    const wethBalance = await publicClient.readContract({
      address: BASE_TOKENS.WETH,
      abi: [{
        name: 'balanceOf',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
      }],
      functionName: 'balanceOf',
      args: [address as `0x${string}`],
    }) as bigint

    // Get USDC balance
    const usdcBalance = await publicClient.readContract({
      address: BASE_TOKENS.USDC,
      abi: [{
        name: 'balanceOf',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
      }],
      functionName: 'balanceOf',
      args: [address as `0x${string}`],
    }) as bigint

    const testCoinBalance = await publicClient.readContract({
      address: BASE_TOKENS.TEST,
      abi: [{
        name: 'balanceOf',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
      }],
      functionName: 'balanceOf',
      args: [address as `0x${string}`],
    }) as bigint

    const balances = {
      eth: formatEther(ethBalance),
      weth: formatEther(wethBalance),
      usdc: formatUnits(usdcBalance, 6), // USDC has 6 decimals
      testCoin: formatUnits(testCoinBalance, 18),
    }

    return res.status(200).json({ balances })
  } catch (error: any) {
    console.error('Error fetching balances:', error)
    return res.status(500).json({
      error: 'Failed to fetch balances',
      message: error.message
    })
  }
}
