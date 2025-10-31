import { createWalletClient, createPublicClient, http, parseEther, parseUnits, formatEther, formatUnits, encodeFunctionData, type Address, type Chain } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base, sepolia, mainnet } from 'viem/chains'

// Token addresses on Base
const BASE_TOKENS = {
  WETH: '0x4200000000000000000000000000000000000006' as Address,
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address,
}

// Token addresses on Mainnet
const MAINNET_TOKENS = {
  WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as Address,
  USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address,
}

// Token addresses on Sepolia
const SEPOLIA_TOKENS = {
  WETH: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14' as Address,
  USDC: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as Address,
}

// Uniswap V3 SwapRouter02 addresses
const SWAP_ROUTER_02: Record<string, Address> = {
  // Per Uniswap v3 Base deployments: https://docs.uniswap.org/contracts/v3/reference/deployments/base-deployments
  base: '0x2626664c2603336E57B271c5C0b26F421741e481' as Address,
  mainnet: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45' as Address,
  sepolia: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45' as Address,
}

/**
 * Get token addresses for a chain
 */
function getTokenAddresses(chainName: string): { WETH: Address; USDC: Address } {
  switch (chainName) {
    case 'base':
      return BASE_TOKENS
    case 'mainnet':
      return MAINNET_TOKENS
    case 'sepolia':
    default:
      return SEPOLIA_TOKENS
  }
}

/**
 * Swap ETH for USDC or USDC for ETH using Uniswap V3
 */
export async function swapTokens(
  privateKey: string,
  fromToken: 'ETH' | 'USDC',
  toToken: 'ETH' | 'USDC',
  amount: string,
  chainName: string = 'base',
  rpcUrl?: string
): Promise<string> {
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
  if (chainName === 'base' && process.env.BASE_RPC_URL) {
    console.log(`[swapTokens] Using custom Base RPC from env`)
    transport = http(process.env.BASE_RPC_URL)
  } else if (rpcUrl) {
    transport = http(rpcUrl)
  } else if (process.env.ETH_RPC_URL) {
    transport = http(process.env.ETH_RPC_URL)
  } else {
    const rpcUrls: Record<string, string> = {
      base: process.env.BASE_RPC_URL || 'https://base.publicnode.com',
      sepolia: 'https://rpc.sepolia.org',
      mainnet: 'https://eth.llamarpc.com',
    }
    transport = http(rpcUrls[chainName] || rpcUrls.sepolia)
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`)
  const walletClient = createWalletClient({
    account,
    chain,
    transport,
  })

  const publicClient = createPublicClient({
    chain,
    transport,
  })

  const tokens = getTokenAddresses(chainName)
  const routerAddress = SWAP_ROUTER_02[chainName] || SWAP_ROUTER_02.base

  console.log(`[swapTokens] Swapping ${amount} ${fromToken} for ${toToken} on ${chainName}`)

  let nonce = await publicClient.getTransactionCount({
    address: account.address,
    blockTag: 'pending'
  })
  console.log(`[swapTokens] Current nonce: ${nonce}`)

  if (fromToken === 'ETH' && toToken === 'USDC') {
    const amountIn = parseEther(amount)
    
    // Check balance
    const balance = await publicClient.getBalance({ address: account.address })
    if (balance < amountIn) {
      throw new Error(`Insufficient ETH. Have ${formatEther(balance)}, need ${amount}`)
    }

    // Step 1: Wrap ETH to WETH
    console.log(`[swapTokens] Wrapping ${amount} ETH to WETH`)
    const wrapHash = await walletClient.sendTransaction({
      to: tokens.WETH,
      data: encodeFunctionData({
        abi: [{
          name: 'deposit',
          type: 'function',
          stateMutability: 'payable',
          inputs: [],
          outputs: [],
        }],
        functionName: 'deposit',
      }),
      value: amountIn,
      nonce,
    })
    await publicClient.waitForTransactionReceipt({ hash: wrapHash })
    
    // Step 2: Approve WETH for router
    nonce = await publicClient.getTransactionCount({
      address: account.address,
      blockTag: 'pending'
    })
    
    console.log(`[swapTokens] Approving WETH for SwapRouter02`)
    const approveHash = await walletClient.sendTransaction({
      to: tokens.WETH,
      data: encodeFunctionData({
        abi: [{
          name: 'approve',
          type: 'function',
          stateMutability: 'nonpayable',
          inputs: [
            { name: 'spender', type: 'address' },
            { name: 'amount', type: 'uint256' },
          ],
          outputs: [{ name: '', type: 'bool' }],
        }],
        functionName: 'approve',
        args: [routerAddress, amountIn],
      }),
      nonce,
    })
    await publicClient.waitForTransactionReceipt({ hash: approveHash })

    // Step 3: Swap WETH for USDC using exactInputSingle
    nonce = await publicClient.getTransactionCount({
      address: account.address,
      blockTag: 'pending'
    })

    const swapData = encodeFunctionData({
      abi: [{
        inputs: [
          {
            components: [
              { internalType: 'address', name: 'tokenIn', type: 'address' },
              { internalType: 'address', name: 'tokenOut', type: 'address' },
              { internalType: 'uint24', name: 'fee', type: 'uint24' },
              { internalType: 'address', name: 'recipient', type: 'address' },
              { internalType: 'uint256', name: 'amountIn', type: 'uint256' },
              { internalType: 'uint256', name: 'amountOutMinimum', type: 'uint256' },
              { internalType: 'uint160', name: 'sqrtPriceLimitX96', type: 'uint160' },
            ],
            internalType: 'struct IV3SwapRouter.ExactInputSingleParams',
            name: 'params',
            type: 'tuple',
          },
        ],
        name: 'exactInputSingle',
        outputs: [{ internalType: 'uint256', name: 'amountOut', type: 'uint256' }],
        stateMutability: 'payable',
        type: 'function',
      }],
      functionName: 'exactInputSingle',
      args: [{
        tokenIn: tokens.WETH,
        tokenOut: tokens.USDC,
        fee: 3000, // 0.3%
        recipient: account.address,
        amountIn: amountIn,
        amountOutMinimum: 0n,
        sqrtPriceLimitX96: 0n,
      }],
    })

    console.log(`[swapTokens] Executing swap WETH -> USDC`)
    const swapHash = await walletClient.sendTransaction({
      to: routerAddress,
      data: swapData,
      nonce,
    })

    console.log(`[swapTokens] Swap sent! Hash: ${swapHash}`)
    return swapHash

  } else if (fromToken === 'USDC' && toToken === 'ETH') {
    const amountIn = parseUnits(amount, 6)
    
    // Check USDC balance
    const balance = await publicClient.readContract({
      address: tokens.USDC,
      abi: [{
        name: 'balanceOf',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
      }],
      functionName: 'balanceOf',
      args: [account.address],
    }) as bigint

    if (balance < amountIn) {
      throw new Error(`Insufficient USDC. Have ${formatUnits(balance, 6)}, need ${amount}`)
    }

    // Step 1: Approve USDC for router
    const currentAllowance = await publicClient.readContract({
      address: tokens.USDC,
      abi: [{
        name: 'allowance',
        type: 'function',
        stateMutability: 'view',
        inputs: [
          { name: 'owner', type: 'address' },
          { name: 'spender', type: 'address' },
        ],
        outputs: [{ name: '', type: 'uint256' }],
      }],
      functionName: 'allowance',
      args: [account.address, routerAddress],
    }) as bigint

    if (currentAllowance < amountIn) {
      console.log(`[swapTokens] Approving USDC for SwapRouter02`)
      const approveHash = await walletClient.sendTransaction({
        to: tokens.USDC,
        data: encodeFunctionData({
          abi: [{
            name: 'approve',
            type: 'function',
            stateMutability: 'nonpayable',
            inputs: [
              { name: 'spender', type: 'address' },
              { name: 'amount', type: 'uint256' },
            ],
            outputs: [{ name: '', type: 'bool' }],
          }],
          functionName: 'approve',
          args: [routerAddress, 2n ** 256n - 1n],
        }),
        nonce,
      })
      await publicClient.waitForTransactionReceipt({ hash: approveHash })
      
      nonce = await publicClient.getTransactionCount({
        address: account.address,
        blockTag: 'pending'
      })
    }

    // Step 2: Swap USDC -> WETH
    const swapData = encodeFunctionData({
      abi: [{
        inputs: [
          {
            components: [
              { internalType: 'address', name: 'tokenIn', type: 'address' },
              { internalType: 'address', name: 'tokenOut', type: 'address' },
              { internalType: 'uint24', name: 'fee', type: 'uint24' },
              { internalType: 'address', name: 'recipient', type: 'address' },
              { internalType: 'uint256', name: 'amountIn', type: 'uint256' },
              { internalType: 'uint256', name: 'amountOutMinimum', type: 'uint256' },
              { internalType: 'uint160', name: 'sqrtPriceLimitX96', type: 'uint160' },
            ],
            internalType: 'struct IV3SwapRouter.ExactInputSingleParams',
            name: 'params',
            type: 'tuple',
          },
        ],
        name: 'exactInputSingle',
        outputs: [{ internalType: 'uint256', name: 'amountOut', type: 'uint256' }],
        stateMutability: 'payable',
        type: 'function',
      }],
      functionName: 'exactInputSingle',
      args: [{
        tokenIn: tokens.USDC,
        tokenOut: tokens.WETH,
        fee: 3000,
        recipient: account.address,
        amountIn: amountIn,
        amountOutMinimum: 0n,
        sqrtPriceLimitX96: 0n,
      }],
    })

    console.log(`[swapTokens] Executing swap USDC -> WETH`)
    const swapHash = await walletClient.sendTransaction({
      to: routerAddress,
      data: swapData,
      nonce,
    })
    await publicClient.waitForTransactionReceipt({ hash: swapHash })

    // Step 3: Unwrap WETH to ETH
    nonce = await publicClient.getTransactionCount({
      address: account.address,
      blockTag: 'pending'
    })

    const wethBalance = await publicClient.readContract({
      address: tokens.WETH,
      abi: [{
        name: 'balanceOf',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }],
      }],
      functionName: 'balanceOf',
      args: [account.address],
    }) as bigint

    console.log(`[swapTokens] Unwrapping ${formatEther(wethBalance)} WETH to ETH`)
    const unwrapHash = await walletClient.sendTransaction({
      to: tokens.WETH,
      data: encodeFunctionData({
        abi: [{
          name: 'withdraw',
          type: 'function',
          stateMutability: 'nonpayable',
          inputs: [{ name: 'amount', type: 'uint256' }],
          outputs: [],
        }],
        functionName: 'withdraw',
        args: [wethBalance],
      }),
      nonce,
    })

    console.log(`[swapTokens] Unwrap sent! Hash: ${unwrapHash}`)
    return unwrapHash

  } else {
    throw new Error(`Invalid swap pair: ${fromToken} -> ${toToken}`)
  }
}
