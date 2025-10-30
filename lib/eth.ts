import { createWalletClient, createPublicClient, http, parseEther, formatEther, type Address, type Chain } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { generatePrivateKey } from 'viem/accounts'
import { sepolia, mainnet, base } from 'viem/chains'

export interface EthKeyPair {
  privateKey: `0x${string}`
  publicKey: string
  address: Address
}

/**
 * Generate a new Ethereum private/public key pair
 */
export function generateEthKeyPair(): EthKeyPair {
  const privateKey = generatePrivateKey()
  const account = privateKeyToAccount(privateKey)
  
  return {
    privateKey: privateKey as `0x${string}`,
    publicKey: '', // Viem doesn't expose public key directly
    address: account.address,
  }
}

/**
 * Get address from private key
 */
export function getAddressFromPrivateKey(privateKey: `0x${string}`): Address {
  const account = privateKeyToAccount(privateKey)
  return account.address
}

/**
 * Send ETH transaction
 */
export async function sendEth(
  privateKey: string,
  toAddress: string,
  amount: string, // Amount in ETH (will be converted to wei)
  chainName: string = 'sepolia', // Chain name: 'base', 'sepolia', 'mainnet'
  rpcUrl?: string
): Promise<string> {
  const finalRpcUrl = rpcUrl || process.env.ETH_RPC_URL
  
  // Determine chain
  let chain: Chain
  switch (chainName) {
    case 'base':
      chain = base
      break
    case 'mainnet':
      chain = mainnet
      break
    case 'sepolia':
    default:
      chain = sepolia
      break
  }
  
  // Create transport
  let transport
  if (finalRpcUrl) {
    transport = http(finalRpcUrl)
  } else if (chainName === 'base' && process.env.BASE_RPC_URL) {
    // Use custom Base RPC if provided
    console.log(`[sendEth] Using custom Base RPC from env`)
    transport = http(process.env.BASE_RPC_URL)
  } else if (process.env.INFURA_API_KEY) {
    // Infura doesn't support Base, use public RPC for Base
    if (chainName === 'base') {
      console.log(`[sendEth] Using Base public RPC (Infura doesn't support Base)`)
      transport = http('https://base.publicnode.com')
    } else {
      const infuraNetwork = chainName === 'mainnet' ? 'mainnet' : 'sepolia'
      const infuraUrl = `https://${infuraNetwork}.infura.io/v3/${process.env.INFURA_API_KEY}`
      transport = http(infuraUrl)
    }
  } else {
    // Fallback to public RPC endpoints
    const rpcUrls: Record<string, string> = {
      base: process.env.BASE_RPC_URL || 'https://base.publicnode.com',
      sepolia: 'https://rpc.sepolia.org',
      mainnet: 'https://eth.llamarpc.com',
    }
    const publicRpcUrl = rpcUrls[chainName] || rpcUrls.sepolia
    console.log(`[sendEth] Using public RPC: ${publicRpcUrl}`)
    transport = http(publicRpcUrl)
  }
  
  // Create account from private key
  const account = privateKeyToAccount(privateKey as `0x${string}`)
  
  // Create wallet client
  const client = createWalletClient({
    account,
    chain,
    transport,
  })
  
  // Create public client for balance checks
  const publicClient = createPublicClient({
    chain,
    transport,
  })
  
  // Check balance first
  console.log(`[sendEth] Checking balance for ${account.address} on ${chainName}`)
  const balance = await publicClient.getBalance({ address: account.address })
  const amountWei = parseEther(amount)
  
  console.log(`[sendEth] Balance: ${formatEther(balance)} ETH, Amount needed: ${amount} ETH`)
  
  if (balance < amountWei) {
    throw new Error(
      `Insufficient balance. Address ${account.address} has ${formatEther(balance)} ETH, but needs ${amount} ETH`
    )
  }
  
  // Get gas price
  const gasPrice = await publicClient.getGasPrice()
  console.log(`[sendEth] Gas price: ${gasPrice.toString()}`)
  
  // Estimate total cost (standard ETH transfer uses ~21000 gas)
  const estimatedGas = 21000n
  const totalCost = amountWei + (gasPrice * estimatedGas)
  
  console.log(`[sendEth] Total cost: ${formatEther(totalCost)} ETH (amount + gas)`)
  
  if (balance < totalCost) {
    throw new Error(
      `Insufficient balance for gas. Need ${formatEther(totalCost)} ETH but have ${formatEther(balance)} ETH`
    )
  }
  
  // Get current nonce to avoid conflicts when multiple transactions run simultaneously
  const nonce = await publicClient.getTransactionCount({ 
    address: account.address,
    blockTag: 'pending' // Use pending to get the latest nonce including pending transactions
  })
  console.log(`[sendEth] Current nonce: ${nonce}`)
  
  // Send transaction with explicit nonce
  console.log(`[sendEth] Sending ${amount} ETH from ${account.address} to ${toAddress}`)
  const hash = await client.sendTransaction({
    to: toAddress as Address,
    value: amountWei,
    nonce: nonce,
  })
  
  console.log(`[sendEth] Transaction sent! Hash: ${hash}`)
  return hash
}

