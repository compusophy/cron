# Dynamic Cron Job System - ETH Transfer Example

This project has been adapted from the Vercel cron template to support dynamic cron job creation with ETH transfers.

## Features

- ✅ Dynamic cron job creation via API
- ✅ Automatic ETH private/public key pair generation
- ✅ Key pairs stored securely in Redis (Vercel KV)
- ✅ Cron scheduler that checks Redis for active jobs
- ✅ ETH transfer execution based on cron schedules

## Setup

1. Install dependencies:
```bash
pnpm install
```

2. Set up environment variables in `.env.local`:
```env
# Vercel KV (Redis) - Get from Vercel dashboard
KV_URL=your_vercel_kv_url
KV_REST_API_URL=your_vercel_kv_rest_api_url
KV_REST_API_TOKEN=your_vercel_kv_token
KV_REST_API_READ_ONLY_TOKEN=your_read_only_token

# Ethereum RPC (optional - defaults to Sepolia testnet)
ETH_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY
# OR
ETH_NETWORK=sepolia
INFURA_API_KEY=your_infura_key

# Cron security (optional, for local testing)
CRON_SECRET=your_secret_here
```

## Creating a Cron Job

### Via API (POST request)

```bash
curl -X POST http://localhost:3000/api/cron/create \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Send ETH to myself every minute",
    "schedule": "* * * * *",
    "toAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    "amount": "0.001"
  }'
```

### Response

```json
{
  "success": true,
  "job": {
    "id": "cron_abc123...",
    "name": "Send ETH to myself every minute",
    "schedule": "* * * * *",
    "toAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    "amount": "0.001",
    "address": "0xGeneratedWalletAddress...",
    "createdAt": 1234567890
  }
}
```

**IMPORTANT**: After creating a cron job, you need to fund the generated wallet address (`address` field) with ETH! The wallet will automatically send ETH to the `toAddress` according to the schedule.

## How It Works

1. **Single Cron Runner**: Vercel cron triggers `/api/cron/runner` every minute
2. **Redis Check**: The runner checks Redis for all active cron jobs
3. **Schedule Matching**: For each job, it checks if the schedule matches the current time
4. **Execution**: If matched, it executes the ETH transfer using the stored private key
5. **Update**: Updates the `lastRunTime` to prevent duplicate runs

## Cron Schedule Format

Standard cron format: `* * * * *`
- Minute (0-59)
- Hour (0-23)
- Day of month (1-31)
- Month (1-12)
- Day of week (0-7, where 0 and 7 are Sunday)

Examples:
- `* * * * *` - Every minute
- `*/10 * * * *` - Every 10 minutes
- `0 * * * *` - Every hour
- `0 0 * * *` - Every day at midnight
- `0 0 1 * *` - First day of every month

## Storage Structure in Redis

- `cron:jobs:active` - Set of active job IDs
- `cron:job:{jobId}` - Job configuration (includes private key)

## Security Notes

⚠️ **IMPORTANT**: Private keys are stored in Redis (Vercel KV). Make sure:
- Your Vercel KV instance is properly secured
- Use environment variables for sensitive data
- Consider encrypting private keys before storing (not implemented here for simplicity)
- For production, implement additional security measures

## Testing Locally

1. Start the dev server:
```bash
pnpm dev
```

2. Create a cron job via the API (see above)

3. Manually trigger the runner (for testing):
```bash
curl http://localhost:3000/api/cron/runner \
  -H "Authorization: Bearer your_cron_secret"
```

Or test without auth if `CRON_SECRET` is not set (development only).

## Deployment

1. Deploy to Vercel
2. Configure environment variables in Vercel dashboard
3. The cron job in `vercel.json` will automatically start running every minute
4. Create cron jobs via API after deployment

## Example: Send ETH Every Minute

```bash
# Create the job
curl -X POST https://your-app.vercel.app/api/cron/create \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Minute ETH transfer",
    "schedule": "* * * * *",
    "toAddress": "YOUR_ADDRESS",
    "amount": "0.001"
  }'

# Fund the generated wallet address returned in the response
# The cron will automatically execute every minute!
```

