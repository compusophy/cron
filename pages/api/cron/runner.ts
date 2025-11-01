// This endpoint is called by Vercel cron every minute
// It checks Redis for active cron jobs and executes them based on their schedules
import { NextApiRequest, NextApiResponse } from 'next'
import { kv } from '@vercel/kv'
import { CronJobConfig } from './create'
import { shouldRunJob } from '@/lib/cron-scheduler'
import { sendEth } from '@/lib/eth'
import { swapTokens, swapEthForToken, swapTokenForEth } from '@/lib/swap'
import { recordWalletLog } from '@/lib/wallet-logs'
import { randomBytes } from 'crypto'
import { createPublicClient, http, parseEther, formatEther, formatUnits, parseUnits, type Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { base, sepolia, mainnet } from 'viem/chains'
import { getTokenMetadata } from '@/lib/token-metadata'

const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

async function getMaxEthBalance(privateKey: string, chainName: string, rpcUrl?: string): Promise<string> {
  // Determine chain
  const chain = chainName === 'base' ? base : chainName === 'mainnet' ? mainnet : sepolia
  
  // Get RPC URL
  const finalRpcUrl = rpcUrl || (chainName === 'base' ? process.env.BASE_RPC_URL : process.env.ETH_RPC_URL)
  const transport = finalRpcUrl ? http(finalRpcUrl) : http(chainName === 'base' ? 'https://base.publicnode.com' : 'https://rpc.sepolia.org')
  
  const account = privateKeyToAccount(privateKey as `0x${string}`)
  const publicClient = createPublicClient({ chain, transport })
  
  const balance = await publicClient.getBalance({ address: account.address })
  
  // Reserve ~0.001 ETH for gas (estimate for standard transaction)
  const gasReserve = parseEther('0.001')
  const maxAmount = balance > gasReserve ? balance - gasReserve : 0n
  
  return formatEther(maxAmount)
}

async function getMaxTokenBalance(
  privateKey: string,
  tokenAddress: string,
  chainName: string,
  rpcUrl?: string
): Promise<string> {
  // Determine chain
  const chain = chainName === 'base' ? base : chainName === 'mainnet' ? mainnet : sepolia
  
  // Get RPC URL
  const finalRpcUrl = rpcUrl || (chainName === 'base' ? process.env.BASE_RPC_URL : process.env.ETH_RPC_URL)
  const transport = finalRpcUrl ? http(finalRpcUrl) : http(chainName === 'base' ? 'https://base.publicnode.com' : 'https://rpc.sepolia.org')
  
  const account = privateKeyToAccount(privateKey as `0x${string}`)
  const publicClient = createPublicClient({ chain, transport })
  
  // Get token metadata for decimals
  const metadata = await getTokenMetadata(tokenAddress, finalRpcUrl)
  const decimals = metadata?.decimals || 18
  
  // Get token balance
  const balance = await publicClient.readContract({
    address: tokenAddress.toLowerCase() as Address,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [account.address],
  }) as bigint
  
  return formatUnits(balance, decimals)
}

function resolveLogWalletId(jobConfig: CronJobConfig) {
  return jobConfig.walletId || null
}

async function recordWalletActivity(jobConfig: CronJobConfig, type: string, status: 'success' | 'error', payload: { txHash?: string; message?: string; details?: Record<string, any> }) {
  const walletId = resolveLogWalletId(jobConfig)
  if (!walletId) return

  try {
    await recordWalletLog({
      walletId,
      type,
      status,
      txHash: payload.txHash,
      message: payload.message,
      details: payload.details,
    })
  } catch (err) {
    console.warn('Failed to record wallet log for cron job', jobConfig.id, err)
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Verify this is a cron request from Vercel
  // Vercel sends cron jobs with a specific header, but for local dev/testing
  // we can allow manual calls if CRON_SECRET is set
  const cronSecret = req.headers['authorization']?.replace('Bearer ', '')
  const vercelCronHeader = req.headers['vercel-cron'] || req.headers['x-vercel-cron']
  
  // For production, Vercel automatically includes the cron header
  // For local dev, check CRON_SECRET env var
  if (!vercelCronHeader && cronSecret !== process.env.CRON_SECRET) {
    // Allow if no CRON_SECRET is set (for easier local development)
    if (process.env.CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
  }

  try {
    console.log(`[Cron Runner] Starting cron runner at ${new Date().toISOString()}`)
    
    // Get all active job IDs from Redis
    const jobIds = await kv.smembers('cron:jobs:active')
    
    console.log(`[Cron Runner] Found ${jobIds.length} active job(s)`)
    
    if (!jobIds || jobIds.length === 0) {
      return res.status(200).json({ 
        message: 'No active cron jobs',
        executed: []
      })
    }

    const results: Array<{
      jobId: string
      status: string
      jobName?: string
      type?: string
      txHash?: string
      from?: string
      to?: string
      amount?: string
      executedAt?: number
      error?: string
    }> = []

    // Process each job
    for (const jobId of jobIds) {
      try {
        const jobConfig = await kv.get<CronJobConfig>(`cron:job:${jobId}`)
        
        if (!jobConfig || !jobConfig.enabled) {
          continue
        }

        // Check if job should run based on schedule
        const shouldRun = shouldRunJob(jobConfig.schedule, jobConfig.lastRunTime)
        
        if (!shouldRun) {
          console.log(`[Cron Runner] Job ${jobId} skipped - schedule doesn't match or already ran recently`)
          continue
        }
        
        console.log(`[Cron Runner] Job ${jobId} should run! Schedule: ${jobConfig.schedule}, Last run: ${jobConfig.lastRunTime}`)

        // Execute the job based on type
        let result: any = { jobId, status: 'skipped' }

        if (jobConfig.type === 'eth_transfer') {
          try {
            // Get RPC URL from environment or use default
            const rpcUrl = process.env.ETH_RPC_URL
            const chainName = jobConfig.chain || 'sepolia'
            
            // Calculate amount: use max balance if useMax is true, otherwise use configured amount
            let amountToSend = jobConfig.amount || '0'
            if (jobConfig.useMax) {
              amountToSend = await getMaxEthBalance(jobConfig.privateKey, chainName, rpcUrl)
              console.log(`[Cron Runner] Using Max: calculated max ETH balance = ${amountToSend}`)
            }
            
            console.log(`[Cron Runner] Executing job ${jobId}: ${jobConfig.name}`)
            console.log(`[Cron Runner] Chain: ${chainName}, From: ${jobConfig.address}, To: ${jobConfig.toAddress}, Amount: ${amountToSend}${jobConfig.useMax ? ' (Max)' : ''}`)
            
            const txHash = await sendEth(
              jobConfig.privateKey,
              jobConfig.toAddress!,
              amountToSend,
              chainName,
              rpcUrl
            )
            
            console.log(`[Cron Runner] Success! TX Hash: ${txHash}`)

            await recordWalletActivity(jobConfig, 'send', 'success', {
              txHash,
              details: {
                to: jobConfig.toAddress,
                amount: amountToSend,
                chain: jobConfig.chain,
                useMax: jobConfig.useMax,
              },
            })

            result = {
              jobId,
              jobName: jobConfig.name,
              type: 'eth_transfer',
              status: 'success',
              txHash,
              from: jobConfig.address,
              to: jobConfig.toAddress!,
              amount: amountToSend,
              executedAt: Date.now(),
            }

            // Reset failure count on success
            jobConfig.consecutiveFailures = 0
            jobConfig.lastRunTime = Date.now()
            await kv.set(`cron:job:${jobId}`, jobConfig)

            // Store log entry
            const logId = `log_${randomBytes(16).toString('hex')}`
            const logEntry = {
              id: logId,
              jobId,
              status: 'success' as const,
              txHash,
              executedAt: Date.now(),
              from: jobConfig.address,
              to: jobConfig.toAddress!,
              amount: jobConfig.amount!,
            }
            await kv.set(`cron:log:${logId}`, logEntry)
            await kv.lpush(`cron:job:${jobId}:logs`, logId)
            // Keep only last 100 logs per job
            await kv.ltrim(`cron:job:${jobId}:logs`, 0, 99)
          } catch (error: any) {
            console.error(`[Cron Runner] Error executing job ${jobId}:`, error)

            await recordWalletActivity(jobConfig, 'send', 'error', {
              message: error.message,
              details: {
                to: jobConfig.toAddress,
                amount: jobConfig.amount,
                chain: jobConfig.chain,
              },
            })
            
            // Increment failure count
            const failureCount = (jobConfig.consecutiveFailures || 0) + 1
            jobConfig.consecutiveFailures = failureCount
            
            // Auto-pause after 3 consecutive failures
            const MAX_FAILURES = 3
            if (failureCount >= MAX_FAILURES) {
              jobConfig.enabled = false
              console.log(`[Cron Runner] Auto-pausing job ${jobId} after ${failureCount} consecutive failures`)
            }
            
            // Save updated job config to Redis
            jobConfig.lastRunTime = Date.now()
            await kv.set(`cron:job:${jobId}`, jobConfig)

            result = {
              jobId,
              jobName: jobConfig.name,
              type: 'eth_transfer',
              status: 'error',
              error: error.message,
              executedAt: Date.now(),
              autoPaused: failureCount >= MAX_FAILURES,
            }

            // Store error log entry
            const logId = `log_${randomBytes(16).toString('hex')}`
            const logEntry = {
              id: logId,
              jobId,
              status: 'error' as const,
              error: error.message,
              executedAt: Date.now(),
              autoPaused: failureCount >= MAX_FAILURES,
            }
            await kv.set(`cron:log:${logId}`, logEntry)
            await kv.lpush(`cron:job:${jobId}:logs`, logId)
            // Keep only last 100 logs per job
            await kv.ltrim(`cron:job:${jobId}:logs`, 0, 99)
          }
        } else if (jobConfig.type === 'swap') {
          try {
            // Get RPC URL from environment or use default
            const rpcUrl = process.env.ETH_RPC_URL
            const chainName = jobConfig.chain || 'base'
            
            console.log(`[Cron Runner] Executing swap job ${jobId}: ${jobConfig.name}`)
            console.log(`[Cron Runner] Chain: ${chainName}, From: ${jobConfig.address}, Swap: ${jobConfig.swapAmount} ${jobConfig.fromToken} -> ${jobConfig.toToken}`)
            
            if (!jobConfig.fromToken || !jobConfig.toToken || !jobConfig.swapAmount) {
              throw new Error('Missing swap configuration: fromToken, toToken, or swapAmount')
            }
            
            const txHash = await swapTokens(
              jobConfig.privateKey,
              jobConfig.fromToken,
              jobConfig.toToken,
              jobConfig.swapAmount,
              chainName,
              rpcUrl
            )
            
            console.log(`[Cron Runner] Swap success! TX Hash: ${txHash}`)

            await recordWalletActivity(jobConfig, 'swap', 'success', {
              txHash,
              details: {
                fromToken: jobConfig.fromToken,
                toToken: jobConfig.toToken,
                amount: jobConfig.swapAmount,
                chain: jobConfig.chain,
              },
            })

            result = {
              jobId,
              jobName: jobConfig.name,
              type: 'swap',
              status: 'success',
              txHash,
              from: jobConfig.address,
              fromToken: jobConfig.fromToken,
              toToken: jobConfig.toToken,
              amount: jobConfig.swapAmount,
              executedAt: Date.now(),
            }

            // Reset failure count on success
            jobConfig.consecutiveFailures = 0
            jobConfig.lastRunTime = Date.now()
            await kv.set(`cron:job:${jobId}`, jobConfig)

            // Store log entry
            const logId = `log_${randomBytes(16).toString('hex')}`
            const logEntry = {
              id: logId,
              jobId,
              status: 'success' as const,
              txHash,
              executedAt: Date.now(),
              from: jobConfig.address,
              fromToken: jobConfig.fromToken,
              toToken: jobConfig.toToken,
              amount: jobConfig.swapAmount,
            }
            await kv.set(`cron:log:${logId}`, logEntry)
            await kv.lpush(`cron:job:${jobId}:logs`, logId)
            // Keep only last 100 logs per job
            await kv.ltrim(`cron:job:${jobId}:logs`, 0, 99)
          } catch (error: any) {
            console.error(`[Cron Runner] Error executing swap job ${jobId}:`, error)

            await recordWalletActivity(jobConfig, 'swap', 'error', {
              message: error.message,
              details: {
                fromToken: jobConfig.fromToken,
                toToken: jobConfig.toToken,
                amount: jobConfig.swapAmount,
                chain: jobConfig.chain,
              },
            })
            
            // Increment failure count
            const failureCount = (jobConfig.consecutiveFailures || 0) + 1
            jobConfig.consecutiveFailures = failureCount
            
            // Auto-pause after 3 consecutive failures
            const MAX_FAILURES = 3
            if (failureCount >= MAX_FAILURES) {
              jobConfig.enabled = false
              console.log(`[Cron Runner] Auto-pausing job ${jobId} after ${failureCount} consecutive failures`)
            }
            
            // Save updated job config to Redis
            jobConfig.lastRunTime = Date.now()
            await kv.set(`cron:job:${jobId}`, jobConfig)

            result = {
              jobId,
              jobName: jobConfig.name,
              type: 'swap',
              status: 'error',
              error: error.message,
              executedAt: Date.now(),
              autoPaused: failureCount >= MAX_FAILURES,
            }

            // Store error log entry
            const logId = `log_${randomBytes(16).toString('hex')}`
            const logEntry = {
              id: logId,
              jobId,
              status: 'error' as const,
              error: error.message,
              executedAt: Date.now(),
              autoPaused: failureCount >= MAX_FAILURES,
            }
            await kv.set(`cron:log:${logId}`, logEntry)
            await kv.lpush(`cron:job:${jobId}:logs`, logId)
            // Keep only last 100 logs per job
            await kv.ltrim(`cron:job:${jobId}:logs`, 0, 99)
          }
        } else if (jobConfig.type === 'token_swap') {
          try {
            const chainName = jobConfig.chain || 'base'
            const rpcUrl = chainName === 'base' ? process.env.BASE_RPC_URL : process.env.ETH_RPC_URL
            const swapDirection = jobConfig.swapDirection || 'eth_to_token'

            if (!jobConfig.tokenAddress) {
              throw new Error('Missing token swap configuration: tokenAddress')
            }

            // Calculate amount: use max balance if useMax is true
            let amountToSwap = jobConfig.swapAmount || '0'
            if (jobConfig.useMax) {
              if (swapDirection === 'eth_to_token') {
                amountToSwap = await getMaxEthBalance(jobConfig.privateKey, chainName, rpcUrl)
                console.log(`[Cron Runner] Using Max: calculated max ETH balance = ${amountToSwap}`)
              } else {
                amountToSwap = await getMaxTokenBalance(jobConfig.privateKey, jobConfig.tokenAddress, chainName, rpcUrl)
                console.log(`[Cron Runner] Using Max: calculated max token balance = ${amountToSwap}`)
              }
            }

            console.log(`[Cron Runner] Executing token swap job ${jobId}: ${jobConfig.name}`)
            console.log(`[Cron Runner] Chain: ${chainName}, From: ${jobConfig.address}, Swap: ${amountToSwap} ${swapDirection === 'eth_to_token' ? 'ETH' : 'Tokens'} -> ${swapDirection === 'eth_to_token' ? 'Token' : 'ETH'}${jobConfig.useMax ? ' (Max)' : ''}`)

            let txHash: string
            if (swapDirection === 'eth_to_token') {
              txHash = await swapEthForToken(
                jobConfig.privateKey,
                jobConfig.tokenAddress,
                amountToSwap,
                chainName,
                rpcUrl
              )
            } else {
              // Token to ETH - need token decimals
              const metadata = await getTokenMetadata(jobConfig.tokenAddress, rpcUrl)
              const tokenDecimals = metadata?.decimals || 18
              
              txHash = await swapTokenForEth(
                jobConfig.privateKey,
                jobConfig.tokenAddress,
                amountToSwap,
                tokenDecimals,
                chainName,
                rpcUrl
              )
            }

            console.log(`[Cron Runner] Token swap success! TX Hash: ${txHash}`)

            await recordWalletActivity(jobConfig, 'token_swap', 'success', {
              txHash,
              details: {
                tokenAddress: jobConfig.tokenAddress,
                amount: amountToSwap,
                chain: jobConfig.chain,
                swapDirection,
                useMax: jobConfig.useMax,
              },
            })

            result = {
              jobId,
              jobName: jobConfig.name,
              type: 'token_swap',
              status: 'success',
              txHash,
              from: jobConfig.address,
              tokenAddress: jobConfig.tokenAddress,
              amount: amountToSwap,
              executedAt: Date.now(),
            }

            jobConfig.consecutiveFailures = 0
            jobConfig.lastRunTime = Date.now()
            await kv.set(`cron:job:${jobId}`, jobConfig)

            const logId = `log_${randomBytes(16).toString('hex')}`
            const logEntry = {
              id: logId,
              jobId,
              status: 'success' as const,
              txHash,
              executedAt: Date.now(),
              from: jobConfig.address,
              tokenAddress: jobConfig.tokenAddress,
              amount: jobConfig.swapAmount,
            }
            await kv.set(`cron:log:${logId}`, logEntry)
            await kv.lpush(`cron:job:${jobId}:logs`, logId)
            await kv.ltrim(`cron:job:${jobId}:logs`, 0, 99)
          } catch (error: any) {
            console.error(`[Cron Runner] Error executing token swap job ${jobId}:`, error)

            await recordWalletActivity(jobConfig, 'token_swap', 'error', {
              message: error.message,
              details: {
                tokenAddress: jobConfig.tokenAddress,
                amount: jobConfig.swapAmount,
                chain: jobConfig.chain,
              },
            })

            const failureCount = (jobConfig.consecutiveFailures || 0) + 1
            jobConfig.consecutiveFailures = failureCount

            const MAX_FAILURES = 3
            if (failureCount >= MAX_FAILURES) {
              jobConfig.enabled = false
              console.log(`[Cron Runner] Auto-pausing job ${jobId} after ${failureCount} consecutive failures`)
            }
            
            // Save updated job config to Redis
            jobConfig.lastRunTime = Date.now()
            await kv.set(`cron:job:${jobId}`, jobConfig)

            result = {
              jobId,
              jobName: jobConfig.name,
              type: 'token_swap',
              status: 'error',
              error: error.message,
              executedAt: Date.now(),
              autoPaused: failureCount >= MAX_FAILURES,
            }

            const logId = `log_${randomBytes(16).toString('hex')}`
            const logEntry = {
              id: logId,
              jobId,
              status: 'error' as const,
              error: error.message,
              executedAt: Date.now(),
              autoPaused: failureCount >= MAX_FAILURES,
            }
            await kv.set(`cron:log:${logId}`, logEntry)
            await kv.lpush(`cron:job:${jobId}:logs`, logId)
            await kv.ltrim(`cron:job:${jobId}:logs`, 0, 99)
          }
        }
      } catch (error: any) {
        console.error(`[Cron Runner] Error processing job ${jobId}:`, error)
        // If an error occurs during job execution, record it as an error
        const logId = `log_${randomBytes(16).toString('hex')}`
        const logEntry = {
          id: logId,
          jobId,
          status: 'error' as const,
          error: error.message,
          executedAt: Date.now(),
        }
        await kv.set(`cron:log:${logId}`, logEntry)
        await kv.lpush(`cron:job:${jobId}:logs`, logId)
        await kv.ltrim(`cron:job:${jobId}:logs`, 0, 99)
      }
    }

    return res.status(200).json({
      message: 'Cron jobs processed',
      executed: results,
    })
  } catch (error: any) {
    console.error('[Cron Runner] Error in main handler:', error)
    return res.status(500).json({ error: error.message || 'Internal Server Error' })
  }
}