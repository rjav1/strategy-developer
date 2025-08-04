'use client'

import React from 'react'
import LiveReplayChart from './LiveReplayChart'

interface Trade {
  entry_date: string
  entry_price: number
  exit_date?: string
  exit_price?: number
  pnl?: number
  status: 'open' | 'closed'
}

interface MomentumPeriod {
  start_date: string
  end_date: string
  type: 'momentum' | 'consolidation'
  start_price: number
  end_price: number
}

interface BacktestChartProps {
  priceData: Array<{
    date: string
    price: number
    high: number
    low: number
    open: number
    volume: number
  }>
  trades: Trade[]
  momentumPeriods: MomentumPeriod[]
  ticker: string
  isLoading?: boolean
}

export default function BacktestChart({ 
  priceData, 
  trades, 
  momentumPeriods, 
  ticker,
  isLoading = false 
}: BacktestChartProps) {
  // Simply pass through to the new LiveReplayChart component
  return (
    <LiveReplayChart
      priceData={priceData}
      trades={trades}
      momentumPeriods={momentumPeriods}
      ticker={ticker}
      isLoading={isLoading}
    />
  )
}