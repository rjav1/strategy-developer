'use client'

import React from 'react'
import EnhancedBacktestChart from './EnhancedBacktestChart'

interface Trade {
  entry_date: string
  entry_price: number
  exit_date?: string
  exit_price?: number
  pnl?: number
  status: 'open' | 'closed'
  trade_number?: number
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
    trading_state?: 'NOT_IN_TRADE' | 'IN_PROGRESS' | 'BOUGHT'
    momentum_strength?: number
    atr?: number
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
  // Use the new enhanced chart with Plotly for perfect alignment and interactivity
  return (
    <EnhancedBacktestChart
      priceData={priceData}
      trades={trades}
      momentumPeriods={momentumPeriods}
      ticker={ticker}
      isLoading={isLoading}
    />
  )
}