import { createWalletClient, createPublicClient, http, type Address, parseEther, formatEther, formatUnits, parseUnits, encodeFunctionData, getAddress, maxUint256 } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'
import { withNonceLock } from './nonce-lock'

const WETH_ADDRESS = '0x4200000000000000000000000000000000000006' as Address
const ZERO_EX_PRICE_ENDPOINT = 'https://api.0x.org/swap/allowance-holder/price'
const ZERO_EX_QUOTE_ENDPOINT = 'https://api.0x.org/swap/allowance-holder/quote'

const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

export async function swapEthForTokenZeroEx(
  privateKey: string,
  tokenAddress: string,
  amount: string,
  chainName: string = 'base',
  rpcUrl?: string
): Promise<string> {
  if (chainName !== 'base') {
    throw new Error(`Unsupported chain: ${chainName}. Only 'base' is currently supported.`)
  }

  const zeroExKey = process.env.ZERO_EX_API_KEY
  if (!zeroExKey) {
    throw new Error('ZERO_EX_API_KEY environment variable is required for 0x swaps.')
  }

  const transport = rpcUrl ? http(rpcUrl) : http(process.env.BASE_RPC_URL || 'https://base.publicnode.com')
  const chain = base

  const account = privateKeyToAccount(privateKey as `0x${string}`)
  const walletClient = createWalletClient({ account, chain, transport })
  const publicClient = createPublicClient({ chain, transport })

  const amountWei = parseEther(amount)
  const ethBalance = await publicClient.getBalance({ address: account.address })
  if (ethBalance < amountWei) {
    throw new Error(`Insufficient ETH. Have ${formatEther(ethBalance)}, need ${amount}`)
  }

  // Use nonce lock to prevent concurrent transactions from the same address
  return await withNonceLock(account.address, async () => {
    console.log(`[zeroExSwap] Swapping ${formatEther(amountWei)} ETH for ${tokenAddress}`)

    // Ensure we have enough WETH to cover the swap (wrap the shortfall if needed)
    const wethBalance = await publicClient.readContract({
      address: WETH_ADDRESS,
      abi: [{ name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] }],
      functionName: 'balanceOf',
      args: [account.address],
    }) as bigint

    if (wethBalance < amountWei) {
      const wrapAmount = amountWei - wethBalance
      console.log(`[zeroExSwap] Wrapping ${formatEther(wrapAmount)} ETH to WETH`)
      const wrapHash = await walletClient.sendTransaction({
        to: WETH_ADDRESS,
        data: encodeFunctionData({
          abi: [{ name: 'deposit', type: 'function', stateMutability: 'payable', inputs: [], outputs: [] }],
          functionName: 'deposit',
        }),
        value: wrapAmount,
      })
      await publicClient.waitForTransactionReceipt({ hash: wrapHash })
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      '0x-api-key': zeroExKey,
      '0x-version': 'v2',
    }

    const sellToken = WETH_ADDRESS
    const buyToken = getAddress(tokenAddress)
    const baseParams = new URLSearchParams({
      chainId: String(chain.id),
      sellToken,
      buyToken,
      sellAmount: amountWei.toString(),
    })

    console.log('[zeroExSwap] Getting price')
    const priceRes = await fetch(`${ZERO_EX_PRICE_ENDPOINT}?${baseParams.toString()}`, { headers })
    if (!priceRes.ok) {
      const err = await priceRes.text()
      throw new Error(`[zeroExSwap] Price error (${priceRes.status}): ${err}`)
    }

    const price = await priceRes.json()

    if (price?.issues?.allowance) {
      const spender: Address = price.issues.allowance.spender
      console.log(`[zeroExSwap] Approving WETH for AllowanceHolder: ${spender}`)
      const approveHash = await walletClient.sendTransaction({
        to: WETH_ADDRESS,
        data: encodeFunctionData({
          abi: [{ name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] }],
          functionName: 'approve',
          args: [spender, maxUint256],
        }),
      })
      await publicClient.waitForTransactionReceipt({ hash: approveHash })
    }

    const quoteParams = new URLSearchParams(baseParams)
    quoteParams.append('taker', account.address)

    console.log('[zeroExSwap] Getting quote')
    const quoteRes = await fetch(`${ZERO_EX_QUOTE_ENDPOINT}?${quoteParams.toString()}`, { headers })
    if (!quoteRes.ok) {
      const err = await quoteRes.text()
      throw new Error(`[zeroExSwap] Quote error (${quoteRes.status}): ${err}`)
    }

    const quote = await quoteRes.json()
    const txRequest = {
      to: quote.transaction?.to as Address,
      data: quote.transaction?.data as `0x${string}`,
      value: quote.transaction?.value ? BigInt(quote.transaction.value) : undefined,
      gas: quote.transaction?.gas ? BigInt(quote.transaction.gas) : undefined,
      maxFeePerGas: quote.transaction?.maxFeePerGas ? BigInt(quote.transaction.maxFeePerGas) : undefined,
      maxPriorityFeePerGas: quote.transaction?.maxPriorityFeePerGas ? BigInt(quote.transaction.maxPriorityFeePerGas) : undefined,
    }

    console.log('[zeroExSwap] Executing swap via 0x AllowanceHolder')
    const txHash = await walletClient.sendTransaction(txRequest)
    await publicClient.waitForTransactionReceipt({ hash: txHash })
    return txHash
  }, chain.id)
}

export async function swapTokenForEthZeroEx(
  privateKey: string,
  tokenAddress: string,
  amount: string,
  tokenDecimals: number = 18,
  chainName: string = 'base',
  rpcUrl?: string
): Promise<string> {
  if (chainName !== 'base') {
    throw new Error(`Unsupported chain: ${chainName}. Only 'base' is currently supported.`)
  }

  const zeroExKey = process.env.ZERO_EX_API_KEY
  if (!zeroExKey) {
    throw new Error('ZERO_EX_API_KEY environment variable is required for 0x swaps.')
  }

  const transport = rpcUrl ? http(rpcUrl) : http(process.env.BASE_RPC_URL || 'https://base.publicnode.com')
  const chain = base

  const account = privateKeyToAccount(privateKey as `0x${string}`)
  const walletClient = createWalletClient({ account, chain, transport })
  const publicClient = createPublicClient({ chain, transport })

  const tokenAddressLower = tokenAddress.toLowerCase() as Address
  
  // Parse amount to smallest unit, ensuring it's a valid positive number
  let amountUnits: bigint
  try {
    // Ensure amount is a valid string representation of a number
    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      throw new Error(`Invalid amount: ${amount}. Must be a positive number.`)
    }
    amountUnits = parseUnits(amount, tokenDecimals)
    
    // Ensure the parsed amount is a positive integer
    if (amountUnits <= 0n) {
      throw new Error(`Invalid amount: ${amount}. Parsed to ${amountUnits.toString()}, must be positive.`)
    }
  } catch (error: any) {
    if (error.message?.includes('Invalid amount')) {
      throw error
    }
    throw new Error(`Failed to parse amount "${amount}" with ${tokenDecimals} decimals: ${error.message}`)
  }

  // Check token balance
  const tokenBalance = await publicClient.readContract({
    address: tokenAddressLower,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [account.address],
  }) as bigint

  if (tokenBalance < amountUnits) {
    throw new Error(`Insufficient token balance. Have ${formatUnits(tokenBalance, tokenDecimals)}, need ${amount}`)
  }
  
  // Double-check that amountUnits is a valid positive integer for the API
  if (amountUnits.toString().includes('.') || amountUnits <= 0n) {
    throw new Error(`Invalid sellAmount for 0x API: ${amountUnits.toString()}. Must be a positive integer.`)
  }

  return await withNonceLock(account.address, async () => {
    console.log(`[zeroExSwap] Swapping ${amount} tokens (${tokenAddress}) for ETH`)

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      '0x-api-key': zeroExKey,
      '0x-version': 'v2',
    }

    const sellToken = tokenAddressLower
    const buyToken = WETH_ADDRESS // Buy WETH, which can be unwrapped if needed
    const baseParams = new URLSearchParams({
      chainId: String(chain.id),
      sellToken,
      buyToken,
      sellAmount: amountUnits.toString(),
    })

    console.log('[zeroExSwap] Getting price for token -> ETH')
    const priceRes = await fetch(`${ZERO_EX_PRICE_ENDPOINT}?${baseParams.toString()}`, { headers })
    if (!priceRes.ok) {
      const err = await priceRes.text()
      throw new Error(`[zeroExSwap] Price error (${priceRes.status}): ${err}`)
    }

    const price = await priceRes.json()

    // Approve token if needed
    if (price?.issues?.allowance) {
      const spender: Address = price.issues.allowance.spender
      console.log(`[zeroExSwap] Approving token ${tokenAddress} for AllowanceHolder: ${spender}`)

      const approveHash = await walletClient.sendTransaction({
        to: tokenAddressLower,
        data: encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [spender, maxUint256],
        }),
      })
      await publicClient.waitForTransactionReceipt({ hash: approveHash })
    }

    const quoteParams = new URLSearchParams(baseParams)
    quoteParams.append('taker', account.address)

    console.log('[zeroExSwap] Getting quote for token -> ETH')
    const quoteRes = await fetch(`${ZERO_EX_QUOTE_ENDPOINT}?${quoteParams.toString()}`, { headers })
    if (!quoteRes.ok) {
      const err = await quoteRes.text()
      throw new Error(`[zeroExSwap] Quote error (${quoteRes.status}): ${err}`)
    }

    const quote = await quoteRes.json()
    const txRequest = {
      to: quote.transaction?.to as Address,
      data: quote.transaction?.data as `0x${string}`,
      value: quote.transaction?.value ? BigInt(quote.transaction.value) : undefined,
      gas: quote.transaction?.gas ? BigInt(quote.transaction.gas) : undefined,
      maxFeePerGas: quote.transaction?.maxFeePerGas ? BigInt(quote.transaction.maxFeePerGas) : undefined,
      maxPriorityFeePerGas: quote.transaction?.maxPriorityFeePerGas ? BigInt(quote.transaction.maxPriorityFeePerGas) : undefined,
    }

    console.log('[zeroExSwap] Executing swap via 0x AllowanceHolder')
    
    // Get WETH balance before swap
    const preWethBalance = await publicClient.readContract({
      address: WETH_ADDRESS,
      abi: [{ name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] }],
      functionName: 'balanceOf',
      args: [account.address],
    }) as bigint

    const swapHash = await walletClient.sendTransaction(txRequest)
    await publicClient.waitForTransactionReceipt({ hash: swapHash })
    
    // Check if we received WETH and unwrap it to ETH
    const postWethBalance = await publicClient.readContract({
      address: WETH_ADDRESS,
      abi: [{ name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] }],
      functionName: 'balanceOf',
      args: [account.address],
    }) as bigint

    const receivedWeth = postWethBalance - preWethBalance
    if (receivedWeth > 0n) {
      console.log(`[zeroExSwap] Unwrapping ${formatEther(receivedWeth)} WETH to ETH`)
      const unwrapHash = await walletClient.sendTransaction({
        to: WETH_ADDRESS,
        data: encodeFunctionData({
          abi: [{ name: 'withdraw', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] }],
          functionName: 'withdraw',
          args: [receivedWeth],
        }),
      })
      await publicClient.waitForTransactionReceipt({ hash: unwrapHash })
      return unwrapHash
    }
    
    return swapHash
  }, chain.id)
}
