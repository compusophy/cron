/**
 * Centralized token constants for Base chain
 * All token addresses and metadata should be defined here
 */

export const BASE_TOKEN_ADDRESSES = {
  WETH: '0x4200000000000000000000000000000000000006' as `0x${string}`,
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`,
  TEST: (process.env.DEFAULT_TOKEN_ADDRESS || process.env.NEXT_PUBLIC_DEFAULT_TOKEN_ADDRESS || '0x4961015f34b0432e86e6d9841858c4ff87d4bb07') as `0x${string}`,
  WRPLT: '0x4db6506600d00afdbdf1c0a331b64cf6ebf43b07' as `0x${string}`,
} as const

export interface StandardToken {
  address: `0x${string}`
  decimals: number
  symbol: string
  name: string
}

export const STANDARD_TOKENS: StandardToken[] = [
  {
    address: BASE_TOKEN_ADDRESSES.WETH,
    decimals: 18,
    symbol: 'WETH',
    name: 'Wrapped Ether',
  },
  {
    address: BASE_TOKEN_ADDRESSES.USDC,
    decimals: 6,
    symbol: 'USDC',
    name: 'USD Coin',
  },
  {
    address: BASE_TOKEN_ADDRESSES.TEST,
    decimals: 18,
    symbol: 'TestCoin',
    name: 'Test Coin',
  },
  {
    address: BASE_TOKEN_ADDRESSES.WRPLT,
    decimals: 18,
    symbol: 'WRPLT',
    name: 'WRPLT Token',
  },
]

/**
 * Check if an address is a standard whitelisted token
 */
export function isStandardToken(address: string): boolean {
  const lowerAddress = address.toLowerCase()
  return Object.values(BASE_TOKEN_ADDRESSES).some(
    tokenAddr => tokenAddr.toLowerCase() === lowerAddress
  )
}

/**
 * Get token metadata by address
 */
export function getStandardTokenByAddress(address: string): StandardToken | undefined {
  const lowerAddress = address.toLowerCase()
  return STANDARD_TOKENS.find(
    token => token.address.toLowerCase() === lowerAddress
  )
}

