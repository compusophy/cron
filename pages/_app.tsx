import type { AppProps } from 'next/app'
import { Analytics } from '@vercel/analytics/react'
import CustomLayout from '@/components/CustomLayout'
import '../styles/globals.css'

function App({ Component, pageProps }: AppProps) {
  return (
    <CustomLayout>
      <Component {...pageProps} />
      <Analytics />
    </CustomLayout>
  )
}

export default App
