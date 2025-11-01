import { createWalletClient, createPublicClient, http, parseEther, parseUnits, formatEther, formatUnits, encodeFunctionData, type Address, type Chain } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base } from 'viem/chains'
import { swapEthForTokenZeroEx } from './zeroex-swap'
import { withNonceLock } from './nonce-lock'

const WETH_ADDRESS = '0x4200000000000000000000000000000000000006' as Address
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address
const ZERO_EX_PRICE_ENDPOINT = 'https://api.0x.org/swap/allowance-holder/price'
const ZERO_EX_QUOTE_ENDPOINT = 'https://api.0x.org/swap/allowance-holder/quote'

function createClients(privateKey: string, rpcUrl?: string) {
  const transport = rpcUrl ? http(rpcUrl) : http(process.env.BASE_RPC_URL || 'https://base.publicnode.com')
  const account = privateKeyToAccount(privateKey as `0x${string}`)
  const chain = base
  return {
    account,
    walletClient: createWalletClient({ account, chain, transport }),
    publicClient: createPublicClient({ chain, transport }),
    chain,
  }
}

async function approveIfNeeded(
  walletClient: ReturnType<typeof createClients>['walletClient'],
  publicClient: ReturnType<typeof createClients>['publicClient'],
  account: ReturnType<typeof privateKeyToAccount>,
  chain: Chain,
  tokenAddress: Address,
  spender: Address,
  currentAllowance: bigint,
  requiredAmount: bigint
) {
  if (currentAllowance >= requiredAmount) return

  console.log(`[zeroExSwap] Approving ${tokenAddress} for ${spender}`)
  const approveHash = await walletClient.sendTransaction({
    account,
    chain: undefined,
    to: tokenAddress,
    data: encodeFunctionData({
      abi: [{ name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] }],
      functionName: 'approve',
      args: [spender, BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')],
    }),
  })
  await publicClient.waitForTransactionReceipt({ hash: approveHash })
}

async function fetchZeroExQuote(
  headers: Record<string, string>,
  params: URLSearchParams,
  taker: Address
) {
  const priceRes = await fetch(`${ZERO_EX_PRICE_ENDPOINT}?${params.toString()}`, { headers })
  if (!priceRes.ok) {
    const err = await priceRes.text()
    throw new Error(`[zeroExSwap] Price error (${priceRes.status}): ${err}`)
  }

  const price = await priceRes.json()

  const quoteParams = new URLSearchParams(params)
  quoteParams.append('taker', taker)

  const quoteRes = await fetch(`${ZERO_EX_QUOTE_ENDPOINT}?${quoteParams.toString()}`, { headers })
  if (!quoteRes.ok) {
    const err = await quoteRes.text()
    throw new Error(`[zeroExSwap] Quote error (${quoteRes.status}): ${err}`)
  }

  return { price, quote: await quoteRes.json() }
}

export async function swapTokens(
  privateKey: string,
  fromToken: 'ETH' | 'USDC',
  toToken: 'ETH' | 'USDC',
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

  const { account, walletClient, publicClient, chain } = createClients(privateKey, rpcUrl)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    '0x-api-key': zeroExKey,
    '0x-version': 'v2',
  }

  if (fromToken === 'ETH' && toToken === 'USDC') {
    // Reuse the dedicated ETH -> token helper
    return await swapEthForTokenZeroEx(privateKey, USDC_ADDRESS, amount, chainName, rpcUrl)
  }

  if (fromToken === 'USDC' && toToken === 'ETH') {
    const sellAmount = parseUnits(amount, 6)

    const usdcBalance = await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: [{ name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] }],
      functionName: 'balanceOf',
      args: [account.address],
    }) as bigint

    if (usdcBalance < sellAmount) {
      throw new Error(`Insufficient USDC. Have ${formatUnits(usdcBalance, 6)}, need ${amount}`)
    }

    // Use nonce lock to prevent concurrent transactions from the same address
    return await withNonceLock(account.address, async () => {
      const params = new URLSearchParams({
        chainId: String(chain.id),
        sellToken: USDC_ADDRESS,
        buyToken: WETH_ADDRESS,
        sellAmount: sellAmount.toString(),
      })

      console.log(`[zeroExSwap] Swapping ${amount} USDC for ETH`)

      const { price, quote } = await fetchZeroExQuote(headers, params, account.address)

      if (price?.issues?.allowance) {
        const currentAllowance = BigInt(price.issues.allowance.currentAllowance || '0')
        await approveIfNeeded(
          walletClient,
          publicClient,
          account,
          chain,
          USDC_ADDRESS,
          price.issues.allowance.spender,
          currentAllowance,
          sellAmount
        )
      }

      const preWethBalance = await publicClient.readContract({
        address: WETH_ADDRESS,
        abi: [{ name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] }],
        functionName: 'balanceOf',
        args: [account.address],
      }) as bigint

      const txRequest = {
        to: quote.transaction?.to as Address,
        data: quote.transaction?.data as `0x${string}`,
        value: quote.transaction?.value ? BigInt(quote.transaction.value) : undefined,
        gas: quote.transaction?.gas ? BigInt(quote.transaction.gas) : undefined,
        maxFeePerGas: quote.transaction?.maxFeePerGas ? BigInt(quote.transaction.maxFeePerGas) : undefined,
        maxPriorityFeePerGas: quote.transaction?.maxPriorityFeePerGas ? BigInt(quote.transaction.maxPriorityFeePerGas) : undefined,
      }

      console.log('[zeroExSwap] Executing swap via 0x AllowanceHolder')
      const swapHash = await walletClient.sendTransaction({
        ...txRequest,
        account,
        chain: undefined,
      })
      await publicClient.waitForTransactionReceipt({ hash: swapHash })

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
          account,
          chain: undefined,
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

  throw new Error(`Invalid swap pair: ${fromToken} -> ${toToken}`)
}

export async function swapEthForToken(
  privateKey: string,
  tokenAddress: string,
  amount: string,
  chainName: string = 'base',
  rpcUrl?: string
): Promise<string> {
  return await swapEthForTokenZeroEx(privateKey, tokenAddress, amount, chainName, rpcUrl)
}