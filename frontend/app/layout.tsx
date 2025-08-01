import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Sidebar from '@/components/Sidebar'
import AppProviders from './providers/AppProviders'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Trading Strategy Tester',
  description: 'Desktop application for traders and quants to backtest trading strategies',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AppProviders>
          <div className="min-h-screen bg-black">
            <div className="flex">
              <Sidebar />
              <main className="flex-1">
                {children}
              </main>
            </div>
          </div>
        </AppProviders>
      </body>
    </html>
  )
} 