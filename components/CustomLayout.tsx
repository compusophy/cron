import { ReactNode } from 'react'

interface CustomLayoutProps {
  children: ReactNode
}

export default function CustomLayout({ children }: CustomLayoutProps) {
  return (
    <div className="min-h-screen bg-white">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  )
}

