'use client'

import React, { useState, useEffect, useRef } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts'
import { Play, Pause, RotateCcw, FastForward, TrendingUp, TrendingDown, Settings } from 'lucide-react'
import CandlestickChart from './CandlestickChart'

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
  start_price?: number
  end_price?: number
}

interface PriceDataPoint {
  date: string
  price: number
  high: number
  low: number
  open: number
  volume: number
}

interface LiveReplayChartProps {
  priceData: PriceDataPoint[]
  trades: Trade[]
  momentumPeriods: MomentumPeriod[]
  ticker: string
  isLoading?: boolean
}

export default function LiveReplayChart({ 
  priceData, 
  trades, 
  momentumPeriods, 
  ticker,
  isLoading = false 
}: LiveReplayChartProps) {
  // Replay state
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [speed, setSpeed] = useState(1000) // milliseconds per candle
  const [hasStarted, setHasStarted] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  // Get current visible data
  const visibleData = priceData.slice(0, currentIndex + 1).map((item, index) => ({
    ...item,
    index,
    // Add candlestick colors
    fill: item.close >= item.open ? '#10b981' : '#ef4444', // green for up, red for down
    displayDate: new Date(item.date).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: '2-digit'
    })
  }))

  // Get visible trades (only those that have occurred by current date)
  const currentDate = priceData[currentIndex]?.date
  const visibleTrades = trades.filter(trade => {
    const entryDate = new Date(trade.entry_date)
    const currentDateObj = new Date(currentDate || '1900-01-01')
    return entryDate <= currentDateObj
  })

  // Get visible momentum periods with enhanced filtering
  const visibleMomentumPeriods = momentumPeriods.filter(period => {
    const startDate = new Date(period.start_date)
    const currentDateObj = new Date(currentDate || '1900-01-01')
    
    // Include period if it has started by current date
    return startDate <= currentDateObj
  })

  // Separate momentum and consolidation periods
  const visibleMomentumOnlyPeriods = visibleMomentumPeriods.filter(p => 
    p.type === 'momentum' || p.highlight_type === 'momentum'
  )
  const visibleConsolidationPeriods = visibleMomentumPeriods.filter(p => 
    p.type === 'consolidation' || p.highlight_type === 'consolidation'
  )

  // Controls
  const startReplay = () => {
    setIsPlaying(true)
    setHasStarted(true)
  }

  const pauseReplay = () => {
    setIsPlaying(false)
  }

  const resetReplay = () => {
    setIsPlaying(false)
    setCurrentIndex(0)
    setHasStarted(false)
  }

  const skipToEnd = () => {
    setCurrentIndex(priceData.length - 1)
    setIsPlaying(false)
  }

  // Animation effect
  useEffect(() => {
    if (isPlaying && currentIndex < priceData.length - 1) {
      intervalRef.current = setInterval(() => {
        setCurrentIndex(prev => {
          if (prev >= priceData.length - 1) {
            setIsPlaying(false)
            return prev
          }
          return prev + 1
        })
      }, speed)
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [isPlaying, currentIndex, priceData.length, speed])

  // Create trade markers for visible trades
  const buyMarkers = visibleTrades.map(trade => {
    const dataPoint = visibleData.find(d => d.date === trade.entry_date)
    return dataPoint ? {
      index: dataPoint.index,
      price: trade.entry_price,
      date: trade.entry_date,
      type: 'buy'
    } : null
  }).filter(Boolean)

  const sellMarkers = visibleTrades
    .filter(trade => trade.exit_date && trade.exit_price)
    .map(trade => {
      const dataPoint = visibleData.find(d => d.date === trade.exit_date)
      return dataPoint ? {
        index: dataPoint.index,
        price: trade.exit_price!,
        date: trade.exit_date!,
        type: 'sell'
      } : null
    }).filter(Boolean)

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price)
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      
      // Check if there's a trade on this date
      const buyTrade = visibleTrades.find(t => t.entry_date === data.date)
      const sellTrade = visibleTrades.find(t => t.exit_date === data.date)
      
      return (
        <div className="bg-card/95 backdrop-blur-xl border border-white/20 rounded-xl p-4 shadow-2xl">
          <p className="text-foreground font-medium mb-2">{data.displayDate}</p>
          <div className="space-y-1">
            <p className="text-purple-400">
              <span className="font-medium">Close:</span> {formatPrice(data.price)}
            </p>
            <p className="text-green-400">
              <span className="font-medium">High:</span> {formatPrice(data.high)}
            </p>
            <p className="text-red-400">
              <span className="font-medium">Low:</span> {formatPrice(data.low)}
            </p>
            <p className="text-blue-400">
              <span className="font-medium">Open:</span> {formatPrice(data.open)}
            </p>
            {data.volume > 0 && (
              <p className="text-gray-400">
                <span className="font-medium">Volume:</span> {data.volume.toLocaleString()}
              </p>
            )}
            
            {/* Trade information */}
            {buyTrade && (
              <div className="mt-2 pt-2 border-t border-white/10">
                <p className="text-green-500 font-medium flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  BUY: {formatPrice(buyTrade.entry_price)}
                </p>
              </div>
            )}
            
            {sellTrade && (
              <div className="mt-2 pt-2 border-t border-white/10">
                <p className="text-red-500 font-medium flex items-center gap-1">
                  <TrendingDown className="h-3 w-3" />
                  SELL: {formatPrice(sellTrade.exit_price!)}
                </p>
                {sellTrade.pnl && (
                  <p className={`text-sm ${sellTrade.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    P&L: {sellTrade.pnl >= 0 ? '+' : ''}{formatPrice(sellTrade.pnl)}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )
    }
    return null
  }



  if (isLoading) {
    return (
      <div className="w-full h-[600px] flex items-center justify-center bg-card/50 rounded-xl">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Running backtest...</p>
        </div>
      </div>
    )
  }

  const progressPercent = priceData.length > 0 ? (currentIndex / (priceData.length - 1)) * 100 : 0

  return (
    <div className="w-full space-y-4">
      {/* Chart Header with Controls */}
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold text-white">
          {ticker} - Live Momentum Backtest Replay
        </h3>
        
        {/* Replay Controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-card/30 rounded-lg p-2">
            <button
              onClick={hasStarted ? pauseReplay : startReplay}
              disabled={currentIndex >= priceData.length - 1}
              className="flex items-center justify-center w-8 h-8 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-600 rounded-lg transition-colors"
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            
            <button
              onClick={resetReplay}
              className="flex items-center justify-center w-8 h-8 bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            
            <button
              onClick={skipToEnd}
              className="flex items-center justify-center w-8 h-8 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              <FastForward className="h-4 w-4" />
            </button>
          </div>

          {/* Speed Control */}
          <div className="flex items-center gap-2 bg-card/30 rounded-lg p-2">
            <Settings className="h-4 w-4 text-muted-foreground" />
            <select
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="bg-transparent text-white text-sm border-none outline-none"
            >
              <option value={3000} className="bg-gray-800">0.3x</option>
              <option value={2000} className="bg-gray-800">0.5x</option>
              <option value={1000} className="bg-gray-800">1x</option>
              <option value={500} className="bg-gray-800">2x</option>
              <option value={250} className="bg-gray-800">4x</option>
              <option value={100} className="bg-gray-800">10x</option>
              <option value={50} className="bg-gray-800">20x</option>
              <option value={25} className="bg-gray-800">40x</option>
            </select>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {hasStarted ? `${currentIndex + 1} / ${priceData.length} candles` : 'Ready to start replay'}
          </span>
          <span className="text-purple-400 font-medium">
            {progressPercent.toFixed(1)}%
          </span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-2">
          <div 
            className="bg-gradient-to-r from-purple-500 to-blue-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          ></div>
        </div>
        {hasStarted && currentDate && (
          <div className="text-center text-sm text-muted-foreground">
            Current Date: {new Date(currentDate).toLocaleDateString('en-US', { 
              weekday: 'short',
              year: 'numeric', 
              month: 'short', 
              day: 'numeric' 
            })}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-500/20 border border-green-500 rounded-sm"></div>
          <span className="text-muted-foreground">Momentum Period</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-yellow-500/20 border border-yellow-500 rounded-sm"></div>
          <span className="text-muted-foreground">Consolidation</span>
        </div>
        <div className="flex items-center gap-2">
          <TrendingUp className="h-3 w-3 text-green-500" />
          <span className="text-muted-foreground">Buy</span>
        </div>
        <div className="flex items-center gap-2">
          <TrendingDown className="h-3 w-3 text-red-500" />
          <span className="text-muted-foreground">Sell</span>
        </div>
      </div>

      {/* Main Chart with Candlesticks and Volume */}
      <div className="w-full bg-card/50 rounded-xl p-4 space-y-4">
        {/* Price Chart (Candlesticks) */}
        <div className="relative">
          <div className="h-[500px] w-full bg-gray-900/50 rounded-lg p-2 overflow-hidden">
            <div className="w-full h-full flex justify-center">
              <CandlestickChart
                data={visibleData}
                width={Math.min(1000, typeof window !== 'undefined' ? window.innerWidth - 200 : 800)}
                height={480}
                onCandleHover={(candle) => {
                  // Optional: Add hover effects here
                }}
              />
            </div>
            
            {/* Trade Markers Overlay */}
            <div className="absolute inset-0 pointer-events-none">
              {[...buyMarkers, ...sellMarkers].map((marker, index) => {
                if (visibleData.length === 0) return null
                
                // Calculate position relative to the chart area
                const chartWidth = Math.min(1000, typeof window !== 'undefined' ? window.innerWidth - 200 : 800)
                const chartPadding = 60 // left padding
                const availableWidth = chartWidth - chartPadding - 30 // right padding
                
                const xPercent = visibleData.length > 1 ? 
                  ((marker.index / (visibleData.length - 1)) * availableWidth + chartPadding) / chartWidth * 100 : 50
                
                const minPrice = Math.min(...visibleData.map(d => d.low))
                const maxPrice = Math.max(...visibleData.map(d => d.high))
                const padding = (maxPrice - minPrice) * 0.1
                const yPercent = maxPrice > minPrice ? 
                  8 + (1 - ((marker.price - (minPrice - padding)) / ((maxPrice - minPrice) + 2 * padding))) * 82 : 50
                
                return (
                  <div
                    key={`marker-${index}`}
                    className="absolute transform -translate-x-1/2 -translate-y-1/2 animate-pulse z-10"
                    style={{
                      left: `${Math.max(5, Math.min(95, xPercent))}%`,
                      top: `${Math.max(5, Math.min(95, yPercent))}%`,
                    }}
                  >
                    {marker.type === 'buy' ? (
                      <div className="bg-green-500 rounded-full p-1 shadow-lg">
                        <TrendingUp className="h-4 w-4 text-white" />
                      </div>
                    ) : (
                      <div className="bg-red-500 rounded-full p-1 shadow-lg">
                        <TrendingDown className="h-4 w-4 text-white" />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Enhanced Period Overlays */}
            <div className="absolute inset-0 pointer-events-none">
              {/* Momentum Periods - Light Green */}
              {visibleMomentumOnlyPeriods.map((period, index) => {
                const startIndex = visibleData.findIndex(d => d.date >= period.start_date)
                const endIndex = visibleData.findIndex(d => d.date >= (period.end_date || currentDate))
                
                if (startIndex === -1) return null
                
                // Use current index if end hasn't been reached yet
                const actualEndIndex = endIndex === -1 ? Math.min(visibleData.length - 1, currentIndex) : endIndex
                
                // Calculate position relative to the chart area
                const chartWidth = Math.min(1000, typeof window !== 'undefined' ? window.innerWidth - 200 : 800)
                const chartPadding = 60 // left padding
                const availableWidth = chartWidth - chartPadding - 30 // right padding
                
                const xStart = visibleData.length > 1 ? 
                  ((startIndex / (visibleData.length - 1)) * availableWidth + chartPadding) / chartWidth * 100 : 50
                const xEnd = visibleData.length > 1 ? 
                  ((actualEndIndex / (visibleData.length - 1)) * availableWidth + chartPadding) / chartWidth * 100 : 50
                
                const width = Math.max(1, Math.min(90, xEnd - xStart))
                
                if (width > 0) {
                  return (
                    <div
                      key={`momentum-${index}`}
                      className="absolute border-2 border-dashed rounded bg-green-500/10 border-green-500/30"
                      style={{
                        left: `${Math.max(5, Math.min(95, xStart))}%`,
                        width: `${width}%`,
                        top: '8%',
                        height: '82%',
                      }}
                    />
                  )
                }
                return null
              })}

              {/* Consolidation Periods - Light Yellow */}
              {visibleConsolidationPeriods.map((period, index) => {
                const startIndex = visibleData.findIndex(d => d.date >= period.start_date)
                const endIndex = visibleData.findIndex(d => d.date >= (period.end_date || currentDate))
                
                if (startIndex === -1) return null
                
                // Use current index if end hasn't been reached yet
                const actualEndIndex = endIndex === -1 ? Math.min(visibleData.length - 1, currentIndex) : endIndex
                
                // Calculate position relative to the chart area
                const chartWidth = Math.min(1000, typeof window !== 'undefined' ? window.innerWidth - 200 : 800)
                const chartPadding = 60 // left padding
                const availableWidth = chartWidth - chartPadding - 30 // right padding
                
                const xStart = visibleData.length > 1 ? 
                  ((startIndex / (visibleData.length - 1)) * availableWidth + chartPadding) / chartWidth * 100 : 50
                const xEnd = visibleData.length > 1 ? 
                  ((actualEndIndex / (visibleData.length - 1)) * availableWidth + chartPadding) / chartWidth * 100 : 50
                
                const width = Math.max(1, Math.min(90, xEnd - xStart))
                
                if (width > 0) {
                  return (
                    <div
                      key={`consolidation-${index}`}
                      className="absolute border-2 border-dashed rounded bg-yellow-500/10 border-yellow-500/30"
                      style={{
                        left: `${Math.max(5, Math.min(95, xStart))}%`,
                        width: `${width}%`,
                        top: '8%',
                        height: '82%',
                      }}
                    />
                  )
                }
                return null
              })}
            </div>
          </div>
        </div>
        
        {/* Volume Chart */}
        <div className="h-[150px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={visibleData}
              margin={{
                top: 5,
                right: 30,
                left: 60,
                bottom: 20,
              }}
            >
              <CartesianGrid 
                strokeDasharray="3 3" 
                stroke="rgba(255,255,255,0.1)" 
                horizontal={true}
                vertical={false}
              />
              
              <XAxis 
                dataKey="index"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#9ca3af', fontSize: 10 }}
                interval="preserveStartEnd"
                tickFormatter={(value) => {
                  const item = visibleData[value]
                  return item ? item.displayDate : ''
                }}
              />
              
              <YAxis 
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#9ca3af', fontSize: 10 }}
                tickFormatter={(value) => {
                  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
                  if (value >= 1000) return `${(value / 1000).toFixed(0)}K`
                  return value.toString()
                }}
              />
              
              <Tooltip 
                formatter={(value) => [value.toLocaleString(), 'Volume']}
                labelFormatter={(label) => {
                  const item = visibleData[label]
                  return item ? `Date: ${item.displayDate}` : ''
                }}
                contentStyle={{
                  backgroundColor: 'rgba(17, 24, 39, 0.95)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '8px',
                  color: 'white'
                }}
              />
              
              <Bar 
                dataKey="volume" 
                fill={(entry) => entry.close >= entry.open ? '#10b981' : '#ef4444'}
                fillOpacity={0.7}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>



      {/* Current Stats Display */}
      {hasStarted && visibleTrades.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mt-4">
          <div className="bg-card/30 rounded-lg p-4">
            <h4 className="text-sm font-medium text-muted-foreground mb-1">Trades Executed</h4>
            <p className="text-2xl font-bold text-white">{visibleTrades.length}</p>
          </div>
          
          <div className="bg-card/30 rounded-lg p-4">
            <h4 className="text-sm font-medium text-muted-foreground mb-1">Current P&L</h4>
            <p className={`text-2xl font-bold ${
              visibleTrades.reduce((sum, trade) => sum + (trade.pnl || 0), 0) >= 0 
                ? 'text-green-500' 
                : 'text-red-500'
            }`}>
              {formatPrice(visibleTrades.reduce((sum, trade) => sum + (trade.pnl || 0), 0))}
            </p>
          </div>
          
          <div className="bg-card/30 rounded-lg p-4">
            <h4 className="text-sm font-medium text-muted-foreground mb-1">Win Rate</h4>
            <p className="text-2xl font-bold text-white">
              {visibleTrades.length > 0 
                ? ((visibleTrades.filter(t => (t.pnl || 0) > 0).length / visibleTrades.length) * 100).toFixed(0)
                : 0
              }%
            </p>
          </div>
        </div>
      )}
    </div>
  )
}