'use client'

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { Play, Pause, RotateCcw, Settings, Clock, Gauge, Zap } from 'lucide-react'

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
  exit_reason?: string
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

interface SmoothSlidingChartProps {
  priceData: PriceDataPoint[]
  trades: Trade[]
  momentumPeriods: MomentumPeriod[]
  ticker: string
  isLoading?: boolean
}

// State management for chart viewport persistence
interface ViewportState {
  windowDays: number
  driftSpeed: number // days per second
  isPlaying: boolean
  currentPosition: number // current time position in milliseconds
  ticker: string
}

const TRADE_COLORS = {
  BUY: '#10b981',
  SELL: '#ef4444'
}

const STATE_COLORS = {
  MOMENTUM_DETECTED: 'rgba(239, 68, 68, 0.3)',
  CONSOLIDATION: 'rgba(251, 191, 36, 0.3)',
  IN_POSITION: 'rgba(16, 185, 129, 0.3)',
  NOT_IN_TRADE: null
}

export default function SmoothSlidingChart({ 
  priceData, 
  trades, 
  momentumPeriods, 
  ticker,
  isLoading = false 
}: SmoothSlidingChartProps) {
  
  // Fixed-days viewport state
  const [windowDays, setWindowDays] = useState(30) // Fixed number of days to show
  const [driftSpeed, setDriftSpeed] = useState(1.0) // days per second
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentPosition, setCurrentPosition] = useState(0) // Position in milliseconds from start
  
  // Animation references
  const animationFrameRef = useRef<number | null>(null)
  const lastFrameTimeRef = useRef<number>(0)
  const plotlyRef = useRef<any>(null)
  
  // Viewport persistence state
  const viewportStateRef = useRef<Map<string, ViewportState>>(new Map())
  
  // Calculate time bounds from data
  const dataBounds = useMemo(() => {
    if (!priceData.length) return { startTime: 0, endTime: 0, duration: 0 }
    
    const startTime = new Date(priceData[0].date).getTime()
    const endTime = new Date(priceData[priceData.length - 1].date).getTime()
    const duration = endTime - startTime
    
    return { startTime, endTime, duration }
  }, [priceData])
  
  // Calculate visible window bounds based on current position
  const windowBounds = useMemo(() => {
    const windowMs = windowDays * 24 * 60 * 60 * 1000 // Convert days to milliseconds
    const currentTime = dataBounds.startTime + currentPosition
    const windowStart = currentTime
    const windowEnd = currentTime + windowMs
    
    return { 
      windowStart, 
      windowEnd, 
      windowMs,
      startDate: new Date(windowStart),
      endDate: new Date(windowEnd)
    }
  }, [currentPosition, windowDays, dataBounds.startTime])
  
  // Get visible data slice based on time window
  const visibleData = useMemo(() => {
    if (!priceData.length) return []
    
    return priceData.filter(point => {
      const pointTime = new Date(point.date).getTime()
      return pointTime >= windowBounds.windowStart && pointTime <= windowBounds.windowEnd
    })
  }, [priceData, windowBounds])
  
  // Calculate auto-zoom for perfect fit
  const calculateAutoZoom = useCallback((data: PriceDataPoint[]) => {
    if (!data.length) return { priceRange: [0, 100], volumeRange: [0, 1000] }
    
    const prices = data.flatMap(d => [d.high, d.low, d.open, d.price])
    const volumes = data.map(d => d.volume)
    
    const minPrice = Math.min(...prices)
    const maxPrice = Math.max(...prices)
    const maxVolume = Math.max(...volumes)
    
    // Add 5% padding to price range for better visibility
    const priceMargin = (maxPrice - minPrice) * 0.05
    const newPriceRange: [number, number] = [
      Math.max(0, minPrice - priceMargin),
      maxPrice + priceMargin
    ]
    
    // Add 10% padding to volume range
    const volumeMargin = maxVolume * 0.1
    const newVolumeRange: [number, number] = [0, maxVolume + volumeMargin]
    
    return { priceRange: newPriceRange, volumeRange: newVolumeRange }
  }, [])
  
  // Auto-zoom ranges
  const { priceRange, volumeRange } = useMemo(() => {
    return calculateAutoZoom(visibleData)
  }, [visibleData, calculateAutoZoom])
  
  // Save viewport state when changing
  useEffect(() => {
    if (ticker) {
      const state: ViewportState = {
        windowDays,
        driftSpeed,
        isPlaying,
        currentPosition,
        ticker
      }
      viewportStateRef.current.set(ticker, state)
    }
  }, [ticker, windowDays, driftSpeed, isPlaying, currentPosition])
  
  // Restore viewport state when ticker changes
  useEffect(() => {
    if (ticker && viewportStateRef.current.has(ticker)) {
      const savedState = viewportStateRef.current.get(ticker)!
      setWindowDays(savedState.windowDays)
      setDriftSpeed(savedState.driftSpeed)
      setIsPlaying(savedState.isPlaying)
      setCurrentPosition(savedState.currentPosition)
    } else {
      // Reset to beginning for new ticker
      setCurrentPosition(0)
      setIsPlaying(false)
    }
  }, [ticker])
  
  // Smooth animation loop using requestAnimationFrame
  const animate = useCallback((currentTime: number) => {
    if (!isPlaying) return
    
    const deltaTime = currentTime - lastFrameTimeRef.current
    lastFrameTimeRef.current = currentTime
    
    // Calculate drift amount based on speed and frame time
    const driftMs = (driftSpeed * 1000) * (deltaTime / 1000) // Convert to ms per frame
    
    setCurrentPosition(prev => {
      const newPosition = prev + driftMs
      const maxPosition = Math.max(0, dataBounds.duration - (windowDays * 24 * 60 * 60 * 1000))
      
      // Stop at the end or loop back to beginning
      if (newPosition >= maxPosition) {
        setIsPlaying(false)
        return maxPosition
      }
      
      return newPosition
    })
    
    // Continue animation
    animationFrameRef.current = requestAnimationFrame(animate)
  }, [isPlaying, driftSpeed, dataBounds.duration, windowDays])
  
  // Start/stop animation
  useEffect(() => {
    if (isPlaying) {
      lastFrameTimeRef.current = performance.now()
      animationFrameRef.current = requestAnimationFrame(animate)
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
    
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [isPlaying, animate])
  
  // Control functions
  const togglePlayPause = useCallback(() => {
    setIsPlaying(prev => !prev)
  }, [])
  
  const resetToStart = useCallback(() => {
    setCurrentPosition(0)
    setIsPlaying(false)
  }, [])
  
  const jumpToEnd = useCallback(() => {
    const maxPosition = Math.max(0, dataBounds.duration - (windowDays * 24 * 60 * 60 * 1000))
    setCurrentPosition(maxPosition)
    setIsPlaying(false)
  }, [dataBounds.duration, windowDays])
  
  // Generate plot data
  const plotData = useMemo(() => {
    if (!visibleData.length) return []

    const traces: any[] = []

    // Candlestick data
    traces.push({
      type: 'candlestick',
      x: visibleData.map(d => d.date),
      open: visibleData.map(d => d.open),
      high: visibleData.map(d => d.high),
      low: visibleData.map(d => d.low),
      close: visibleData.map(d => d.price),
      name: ticker,
      yaxis: 'y',
      increasing: { line: { color: '#10b981' } },
      decreasing: { line: { color: '#ef4444' } },
      line: { width: 1 },
      opacity: 0.9
    })

    // Volume bars
    traces.push({
      type: 'bar',
      x: visibleData.map(d => d.date),
      y: visibleData.map(d => d.volume),
      name: 'Volume',
      yaxis: 'y2',
      marker: {
        color: visibleData.map(d => d.price >= d.open ? '#10b981' : '#ef4444'),
        opacity: 0.6
      },
      showlegend: false
    })

    // SMA line if available
    if (visibleData.some(d => d.sma_20)) {
      traces.push({
        type: 'scatter',
        mode: 'lines',
        x: visibleData.map(d => d.date),
        y: visibleData.map(d => d.sma_20),
        name: 'SMA 20',
        line: { color: '#8b5cf6', width: 2 },
        yaxis: 'y',
        showlegend: false
      })
    }

    return traces
  }, [visibleData, ticker])

  // Generate annotations and shapes for trades and periods
  const chartElements = useMemo(() => {
    const annotations: any[] = []
    const shapes: any[] = []

    // Filter trades to visible window
    const visibleTrades = trades.filter(trade => {
      const entryTime = new Date(trade.entry_date).getTime()
      return entryTime >= windowBounds.windowStart && entryTime <= windowBounds.windowEnd
    })

    // Trade annotations
    visibleTrades.forEach(trade => {
      // Buy annotation
      annotations.push({
        x: trade.entry_date,
        y: trade.entry_price,
        text: `▲ BUY`,
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
        font: { color: 'white', size: 10 }
      })

      // Sell annotation
      if (trade.exit_date && trade.exit_price) {
        const pnlText = trade.pnl ? ` $${trade.pnl.toFixed(2)}` : ''
        const isFinalExit = trade.exit_reason === 'Final candle auto-sell'
        const sellText = isFinalExit ? `▼ FINAL EXIT${pnlText}` : `▼ SELL${pnlText}`
        const borderColor = isFinalExit ? '#fbbf24' : TRADE_COLORS.SELL
        
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
          font: { color: 'white', size: 10 }
        })
      }
    })

    // Trading state background shapes
    visibleData.forEach((point, index) => {
      const state = point.trading_state
      if (state && STATE_COLORS[state]) {
        const nextPoint = visibleData[index + 1]
        const endDate = nextPoint ? nextPoint.date : point.date
        
        shapes.push({
          type: 'rect',
          xref: 'x',
          yref: 'paper',
          x0: point.date,
          x1: endDate,
          y0: 0,
          y1: 1,
          fillcolor: STATE_COLORS[state],
          opacity: 0.3,
          layer: 'below',
          line: { width: 0 }
        })
      }
    })

    return { annotations, shapes }
  }, [visibleData, trades, windowBounds])

  // Calculate progress percentage
  const progressPercent = dataBounds.duration > 0 ? 
    (currentPosition / Math.max(dataBounds.duration - (windowDays * 24 * 60 * 60 * 1000), 1)) * 100 : 0

  // Layout configuration with fixed time range
  const layout = useMemo(() => ({
    title: {
      text: `${ticker} - Smooth Sliding View (${windowDays} days) - ${windowBounds.startDate.toLocaleDateString()} to ${windowBounds.endDate.toLocaleDateString()}`,
      font: { color: 'white', size: 16 }
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
      type: 'date',
      fixedrange: true, // Lock zoom to maintain smooth sliding
      range: [windowBounds.startDate.toISOString(), windowBounds.endDate.toISOString()],
      autorange: false
    },
    yaxis: {
      title: 'Price ($)',
      gridcolor: 'rgba(255,255,255,0.1)',
      color: 'white',
      domain: [0.3, 1],
      range: priceRange,
      autorange: false,
      fixedrange: true
    },
    yaxis2: {
      title: 'Volume',
      gridcolor: 'rgba(255,255,255,0.1)',
      color: 'white',
      domain: [0, 0.25],
      side: 'right',
      range: volumeRange,
      autorange: false,
      fixedrange: true
    },
    annotations: chartElements.annotations,
    shapes: chartElements.shapes,
    margin: { l: 50, r: 50, t: 50, b: 50 },
    height: 650
  }), [ticker, windowDays, windowBounds, priceRange, volumeRange, chartElements])

  const config = {
    responsive: true,
    displayModeBar: false, // Disable all zoom/pan controls
    displaylogo: false,
    scrollZoom: false,
    doubleClick: false,
    staticPlot: false, // Allow hover
    editable: false
  }

  if (isLoading) {
    return (
      <div className="w-full h-[700px] flex items-center justify-center bg-card/50 rounded-xl">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading chart data...</p>
        </div>
      </div>
    )
  }

  if (!priceData.length) {
    return (
      <div className="w-full h-[700px] flex items-center justify-center bg-card/50 rounded-xl">
        <p className="text-muted-foreground">No data available</p>
      </div>
    )
  }

  return (
    <div className="w-full space-y-4">
      {/* Chart Header with Controls */}
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold text-white">
          {ticker} - Smooth Sliding Analysis
        </h3>
        
        {/* Animation Controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-card/30 rounded-lg p-2">
            {/* Play/Pause */}
            <button
              onClick={togglePlayPause}
              className="p-1 hover:bg-white/10 rounded text-white"
              title={isPlaying ? 'Pause animation' : 'Play animation'}
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </button>
            
            {/* Reset */}
            <button
              onClick={resetToStart}
              className="p-1 hover:bg-white/10 rounded text-white"
              title="Reset to start"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            
            {/* Jump to end */}
            <button
              onClick={jumpToEnd}
              className="p-1 hover:bg-white/10 rounded text-white"
              title="Jump to end"
            >
              <Zap className="w-4 h-4" />
            </button>
          </div>

          {/* Window Days Control */}
          <div className="flex items-center gap-2 bg-card/30 rounded-lg p-2">
            <Clock className="w-4 h-4 text-gray-300" />
            <span className="text-sm text-gray-300">Days:</span>
            <select
              value={windowDays}
              onChange={(e) => setWindowDays(Number(e.target.value))}
              className="bg-transparent text-sm text-white border border-gray-600 rounded px-2 py-1"
            >
              <option value={7}>7</option>
              <option value={14}>14</option>
              <option value={30}>30</option>
              <option value={60}>60</option>
              <option value={90}>90</option>
            </select>
          </div>

          {/* Drift Speed Control */}
          <div className="flex items-center gap-2 bg-card/30 rounded-lg p-2">
            <Gauge className="w-4 h-4 text-gray-300" />
            <span className="text-sm text-gray-300">Speed:</span>
            <input
              type="range"
              min="0.1"
              max="5.0"
              step="0.1"
              value={driftSpeed}
              onChange={(e) => setDriftSpeed(Number(e.target.value))}
              className="w-16 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
            />
            <span className="text-xs text-gray-300 min-w-[45px]">
              {driftSpeed.toFixed(1)}d/s
            </span>
          </div>
        </div>
      </div>

      {/* Progress indicator */}
      <div className="w-full bg-gray-700 rounded-full h-2">
        <div 
          className="bg-gradient-to-r from-purple-500 to-blue-500 h-2 rounded-full transition-all duration-75"
          style={{ width: `${Math.min(Math.max(progressPercent, 0), 100)}%` }}
        ></div>
      </div>

      {/* Current Time Display */}
      <div className="text-center text-sm text-gray-400">
        Current View: {windowBounds.startDate.toLocaleDateString()} - {windowBounds.endDate.toLocaleDateString()}
        {isPlaying && <span className="ml-2 text-green-400">● LIVE</span>}
      </div>

      {/* Chart */}
      <div className="bg-card/50 rounded-xl p-4">
        <Plot
          ref={plotlyRef}
          data={plotData}
          layout={layout}
          config={config}
          style={{ width: '100%', height: '650px' }}
        />
      </div>

      {/* Help Text */}
      <div className="text-xs text-gray-400 text-center">
        Fixed {windowDays}-day window sliding at {driftSpeed}d/s • 
        Play/Pause to control animation • 
        Adjust speed and window size with controls above
      </div>
    </div>
  )
}