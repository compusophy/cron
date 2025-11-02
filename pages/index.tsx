import Head from 'next/head'
import WalletList from '@/components/WalletList'
import { ToastProvider } from '@/components/ToastProvider'

export default function Home() {
  return (
    <ToastProvider>
      <>
      <Head>
        <title>Cron Jobs</title>
      </Head>
      
          <WalletList />
      </>
    </ToastProvider>
  )
}
