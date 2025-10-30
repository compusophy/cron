/**
 * Example: Create a cron job that sends ETH to yourself every minute
 * 
 * Usage:
 *   node -r ts-node/register examples/create-cron-job.ts
 * 
 * Or compile and run:
 *   tsc examples/create-cron-job.ts && node examples/create-cron-job.js
 */

async function createCronJob() {
  const API_URL = process.env.API_URL || 'http://localhost:3000'
  
  const cronJobData = {
    name: 'Send ETH to myself every minute',
    schedule: '* * * * *', // Every minute
    toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb', // Your address here
    amount: '0.001', // Amount in ETH
  }

  try {
    const response = await fetch(`${API_URL}/api/cron/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(cronJobData),
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error || 'Failed to create cron job')
    }

    console.log('✅ Cron job created successfully!')
    console.log('Job ID:', result.job.id)
    console.log('Job Name:', result.job.name)
    console.log('Schedule:', result.job.schedule)
    console.log('From Address:', result.job.address)
    console.log('To Address:', result.job.toAddress)
    console.log('Amount:', result.job.amount, 'ETH')
    console.log('\n⚠️  IMPORTANT: Fund the wallet address above with ETH!')
    console.log('The wallet address is:', result.job.address)
  } catch (error: any) {
    console.error('❌ Error creating cron job:', error.message)
    process.exit(1)
  }
}

// Run if executed directly
if (require.main === module) {
  createCronJob()
}

export default createCronJob

