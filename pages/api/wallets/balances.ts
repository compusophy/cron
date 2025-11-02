import { NextApiRequest, NextApiResponse } from 'next'
import { createPublicClient, http, formatEther, formatUnits } from 'viem'
import { base } from 'viem/chains'
import { kv } from '@vercel/kv'
import { getTokenMetadata } from '@/lib/token-metadata'
import { STANDARD_TOKENS, BASE_TOKEN_ADDRESSES, isStandardToken } from '@/lib/token-constants'

const ERC20_BALANCE_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { address, walletId } = req.query

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

    // Standard tokens (always fetch)
    const standardTokens = STANDARD_TOKENS.map(token => ({
      address: token.address,
      decimals: token.decimals,
      symbol: token.symbol,
    }))

    const standardBalances: Record<string, string> = {}
    
    // Fetch standard token balances in parallel
    const standardBalancePromises = standardTokens.map(async (token) => {
      try {
        const balance = await publicClient.readContract({
          address: token.address,
          abi: ERC20_BALANCE_ABI,
          functionName: 'balanceOf',
          args: [address as `0x${string}`],
        }) as bigint
        
        return {
          symbol: token.symbol.toLowerCase(),
          balance: formatUnits(balance, token.decimals),
        }
      } catch (error) {
        console.error(`Error fetching ${token.symbol} balance:`, error)
        return { symbol: token.symbol.toLowerCase(), balance: '0' }
      }
    })

    const standardResults = await Promise.all(standardBalancePromises)
    standardResults.forEach(({ symbol, balance }) => {
      standardBalances[symbol] = balance
    })

    // Dynamic tokens (from wallet tracking)
    const dynamicBalances: Array<{ address: string; symbol: string; name: string; balance: string; decimals: number }> = []
    
    if (walletId && typeof walletId === 'string') {
      try {
        // Get tracked tokens for this wallet
        const tokenKey = `wallet:${walletId}:tokens`
        const trackedTokens = await kv.smembers(tokenKey) as string[]

        if (trackedTokens && trackedTokens.length > 0) {
          // Fetch balances and metadata for tracked tokens
          const dynamicPromises = trackedTokens.map(async (tokenAddress) => {
            try {
              // Skip if it's a standard token we already fetched
              if (isStandardToken(tokenAddress)) {
                return null
              }

              // Get token metadata
              const metadata = await getTokenMetadata(tokenAddress, process.env.BASE_RPC_URL)
              if (!metadata) {
                return null
              }

              // Get balance
              const balance = await publicClient.readContract({
                address: tokenAddress.toLowerCase() as `0x${string}`,
                abi: ERC20_BALANCE_ABI,
                functionName: 'balanceOf',
                args: [address as `0x${string}`],
              }) as bigint

              const formattedBalance = formatUnits(balance, metadata.decimals)
              
              // Only include if balance > 0
              if (parseFloat(formattedBalance) > 0) {
                return {
                  address: tokenAddress.toLowerCase(),
                  symbol: metadata.symbol,
                  name: metadata.name,
                  balance: formattedBalance,
                  decimals: metadata.decimals,
                }
              }
              return null
            } catch (error) {
              console.error(`Error fetching balance for token ${tokenAddress}:`, error)
              return null
            }
          })

          const dynamicResults = await Promise.all(dynamicPromises)
          dynamicBalances.push(...dynamicResults.filter((r): r is NonNullable<typeof r> => r !== null))
        }
      } catch (error) {
        console.error('Error fetching tracked tokens:', error)
        // Continue without dynamic tokens
      }
    }

    const balances = {
      eth: formatEther(ethBalance),
      weth: standardBalances.weth || '0',
      usdc: standardBalances.usdc || '0',
      testCoin: standardBalances.testcoin || standardBalances.test || '0',
      wrplt: standardBalances.wrplt || '0',
      // Dynamic tokens
      tokens: dynamicBalances,
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
