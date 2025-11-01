import { kv } from '@vercel/kv'
import type { Address } from 'viem'

const LOCK_TTL = 60 // Lock expires after 60 seconds to prevent deadlocks
const LOCK_RETRY_DELAY = 100 // Wait 100ms between retries
const MAX_LOCK_WAIT = 10000 // Maximum 10 seconds to wait for lock

/**
 * Acquires a distributed lock for a specific address to prevent nonce conflicts
 * @param address The wallet address that needs the lock
 * @param chainId Optional chain ID to differentiate locks per chain
 * @returns Lock ID if acquired, null if couldn't acquire within timeout
 */
export async function acquireNonceLock(
  address: Address,
  chainId?: number
): Promise<string | null> {
  const lockKey = `nonce:lock:${chainId || 'default'}:${address.toLowerCase()}`
  const lockId = `${Date.now()}-${Math.random().toString(36).substring(7)}`
  
  const startTime = Date.now()
  
  while (Date.now() - startTime < MAX_LOCK_WAIT) {
    // Check if lock exists
    const existingLock = await kv.get<string>(lockKey)
    
    if (!existingLock) {
      // Lock doesn't exist, try to acquire it
      // Set the lock value
      await kv.set(lockKey, lockId)
      
      // Try to set expiration (may not be supported in all KV implementations)
      try {
        // @ts-ignore - expire may not be in types but exists in Redis
        await kv.expire(lockKey, LOCK_TTL)
      } catch (e) {
        // If expire is not supported, lock will still work but won't auto-expire
        // The lock will be released when releaseNonceLock is called
        console.warn(`[NonceLock] Expire not supported, lock will not auto-expire: ${e}`)
      }
      
      // Double-check we got the lock (handle race condition)
      const verifyLock = await kv.get<string>(lockKey)
      if (verifyLock === lockId) {
        console.log(`[NonceLock] Acquired lock for ${address} (lock: ${lockId})`)
        return lockId
      }
    }
    
    // Lock is held by another process, wait and retry
    await new Promise(resolve => setTimeout(resolve, LOCK_RETRY_DELAY))
  }
  
  console.warn(`[NonceLock] Failed to acquire lock for ${address} within ${MAX_LOCK_WAIT}ms`)
  return null
}

/**
 * Releases a distributed lock for a specific address
 * @param address The wallet address
 * @param lockId The lock ID returned by acquireNonceLock
 * @param chainId Optional chain ID
 */
export async function releaseNonceLock(
  address: Address,
  lockId: string,
  chainId?: number
): Promise<void> {
  const lockKey = `nonce:lock:${chainId || 'default'}:${address.toLowerCase()}`
  
  // Only delete if the lock ID matches (to prevent deleting someone else's lock)
  const currentLockId = await kv.get<string>(lockKey)
  
  if (currentLockId === lockId) {
    await kv.del(lockKey)
    console.log(`[NonceLock] Released lock for ${address} (lock: ${lockId})`)
  } else {
    console.warn(`[NonceLock] Lock ID mismatch for ${address}. Expected ${lockId}, got ${currentLockId}`)
  }
}

/**
 * Executes a function with a nonce lock to prevent concurrent transactions from the same address
 * @param address The wallet address
 * @param fn The function to execute
 * @param chainId Optional chain ID
 * @returns The result of the function
 */
export async function withNonceLock<T>(
  address: Address,
  fn: () => Promise<T>,
  chainId?: number
): Promise<T> {
  const lockId = await acquireNonceLock(address, chainId)
  
  if (!lockId) {
    throw new Error(`Failed to acquire nonce lock for address ${address}. Another transaction may be in progress.`)
  }
  
  try {
    return await fn()
  } finally {
    await releaseNonceLock(address, lockId, chainId)
  }
}

