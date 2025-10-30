import Head from 'next/head'
import { useState } from 'react'
import CronJobForm from '@/components/CronJobForm'
import CronJobList from '@/components/CronJobList'
import WalletForm from '@/components/WalletForm'
import WalletList from '@/components/WalletList'

export default function Home() {
  const [refreshKey, setRefreshKey] = useState(0)
  const [isJobModalOpen, setIsJobModalOpen] = useState(false)
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false)
  const [walletRefreshKey, setWalletRefreshKey] = useState(0)

  const handleJobCreated = () => {
    setRefreshKey((prev) => prev + 1)
  }

  const handleWalletCreated = () => {
    setWalletRefreshKey((prev) => prev + 1)
  }

  return (
    <>
      <Head>
        <title>Cron Jobs</title>
      </Head>
      
      <div className="flex flex-col gap-8">
        <section className="flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-semibold">Wallets</h2>
            <button
              onClick={() => setIsWalletModalOpen(true)}
              className="px-6 py-2 rounded-md font-medium shadow-sm cursor-pointer"
              style={{ 
                backgroundColor: '#2563eb', 
                color: '#ffffff',
                border: 'none'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1d4ed8'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
            >
              + Create New Wallet
            </button>
          </div>
          <WalletList key={walletRefreshKey} />
        </section>

        <section className="flex flex-col gap-3 pt-8 border-t border-gray-300">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-semibold">Active Cron Jobs</h2>
            <button
              onClick={() => setIsJobModalOpen(true)}
              className="px-6 py-2 rounded-md font-medium shadow-sm cursor-pointer"
              style={{ 
                backgroundColor: '#2563eb', 
                color: '#ffffff',
                border: 'none'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1d4ed8'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
            >
              + Create New Cron Job
            </button>
          </div>
          <CronJobList key={refreshKey} />
        </section>
      </div>

      <CronJobForm
        onJobCreated={handleJobCreated}
        isOpen={isJobModalOpen}
        onClose={() => setIsJobModalOpen(false)}
      />

      <WalletForm
        onWalletCreated={handleWalletCreated}
        isOpen={isWalletModalOpen}
        onClose={() => setIsWalletModalOpen(false)}
      />
    </>
  )
}
