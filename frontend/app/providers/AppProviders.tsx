'use client'

import React, { ReactNode } from 'react'
import { WatchlistProvider } from './WatchlistProvider'
import { ScreenerProvider } from './ScreenerProvider'

interface AppProvidersProps {
  children: ReactNode
}

/**
 * Combined providers component that wraps the entire app
 * This ensures all components have access to watchlist and screener contexts
 */
export const AppProviders: React.FC<AppProvidersProps> = ({ children }) => {
  return (
    <WatchlistProvider>
      <ScreenerProvider>
        {children}
      </ScreenerProvider>
    </WatchlistProvider>
  )
}

export default AppProviders