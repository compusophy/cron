import { createWalletClient, createPublicClient, http, type Address, parseEther, formatEther, encodeFunctionData, getAddress, maxUint256 } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'
import { withNonceLock } from './nonce-lock'

const WETH_ADDRESS = '0x4200000000000000000000000000000000000006' as Address
const ZERO_EX_PRICE_ENDPOINT = 'https://api.0x.org/swap/allowance-holder/price'
const ZERO_EX_QUOTE_ENDPOINT = 'https://api.0x.org/swap/allowance-holder/quote'

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
