import { createPublicClient, http, Address } from 'viem'
import { base } from 'viem/chains'

const ERC20_ABI = [
  {
    name: 'name',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    name: 'symbol',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

export interface TokenMetadata {
  address: string
  name: string
  symbol: string
  decimals: number
}

// Cache for token metadata to avoid repeated RPC calls
const metadataCache = new Map<string, TokenMetadata>()

export async function getTokenMetadata(
  tokenAddress: string,
  rpcUrl?: string
): Promise<TokenMetadata | null> {
  // Check cache first
  const cached = metadataCache.get(tokenAddress.toLowerCase())
  if (cached) {
    return cached
  }

  try {
    const transport = rpcUrl ? http(rpcUrl) : http(process.env.BASE_RPC_URL || 'https://base.publicnode.com')
    const publicClient = createPublicClient({
      chain: base,
      transport,
    })

    const [name, symbol, decimals] = await Promise.all([
      publicClient.readContract({
        address: tokenAddress.toLowerCase() as Address,
        abi: ERC20_ABI,
        functionName: 'name',
      }).catch(() => null),
      publicClient.readContract({
        address: tokenAddress.toLowerCase() as Address,
        abi: ERC20_ABI,
        functionName: 'symbol',
      }).catch(() => null),
      publicClient.readContract({
        address: tokenAddress.toLowerCase() as Address,
        abi: ERC20_ABI,
        functionName: 'decimals',
      }).catch(() => null),
    ])

    if (!name || !symbol || decimals === null) {
      return null
    }

    const metadata: TokenMetadata = {
      address: tokenAddress.toLowerCase(),
      name: name as string,
      symbol: symbol as string,
      decimals: Number(decimals),
    }

    // Cache the result
    metadataCache.set(tokenAddress.toLowerCase(), metadata)
    return metadata
  } catch (error) {
    console.error(`Error fetching token metadata for ${tokenAddress}:`, error)
    return null
  }
}

