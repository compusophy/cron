interface TokenBalance {
  address: string
  symbol: string
  name: string
  balance: string
  decimals: number
}

interface Balances {
  eth: string
  weth: string
  usdc: string
  testCoin: string
  wrplt: string
  tokens?: TokenBalance[]
}

interface BalancesCardProps {
  balances: Balances | undefined
}

export default function BalancesCard({ balances }: BalancesCardProps) {
  return (
    <div className="mt-3 border border-gray-200 rounded-lg p-3 bg-gray-50">
      <dl className="space-y-1.5 text-xs">
        <div className="flex items-center gap-3">
          <dt className="text-gray-500 w-20 flex-shrink-0">ETH</dt>
          <dd className="font-mono tabular-nums text-gray-900">
            {balances ? parseFloat(balances.eth).toFixed(6) : '...'}
          </dd>
        </div>
        <div className="flex items-center gap-3">
          <dt className="text-gray-500 w-20 flex-shrink-0">WETH</dt>
          <dd className="font-mono tabular-nums text-gray-900">
            {balances ? parseFloat(balances.weth).toFixed(6) : '...'}
          </dd>
        </div>
        <div className="flex items-center gap-3">
          <dt className="text-gray-500 w-20 flex-shrink-0">USDC</dt>
          <dd className="font-mono tabular-nums text-gray-900">
            {balances ? parseFloat(balances.usdc).toFixed(6) : '...'}
          </dd>
        </div>
        <div className="flex items-center gap-3">
          <dt className="text-gray-500 w-20 flex-shrink-0">TestCoin</dt>
          <dd className="font-mono tabular-nums text-gray-900">
            {balances ? parseFloat(balances.testCoin).toFixed(6) : '...'}
          </dd>
        </div>
        <div className="flex items-center gap-3">
          <dt className="text-gray-500 w-20 flex-shrink-0">WRPLT</dt>
          <dd className="font-mono tabular-nums text-gray-900">
            {balances ? parseFloat(balances.wrplt).toFixed(6) : '...'}
          </dd>
        </div>
        {/* Dynamic tokens */}
        {balances?.tokens && balances.tokens.length > 0 && balances.tokens.map((token) => (
          <div key={token.address} className="flex items-center gap-3">
            <dt className="text-gray-500 w-20 flex-shrink-0" title={token.name}>{token.symbol}</dt>
            <dd className="font-mono tabular-nums text-gray-900">
              {parseFloat(token.balance).toFixed(6)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

