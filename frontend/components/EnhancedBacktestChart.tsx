'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { Play, Pause, RotateCcw, FastForward, SkipForward, SkipBack, Settings } from 'lucide-react'

// Dynamically import Plotly to avoid SSR issues
const Plot = dynamic(() => import('react-plotly.js'), { ssr: false })

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
  start_price?: number
  end_price?: number
}

interface PriceDataPoint {
  date: string
  price: number // close price
  high: number
  low: number
  open: number
  volume: number
  trading_state?: 'NOT_IN_TRADE' | 'MOMENTUM_DETECTED' | 'CONSOLIDATION' | 'IN_POSITION'
  sma_20?: number
  momentum_strength?: number
  atr?: number
}

interface EnhancedBacktestChartProps {
  priceData: PriceDataPoint[]
  trades: Trade[]
  momentumPeriods: MomentumPeriod[]
  ticker: string
  isLoading?: boolean
}

// Simplified color system - single colors for each state
const TRADE_COLORS = {
  BUY: '#10b981',   // Green for all buys
  SELL: '#ef4444'   // Red for all sells
}

const STATE_COLORS = {
  MOMENTUM_DETECTED: 'rgba(239, 68, 68, 0.4)',    // Darker red background
  CONSOLIDATION: 'rgba(251, 191, 36, 0.4)',       // Darker yellow background  
  IN_POSITION: 'rgba(16, 185, 129, 0.4)',         // Darker green background
  NOT_IN_TRADE: null                               // No background
}

export default function EnhancedBacktestChart({ 
  priceData, 
  trades, 
  momentumPeriods, 
  ticker,
  isLoading = false 
}: EnhancedBacktestChartProps) {
  // Replay state
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [speed, setSpeed] = useState(1000) // milliseconds per candle
  const [hasStarted, setHasStarted] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  // Enhanced data processing
  const processedData = useMemo(() => {
    if (!priceData.length) return { candleData: [], annotations: [], shapes: [] }

    // Add trade numbers to trades for identification
    const numberedTrades = trades.map((trade, index) => ({
      ...trade,
      trade_number: index + 1
    }))

    // Process candle data
    const candleData = priceData.map((point, index) => ({
      ...point,
      x: point.date,
      index,
      // Determine if this candle is part of any period
      momentum_period: momentumPeriods.find(p => 
        p.type === 'momentum' && 
        new Date(point.date) >= new Date(p.start_date) && 
        new Date(point.date) <= new Date(p.end_date)
      ),
      consolidation_period: momentumPeriods.find(p => 
        p.type === 'consolidation' && 
        new Date(point.date) >= new Date(p.start_date) && 
        new Date(point.date) <= new Date(p.end_date)
      ),
      // Find associated trades
      buy_trade: numberedTrades.find(t => t.entry_date === point.date),
      sell_trade: numberedTrades.find(t => t.exit_date === point.date),
    }))

    // Create annotations for trade markers
    const annotations: any[] = []
    
    numberedTrades.forEach((trade) => {
      // Buy annotation - always green
      const buyCandle = candleData.find(c => c.date === trade.entry_date)
      if (buyCandle) {
        annotations.push({
          x: trade.entry_date,
          y: trade.entry_price,
          text: `▲ Buy`,
          showarrow: true,
          arrowhead: 1,
          arrowsize: 1.5,
          arrowwidth: 2,
          arrowcolor: TRADE_COLORS.BUY,
          ax: 0,
          ay: -40,
          bgcolor: 'rgba(0,0,0,0.8)',
          bordercolor: TRADE_COLORS.BUY,
          borderwidth: 2,
          font: {
            color: 'white',
            size: 10
          }
        })
      }

      // Sell annotation
      if (trade.exit_date && trade.exit_price) {
        const sellCandle = candleData.find(c => c.date === trade.exit_date)
        if (sellCandle) {
          const pnlText = trade.pnl ? ` (${trade.pnl >= 0 ? '+' : ''}$${trade.pnl.toFixed(2)})` : ''
          const isFinalExit = trade.exit_reason === 'Final candle auto-sell'
          const sellText = isFinalExit ? `▼ Final Exit${pnlText}` : `▼ Sell${pnlText}`
          const borderColor = isFinalExit ? '#fbbf24' : TRADE_COLORS.SELL // Yellow for final exit
          
          annotations.push({
            x: trade.exit_date,
            y: trade.exit_price,
            text: sellText,
            showarrow: true,
            arrowhead: 1,
            arrowsize: 1.5,
            arrowwidth: 2,
            arrowcolor: borderColor,
            ax: 0,
            ay: 40,
            bgcolor: 'rgba(0,0,0,0.8)',
            bordercolor: borderColor,
            borderwidth: 2,
            font: {
              color: 'white',
              size: 10
            }
          })
        }
      }
    })

    // Create shapes for state-based background coloring
    const shapes: any[] = []
    
         // Group consecutive candles by trading state to create background rectangles
     let currentState: string | null = null
     let stateStartDate: string | null = null
    
    candleData.forEach((candle, index) => {
      const candleState = candle.trading_state || 'NOT_IN_TRADE'
      
      if (candleState !== currentState) {
        // End previous state rectangle if it exists
        if (currentState && stateStartDate && STATE_COLORS[currentState as keyof typeof STATE_COLORS]) {
          const prevCandle = candleData[index - 1]
          shapes.push({
            type: 'rect',
            xref: 'x',
            yref: 'paper',
            x0: stateStartDate,
            x1: prevCandle.date,
            y0: 0,
            y1: 1,
            fillcolor: STATE_COLORS[currentState as keyof typeof STATE_COLORS],
            opacity: 0.3,
            line: { width: 0 },
            layer: 'below'
          })
        }
        
        // Start new state rectangle
        currentState = candleState
        stateStartDate = candle.date
      }
      
      // Handle last candle
      if (index === candleData.length - 1 && currentState && stateStartDate && STATE_COLORS[currentState as keyof typeof STATE_COLORS]) {
        shapes.push({
          type: 'rect',
          xref: 'x',
          yref: 'paper',
          x0: stateStartDate,
          x1: candle.date,
          y0: 0,
          y1: 1,
          fillcolor: STATE_COLORS[currentState as keyof typeof STATE_COLORS],
          opacity: 0.3,
          line: { width: 0 },
          layer: 'below'
        })
      }
    })

    return { candleData, annotations, shapes }
  }, [priceData, trades, momentumPeriods])

  // Get current visible data
  const visibleData = processedData.candleData.slice(0, currentIndex + 1)
  const visibleAnnotations = processedData.annotations.filter(ann => {
    const annDate = new Date(ann.x)
    const currentDate = new Date(visibleData[visibleData.length - 1]?.date || '1900-01-01')
    return annDate <= currentDate
  })
  const visibleShapes = processedData.shapes.filter(shape => {
    const shapeStart = new Date(shape.x0)
    const currentDate = new Date(visibleData[visibleData.length - 1]?.date || '1900-01-01')
    return shapeStart <= currentDate
  })

  // Control functions
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

  const skipBackward = () => {
    setCurrentIndex(prev => Math.max(0, prev - 10))
  }

  const skipForward = () => {
    setCurrentIndex(prev => Math.min(priceData.length - 1, prev + 10))
  }

  const handleScrub = (value: number) => {
    setCurrentIndex(value)
    setHasStarted(true)
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

  // Create Plotly data
  const plotData = [
    // Candlestick trace
    {
      type: 'candlestick' as const,
      x: visibleData.map(d => d.date),
      open: visibleData.map(d => d.open),
      high: visibleData.map(d => d.high),
      low: visibleData.map(d => d.low),
      close: visibleData.map(d => d.price),
      name: ticker,
      increasing: { line: { color: '#10b981' } },
      decreasing: { line: { color: '#ef4444' } },
      hovertemplate: 
        '<b>%{x}</b><br>' +
        'Open: $%{open:.2f}<br>' +
        'High: $%{high:.2f}<br>' +
        'Low: $%{low:.2f}<br>' +
        'Close: $%{close:.2f}<br>' +
        'Volume: %{customdata.volume:,.0f}<br>' +
        'Trading State: %{customdata.trading_state}<br>' +
        'SMA20: $%{customdata.sma_20:.2f}<br>' +
        'Momentum Period: %{customdata.momentum_period}<br>' +
        'Consolidation Period: %{customdata.consolidation_period}<br>' +
        '%{customdata.trade_info}' +
        '<extra></extra>',
      customdata: visibleData.map(d => ({
        trading_state: d.trading_state || 'NOT_IN_TRADE',
        sma_20: d.sma_20 || 0,
        momentum_period: d.momentum_period ? 'Yes' : 'No',
        consolidation_period: d.consolidation_period ? 'Yes' : 'No',
        volume: d.volume,
        momentum_strength: d.momentum_strength || 0,
        atr: d.atr || 0,
        trade_info: (() => {
          let info = ''
          if (d.buy_trade) {
            info += `<br>🟢 BUY Trade #${d.buy_trade.trade_number}: $${d.buy_trade.entry_price.toFixed(2)}`
          }
          if (d.sell_trade) {
            const pnlColor = (d.sell_trade.pnl || 0) >= 0 ? '🟢' : '🔴'
            info += `<br>${pnlColor} SELL Trade #${d.sell_trade.trade_number}: $${d.sell_trade.exit_price?.toFixed(2)}`
            if (d.sell_trade.pnl) {
              info += ` (P&L: $${d.sell_trade.pnl.toFixed(2)})`
            }
          }
          return info
        })()
      }))
    },
    // 20-day SMA line (purple)
    {
      type: 'scatter' as const,
      mode: 'lines' as const,
      x: visibleData.map(d => d.date),
      y: visibleData.map(d => d.sma_20),
      name: '20-day SMA',
      line: {
        color: '#8b5cf6',  // Purple color
        width: 2
      },
      hovertemplate: 
        '<b>%{x}</b><br>' +
        '20-day SMA: $%{y:.2f}' +
        '<extra></extra>'
    },
    // Volume trace (subplot)
    {
      type: 'bar' as const,
      x: visibleData.map(d => d.date),
      y: visibleData.map(d => d.volume),
      name: 'Volume',
      yaxis: 'y2',
      marker: {
        color: visibleData.map(d => d.price >= d.open ? '#10b981' : '#ef4444'),
        opacity: 0.7
      },
      hovertemplate: 
        '<b>%{x}</b><br>' +
        'Volume: %{y:,.0f}<br>' +
        '<extra></extra>'
    }
  ]

  const layout = {
    title: {
      text: `${ticker} - Enhanced Momentum Backtest Replay`,
      font: { color: 'white', size: 18 }
    },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(17, 24, 39, 0.8)',
    font: { color: 'white' },
    showlegend: false,
    xaxis: {
      title: 'Date',
      gridcolor: 'rgba(255,255,255,0.1)',
      color: 'white',
      rangeslider: { visible: false },
      type: 'date'
    },
    yaxis: {
      title: 'Price ($)',
      gridcolor: 'rgba(255,255,255,0.1)',
      color: 'white',
      domain: [0.3, 1]
    },
    yaxis2: {
      title: 'Volume',
      gridcolor: 'rgba(255,255,255,0.1)',
      color: 'white',
      domain: [0, 0.25],
      side: 'right'
    },
    annotations: visibleAnnotations,
    shapes: visibleShapes,
    margin: { l: 50, r: 50, t: 50, b: 50 },
    height: 650
  }

  const config = {
    responsive: true,
    displayModeBar: true,
    modeBarButtonsToAdd: ['pan2d', 'select2d', 'lasso2d', 'resetScale2d'],
    displaylogo: false,
    toImageButtonOptions: {
      format: 'png',
      filename: `${ticker}_backtest_replay`,
      height: 650,
      width: 1200,
      scale: 1
    }
  }

  if (isLoading) {
    return (
      <div className="w-full h-[700px] flex items-center justify-center bg-card/50 rounded-xl">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Running enhanced backtest...</p>
        </div>
      </div>
    )
  }

  const progressPercent = priceData.length > 0 ? (currentIndex / (priceData.length - 1)) * 100 : 0
  const currentDate = visibleData[visibleData.length - 1]?.date
  const visibleTrades = trades.filter(trade => {
    const entryDate = new Date(trade.entry_date)
    const currentDateObj = new Date(currentDate || '1900-01-01')
    return entryDate <= currentDateObj
  })

  return (
    <div className="w-full space-y-4">
      {/* Enhanced Controls Header */}
      <div className="flex items-center justify-between bg-card/30 rounded-xl p-4">
        <div className="flex items-center gap-4">
          <h3 className="text-xl font-semibold text-white">
            Enhanced Backtester Replay
          </h3>
          <div className="text-sm text-muted-foreground">
            {hasStarted ? `Candle ${currentIndex + 1} of ${priceData.length}` : 'Ready to start'}
          </div>
        </div>
        
        {/* Primary Controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-card/50 rounded-lg p-2">
            <button
              onClick={skipBackward}
              disabled={currentIndex === 0}
              className="flex items-center justify-center w-8 h-8 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-800 rounded-lg transition-colors"
            >
              <SkipBack className="h-4 w-4" />
            </button>
            
            <button
              onClick={isPlaying ? pauseReplay : startReplay}
              disabled={currentIndex >= priceData.length - 1}
              className="flex items-center justify-center w-10 h-10 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-600 rounded-lg transition-colors"
            >
              {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </button>
            
            <button
              onClick={skipForward}
              disabled={currentIndex >= priceData.length - 1}
              className="flex items-center justify-center w-8 h-8 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-800 rounded-lg transition-colors"
            >
              <SkipForward className="h-4 w-4" />
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
          <div className="flex items-center gap-2 bg-card/50 rounded-lg p-2">
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
            </select>
          </div>
        </div>
      </div>

      {/* Enhanced Progress Bar with Scrubbing */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {currentDate && new Date(currentDate).toLocaleDateString('en-US', { 
              weekday: 'short',
              year: 'numeric', 
              month: 'short', 
              day: 'numeric' 
            })}
          </span>
          <span className="text-purple-400 font-medium">
            {progressPercent.toFixed(1)}%
          </span>
        </div>
        
        {/* Scrubbing slider */}
        <div className="w-full">
          <input
            type="range"
            min={0}
            max={priceData.length - 1}
            value={currentIndex}
            onChange={(e) => handleScrub(Number(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
            style={{
              background: `linear-gradient(to right, #8b5cf6 0%, #8b5cf6 ${progressPercent}%, #374151 ${progressPercent}%, #374151 100%)`
            }}
          />
        </div>
      </div>

      {/* Enhanced Legend */}
      <div className="flex items-center gap-6 text-sm bg-card/20 rounded-lg p-3">
        <div className="flex items-center gap-2">
          <div className="w-4 h-3 bg-green-500/20 border border-green-500 rounded-sm"></div>
          <span className="text-muted-foreground">Momentum Period</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-3 bg-yellow-500/20 border border-yellow-500 rounded-sm"></div>
          <span className="text-muted-foreground">Consolidation</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-green-500">▲</span>
          <span className="text-muted-foreground">Buy Signal</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-red-500">▼</span>
          <span className="text-muted-foreground">Sell Signal</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-500 rounded-sm"></div>
          <div className="w-3 h-3 bg-red-500 rounded-sm"></div>
          <span className="text-muted-foreground">Volume (Up/Down)</span>
        </div>
      </div>

      {/* Interactive Chart */}
      <div className="w-full bg-card/50 rounded-xl p-4">
        <Plot
          data={plotData}
          layout={layout}
          config={config}
          style={{ width: '100%', height: '650px' }}
        />
      </div>

      {/* Enhanced Stats Display */}
      {hasStarted && visibleTrades.length > 0 && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-card/30 rounded-lg p-4">
            <h4 className="text-sm font-medium text-muted-foreground mb-1">Active Trades</h4>
            <p className="text-2xl font-bold text-white">{visibleTrades.length}</p>
          </div>
          
          <div className="bg-card/30 rounded-lg p-4">
            <h4 className="text-sm font-medium text-muted-foreground mb-1">Total P&L</h4>
            <p className={`text-2xl font-bold ${
              visibleTrades.reduce((sum, trade) => sum + (trade.pnl || 0), 0) >= 0 
                ? 'text-green-500' 
                : 'text-red-500'
            }`}>
              ${visibleTrades.reduce((sum, trade) => sum + (trade.pnl || 0), 0).toFixed(2)}
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

          <div className="bg-card/30 rounded-lg p-4">
            <h4 className="text-sm font-medium text-muted-foreground mb-1">Current State</h4>
            <p className="text-lg font-bold text-purple-400">
              {visibleData[visibleData.length - 1]?.trading_state || 'N/A'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}