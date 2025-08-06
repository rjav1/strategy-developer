'use client'

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { Play, Pause, RotateCcw, Eye, EyeOff, Maximize2 } from 'lucide-react'

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

interface SmoothBacktestChartProps {
  ticker: string
  isStreaming?: boolean
  onStreamData?: (data: any) => void
  autoStart?: boolean
  streamingData?: any[] // New prop to receive streaming data from parent
}

// Fixed color system - no animations
const TRADE_COLORS = {
  BUY: '#10b981',   // Green
  SELL: '#ef4444'   // Red
}

const STATE_COLORS = {
  MOMENTUM_DETECTED: 'rgba(239, 68, 68, 0.2)',    // Light red
  CONSOLIDATION: 'rgba(251, 191, 36, 0.2)',       // Light yellow  
  IN_POSITION: 'rgba(16, 185, 129, 0.2)',         // Light green
  NOT_IN_TRADE: null
}

export default function SmoothBacktestChart({ 
  ticker,
  isStreaming = false,
  onStreamData,
  autoStart = false,
  streamingData = []
}: SmoothBacktestChartProps) {
  
  // Core data state
  const [priceData, setPriceData] = useState<PriceDataPoint[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [momentumPeriods, setMomentumPeriods] = useState<MomentumPeriod[]>([])
  
  // Fixed 60-candle sliding window - NEVER changes
  const WINDOW_SIZE = 60
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(true) // Auto-start enabled
  const [hasCompleted, setHasCompleted] = useState(false)
  const [showAllTime, setShowAllTime] = useState(false)
  
  // Performance refs
  const animationRef = useRef<number | null>(null)
  const plotlyRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  
  // Fixed Y-axis ranges - calculated once, never change during streaming
  const [yAxisRange, setYAxisRange] = useState<[number, number]>([0, 100])
  const [volumeRange, setVolumeRange] = useState<[number, number]>([0, 1000])
  
  // Backend streaming
  const [backendReady, setBackendReady] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)

  // Calculate stable Y-axis ranges from full dataset
  useEffect(() => {
    if (priceData.length > 0) {
      const prices = priceData.map(d => [d.high, d.low, d.price, d.open]).flat()
      const volumes = priceData.map(d => d.volume)
      
      const minPrice = Math.min(...prices)
      const maxPrice = Math.max(...prices)
      const priceBuffer = (maxPrice - minPrice) * 0.1
      
      const maxVolume = Math.max(...volumes)
      
      setYAxisRange([minPrice - priceBuffer, maxPrice + priceBuffer])
      setVolumeRange([0, maxVolume * 1.1])
    }
  }, [priceData.length]) // Only when dataset size changes

  // Get visible data for 60-candle sliding window
  const visibleData = useMemo(() => {
    if (showAllTime) {
      return priceData // Show all data in all-time view
    }
    
    // Fixed 60-candle sliding window
    const endIndex = Math.min(currentIndex + 1, priceData.length)
    const startIndex = Math.max(0, endIndex - WINDOW_SIZE)
    return priceData.slice(startIndex, endIndex)
  }, [priceData, currentIndex, showAllTime])

  // Process markers and highlights - NO ANIMATIONS, exact positioning
  const chartElements = useMemo(() => {
    const annotations: any[] = []
    const shapes: any[] = []
    
    // Filter data to visible window
    const relevantData = showAllTime ? priceData : visibleData
    const visibleDates = relevantData.map(d => d.date)
    const minDate = visibleDates[0]
    const maxDate = visibleDates[visibleDates.length - 1]
    
    // MOMENTUM PERIODS - Light red background, exact positioning
    momentumPeriods.forEach(period => {
      if (period.type === 'momentum') {
        const startDate = period.start_date
        const endDate = period.end_date
        
        // Only show if period intersects with visible window
        if (startDate <= maxDate && endDate >= minDate) {
          shapes.push({
            type: 'rect',
            xref: 'x',
            yref: 'paper',
            x0: startDate,
            x1: endDate,
            y0: 0,
            y1: 1,
            fillcolor: STATE_COLORS.MOMENTUM_DETECTED,
            line: { width: 0 },
            layer: 'below'
          })
          
          // Momentum marker - exact position, no animation
          annotations.push({
            x: startDate,
            y: period.start_price || 0,
            text: '🚀',
            showarrow: false,
            font: { size: 16 },
            bgcolor: 'rgba(239, 68, 68, 0.8)',
            bordercolor: '#ef4444',
            borderwidth: 1
          })
        }
      }
    })
    
    // CONSOLIDATION PERIODS - Light yellow background, exact positioning
    momentumPeriods.forEach(period => {
      if (period.type === 'consolidation') {
        const startDate = period.start_date
        const endDate = period.end_date
        
        if (startDate <= maxDate && endDate >= minDate) {
          shapes.push({
            type: 'rect',
            xref: 'x',
            yref: 'paper',
            x0: startDate,
            x1: endDate,
            y0: 0,
            y1: 1,
            fillcolor: STATE_COLORS.CONSOLIDATION,
            line: { width: 0 },
            layer: 'below'
          })
          
          // Consolidation marker - exact position, no animation
          annotations.push({
            x: startDate,
            y: period.start_price || 0,
            text: '📊',
            showarrow: false,
            font: { size: 16 },
            bgcolor: 'rgba(251, 191, 36, 0.8)',
            bordercolor: '#fbbf24',
            borderwidth: 1
          })
        }
      }
    })
    
    // BUY/SELL SIGNALS - Exact positioning, no animation
    trades.forEach(trade => {
      // Buy signal
      if (trade.entry_date >= minDate && trade.entry_date <= maxDate) {
        annotations.push({
          x: trade.entry_date,
          y: trade.entry_price,
          text: '▲ BUY',
          showarrow: true,
          arrowhead: 1,
          arrowsize: 1.5,
          arrowwidth: 2,
          arrowcolor: TRADE_COLORS.BUY,
          ax: 0,
          ay: -40,
          bgcolor: 'rgba(16, 185, 129, 0.9)',
          bordercolor: TRADE_COLORS.BUY,
          borderwidth: 2,
          font: { color: 'white', size: 10 }
        })
      }
      
      // Sell signal
      if (trade.exit_date && trade.exit_price && 
          trade.exit_date >= minDate && trade.exit_date <= maxDate) {
        const pnlText = trade.pnl ? ` $${trade.pnl.toFixed(2)}` : ''
        annotations.push({
          x: trade.exit_date,
          y: trade.exit_price,
          text: `▼ SELL${pnlText}`,
          showarrow: true,
          arrowhead: 1,
          arrowsize: 1.5,
          arrowwidth: 2,
          arrowcolor: TRADE_COLORS.SELL,
          ax: 0,
          ay: 40,
          bgcolor: 'rgba(239, 68, 68, 0.9)',
          bordercolor: TRADE_COLORS.SELL,
          borderwidth: 2,
          font: { color: 'white', size: 10 }
        })
      }
    })
    
    return { annotations, shapes }
  }, [visibleData, trades, momentumPeriods, showAllTime, priceData])

  // Single candle per frame animation using requestAnimationFrame
  const animateNextCandle = useCallback(() => {
    if (isPlaying && currentIndex < priceData.length - 1 && !showAllTime) {
      setCurrentIndex(prev => prev + 1)
      
      // Schedule next frame
      animationRef.current = requestAnimationFrame(animateNextCandle)
    } else if (currentIndex >= priceData.length - 1) {
      setHasCompleted(true)
      setIsPlaying(false)
    }
  }, [isPlaying, currentIndex, priceData.length, showAllTime])

  // Start animation
  useEffect(() => {
    if (isPlaying && !showAllTime) {
      animationRef.current = requestAnimationFrame(animateNextCandle)
    } else {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
    }
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isPlaying, animateNextCandle, showAllTime])

  // Process streaming data from parent component
  useEffect(() => {
    if (streamingData && streamingData.length > 0) {
      console.log("📊 Chart received streaming data:", streamingData.length, "items")
      
      streamingData.forEach((item: any) => {
        if (item.type === 'candle' && item.data) {
          console.log("📊 Processing candle data:", item.data)
          setPriceData(prev => {
            const newData = [...prev, item.data]
            // Auto-start playing on first candle
            if (prev.length === 0) {
              console.log("🎬 Auto-starting chart animation")
              setIsPlaying(true)
              setCurrentIndex(0)
            }
            // Auto-advance current index as new data comes in
            if (prev.length > 0) {
              setCurrentIndex(prev => prev + 1)
            }
            return newData
          })
        } else if (item.type === 'trade' && item.data) {
          console.log("💰 Processing trade data:", item.data)
          setTrades(prev => [...prev, item.data])
        } else if (item.type === 'momentum_period' && item.data) {
          console.log("🔥 Processing momentum period:", item.data)
          setMomentumPeriods(prev => [...prev, item.data])
        } else {
          console.log("❓ Unrecognized streaming data:", item)
        }
      })
    }
  }, [streamingData])

  // Control functions
  const togglePlayPause = () => {
    if (hasCompleted) return
    setIsPlaying(!isPlaying)
  }

  const replayBacktest = () => {
    setCurrentIndex(0)
    setIsPlaying(true)
    setHasCompleted(false)
    setShowAllTime(false)
    
    // Clear existing data and restart stream
    setPriceData([])
    setTrades([])
    setMomentumPeriods([])
    
    // Clear any existing stream reference
    eventSourceRef.current = null
  }

  const toggleAllTimeView = () => {
    setShowAllTime(!showAllTime)
    setIsPlaying(false) // Pause animation in all-time view
  }

  // Cleanup
  useEffect(() => {
    return () => {
      // Clear animation frame
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [])

  // Plotly data - optimized for smooth rendering
  const plotData = useMemo(() => [
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
      hovertemplate: '<b>%{x}</b><br>O: %{open:.2f}<br>H: %{high:.2f}<br>L: %{low:.2f}<br>C: %{close:.2f}<extra></extra>'
    },
    // SMA line
    {
      type: 'scatter' as const,
      mode: 'lines' as const,
      x: visibleData.map(d => d.date),
      y: visibleData.map(d => d.sma_20),
      name: 'SMA20',
      line: { color: '#8b5cf6', width: 1.5 },
      hovertemplate: '<b>%{x}</b><br>SMA20: %{y:.2f}<extra></extra>'
    },
    // Volume bars
    {
      type: 'bar' as const,
      x: visibleData.map(d => d.date),
      y: visibleData.map(d => d.volume),
      name: 'Volume',
      yaxis: 'y2',
      marker: {
        color: visibleData.map(d => d.price >= d.open ? '#10b981' : '#ef4444'),
        opacity: 0.6
      },
      hovertemplate: '<b>%{x}</b><br>Volume: %{y:,.0f}<extra></extra>'
    }
  ], [visibleData, ticker])

  // Fixed layout - no auto-scaling during streaming
  const layout = useMemo(() => ({
    title: {
      text: `${ticker} - Live Momentum Backtest${showAllTime ? ' (All-Time View)' : ''}`,
      font: { color: 'white', size: 16 }
    },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(17, 24, 39, 0.8)', // Glassy dark background
    font: { color: 'white' },
    showlegend: false,
    xaxis: {
      title: '',
      gridcolor: 'rgba(255,255,255,0.1)',
      color: 'white',
      rangeslider: { visible: false },
      type: 'date',
      fixedrange: !showAllTime, // Lock zoom during streaming
      range: showAllTime ? undefined : [
        visibleData[0]?.date,
        visibleData[visibleData.length - 1]?.date
      ]
    },
    yaxis: {
      title: 'Price ($)',
      gridcolor: 'rgba(255,255,255,0.1)',
      color: 'white',
      domain: [0.3, 1],
      fixedrange: !showAllTime,
      range: showAllTime ? undefined : yAxisRange
    },
    yaxis2: {
      title: 'Volume',
      gridcolor: 'rgba(255,255,255,0.1)',
      color: 'white',
      domain: [0, 0.25],
      side: 'right',
      fixedrange: !showAllTime,
      range: showAllTime ? undefined : volumeRange
    },
    annotations: chartElements.annotations,
    shapes: chartElements.shapes,
    margin: { l: 50, r: 50, t: 50, b: 50 },
    height: 600
  }), [ticker, showAllTime, visibleData, yAxisRange, volumeRange, chartElements])

  const config = {
    responsive: true,
    displayModeBar: showAllTime, // Only show toolbar in all-time view
    displaylogo: false,
    scrollZoom: showAllTime,
    doubleClick: showAllTime ? 'reset' : false,
    modeBarButtonsToRemove: showAllTime ? [] : ['pan2d', 'select2d', 'lasso2d', 'zoomIn2d', 'zoomOut2d', 'autoScale2d', 'resetScale2d']
  }

  if (!backendReady && priceData.length === 0) {
    return (
      <div className="w-full h-[650px] flex items-center justify-center bg-black/40 backdrop-blur-xl rounded-xl border border-white/10">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-white/70">Connecting to backend...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full space-y-4" ref={containerRef}>
      {/* Control Panel */}
      <div className="flex items-center justify-between bg-black/40 backdrop-blur-xl rounded-xl p-4 border border-white/10">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-semibold text-white">
            Live Momentum Backtest
          </h3>
          <div className="text-sm text-white/60">
            {showAllTime 
              ? `${priceData.length} candles total`
              : `Candle ${currentIndex + 1} of ${priceData.length}`
            }
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {!showAllTime && (
            <button
              onClick={togglePlayPause}
              disabled={hasCompleted}
              className="flex items-center justify-center w-10 h-10 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-600 rounded-lg transition-colors"
            >
              {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </button>
          )}
          
          {/* Post-completion controls */}
          {hasCompleted && (
            <>
              <button
                onClick={toggleAllTimeView}
                className={`flex items-center justify-center w-10 h-10 rounded-lg transition-colors ${
                  showAllTime 
                    ? 'bg-blue-500 hover:bg-blue-600' 
                    : 'bg-gray-600 hover:bg-gray-700'
                }`}
              >
                {showAllTime ? <EyeOff className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
              </button>
              
              <button
                onClick={replayBacktest}
                className="flex items-center justify-center w-10 h-10 bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
              >
                <RotateCcw className="h-5 w-5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="bg-black/40 backdrop-blur-xl rounded-xl p-4 border border-white/10">
        <Plot
          data={plotData}
          layout={layout}
          config={config}
          style={{ width: '100%', height: '600px' }}
          useResizeHandler={true}
        />
      </div>

      {/* Stats */}
      {trades.length > 0 && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-black/40 backdrop-blur-xl rounded-lg p-4 border border-white/10">
            <h4 className="text-sm font-medium text-white/60 mb-1">Total Trades</h4>
            <p className="text-xl font-bold text-white">{trades.length}</p>
          </div>
          
          <div className="bg-black/40 backdrop-blur-xl rounded-lg p-4 border border-white/10">
            <h4 className="text-sm font-medium text-white/60 mb-1">Total P&L</h4>
            <p className={`text-xl font-bold ${
              trades.reduce((sum, trade) => sum + (trade.pnl || 0), 0) >= 0 
                ? 'text-green-400' 
                : 'text-red-400'
            }`}>
              ${trades.reduce((sum, trade) => sum + (trade.pnl || 0), 0).toFixed(2)}
            </p>
          </div>
          
          <div className="bg-black/40 backdrop-blur-xl rounded-lg p-4 border border-white/10">
            <h4 className="text-sm font-medium text-white/60 mb-1">Win Rate</h4>
            <p className="text-xl font-bold text-white">
              {trades.length > 0 
                ? ((trades.filter(t => (t.pnl || 0) > 0).length / trades.length) * 100).toFixed(0)
                : 0
              }%
            </p>
          </div>

          <div className="bg-black/40 backdrop-blur-xl rounded-lg p-4 border border-white/10">
            <h4 className="text-sm font-medium text-white/60 mb-1">Status</h4>
            <p className="text-lg font-bold text-purple-400">
              {hasCompleted ? 'Complete' : isPlaying ? 'Running' : 'Paused'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}