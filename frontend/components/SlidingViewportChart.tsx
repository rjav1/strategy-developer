'use client'

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { ChevronLeft, ChevronRight, RotateCcw, ZoomIn, ZoomOut, Settings, SkipBack, SkipForward } from 'lucide-react'

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

interface SlidingViewportChartProps {
  priceData: PriceDataPoint[]
  trades: Trade[]
  momentumPeriods: MomentumPeriod[]
  ticker: string
  isLoading?: boolean
}

// State management for chart viewport persistence
interface ViewportState {
  startIndex: number
  windowSize: number
  ticker: string
  priceRange: [number, number]
  volumeRange: [number, number]
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

export default function SlidingViewportChart({ 
  priceData, 
  trades, 
  momentumPeriods, 
  ticker,
  isLoading = false 
}: SlidingViewportChartProps) {
  
  // Sliding viewport state
  const [windowSize, setWindowSize] = useState(50) // Number of candles to show
  const [startIndex, setStartIndex] = useState(0) // Starting index of the window
  const [maxStartIndex, setMaxStartIndex] = useState(0)
  
  // Auto-zoom state
  const [autoZoom, setAutoZoom] = useState(true)
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 100])
  const [volumeRange, setVolumeRange] = useState<[number, number]>([0, 1000])
  
  // Viewport persistence state
  const viewportStateRef = useRef<Map<string, ViewportState>>(new Map())
  
  // Calculate maximum start index
  useEffect(() => {
    if (priceData.length > 0) {
      const maxIndex = Math.max(0, priceData.length - windowSize)
      setMaxStartIndex(maxIndex)
      
      // Start at the end by default (most recent data)
      setStartIndex(maxIndex)
    }
  }, [priceData.length, windowSize])

  // Get visible data slice
  const visibleData = useMemo(() => {
    if (!priceData.length) return []
    const endIndex = Math.min(startIndex + windowSize, priceData.length)
    return priceData.slice(startIndex, endIndex)
  }, [priceData, startIndex, windowSize])

  // Auto-zoom calculation for perfect fit
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

  // Update auto-zoom when visible data changes
  useEffect(() => {
    if (autoZoom && visibleData.length > 0) {
      const { priceRange: newPriceRange, volumeRange: newVolumeRange } = calculateAutoZoom(visibleData)
      setPriceRange(newPriceRange)
      setVolumeRange(newVolumeRange)
    }
  }, [visibleData, autoZoom, calculateAutoZoom])

  // Save viewport state when changing
  useEffect(() => {
    if (ticker && priceData.length > 0) {
      const state: ViewportState = {
        startIndex,
        windowSize,
        ticker,
        priceRange,
        volumeRange
      }
      viewportStateRef.current.set(ticker, state)
    }
  }, [ticker, startIndex, windowSize, priceRange, volumeRange, priceData.length])

  // Restore viewport state when ticker changes
  useEffect(() => {
    if (ticker && viewportStateRef.current.has(ticker)) {
      const savedState = viewportStateRef.current.get(ticker)!
      setStartIndex(savedState.startIndex)
      setWindowSize(savedState.windowSize)
      if (!autoZoom) {
        setPriceRange(savedState.priceRange)
        setVolumeRange(savedState.volumeRange)
      }
    }
  }, [ticker, autoZoom])

  // Sliding controls
  const slideLeft = useCallback(() => {
    setStartIndex(prev => Math.max(0, prev - 1))
  }, [])

  const slideRight = useCallback(() => {
    setStartIndex(prev => Math.min(maxStartIndex, prev + 1))
  }, [maxStartIndex])

  const jumpLeft = useCallback(() => {
    setStartIndex(prev => Math.max(0, prev - windowSize))
  }, [windowSize])

  const jumpRight = useCallback(() => {
    setStartIndex(prev => Math.min(maxStartIndex, prev + windowSize))
  }, [maxStartIndex, windowSize])

  const resetToEnd = useCallback(() => {
    setStartIndex(maxStartIndex)
  }, [maxStartIndex])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return // Don't interfere with input fields
      
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault()
          if (e.shiftKey) jumpLeft()
          else slideLeft()
          break
        case 'ArrowRight':
          e.preventDefault()
          if (e.shiftKey) jumpRight()
          else slideRight()
          break
        case 'Home':
          e.preventDefault()
          setStartIndex(0)
          break
        case 'End':
          e.preventDefault()
          resetToEnd()
          break
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [slideLeft, slideRight, jumpLeft, jumpRight, resetToEnd])

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
      const entryDate = new Date(trade.entry_date)
      const firstVisibleDate = new Date(visibleData[0]?.date || '1900-01-01')
      const lastVisibleDate = new Date(visibleData[visibleData.length - 1]?.date || '2100-01-01')
      return entryDate >= firstVisibleDate && entryDate <= lastVisibleDate
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
  }, [visibleData, trades])

  // Layout configuration
  const layout = useMemo(() => ({
    title: {
      text: `${ticker} - Sliding Viewport Chart (${startIndex + 1}-${startIndex + visibleData.length} of ${priceData.length})`,
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
      fixedrange: true // Disable zoom/pan to maintain sliding behavior
    },
    yaxis: {
      title: 'Price ($)',
      gridcolor: 'rgba(255,255,255,0.1)',
      color: 'white',
      domain: [0.3, 1],
      range: autoZoom ? priceRange : undefined,
      autorange: !autoZoom,
      fixedrange: autoZoom
    },
    yaxis2: {
      title: 'Volume',
      gridcolor: 'rgba(255,255,255,0.1)',
      color: 'white',
      domain: [0, 0.25],
      side: 'right',
      range: autoZoom ? volumeRange : undefined,
      autorange: !autoZoom,
      fixedrange: autoZoom
    },
    annotations: chartElements.annotations,
    shapes: chartElements.shapes,
    margin: { l: 50, r: 50, t: 50, b: 50 },
    height: 650
  }), [ticker, startIndex, visibleData.length, priceData.length, priceRange, volumeRange, autoZoom, chartElements])

  const config = {
    responsive: true,
    displayModeBar: !autoZoom, // Only show toolbar when auto-zoom is disabled
    displaylogo: false,
    scrollZoom: !autoZoom,
    doubleClick: autoZoom ? false : 'reset',
    modeBarButtonsToRemove: autoZoom ? ['pan2d', 'select2d', 'lasso2d', 'zoomIn2d', 'zoomOut2d', 'autoScale2d', 'resetScale2d'] : []
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
      {/* Chart Header with Sliding Controls */}
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold text-white">
          {ticker} - Sliding Viewport Analysis
        </h3>
        
        {/* Sliding Controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-card/30 rounded-lg p-2">
            {/* Navigation buttons */}
            <button
              onClick={() => setStartIndex(0)}
              disabled={startIndex === 0}
              className="p-1 hover:bg-white/10 rounded disabled:opacity-50 disabled:cursor-not-allowed"
              title="Go to start (Home)"
            >
              <SkipBack className="w-4 h-4" />
            </button>
            
            <button
              onClick={jumpLeft}
              disabled={startIndex === 0}
              className="p-1 hover:bg-white/10 rounded disabled:opacity-50 disabled:cursor-not-allowed"
              title="Jump left (Shift + ←)"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            
            <button
              onClick={slideLeft}
              disabled={startIndex === 0}
              className="p-1 hover:bg-white/10 rounded disabled:opacity-50 disabled:cursor-not-allowed"
              title="Slide left (←)"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            
            <span className="text-sm text-gray-300 px-2 min-w-[80px] text-center">
              {startIndex + 1}-{startIndex + visibleData.length}
            </span>
            
            <button
              onClick={slideRight}
              disabled={startIndex >= maxStartIndex}
              className="p-1 hover:bg-white/10 rounded disabled:opacity-50 disabled:cursor-not-allowed"
              title="Slide right (→)"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            
            <button
              onClick={jumpRight}
              disabled={startIndex >= maxStartIndex}
              className="p-1 hover:bg-white/10 rounded disabled:opacity-50 disabled:cursor-not-allowed"
              title="Jump right (Shift + →)"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            
            <button
              onClick={resetToEnd}
              disabled={startIndex >= maxStartIndex}
              className="p-1 hover:bg-white/10 rounded disabled:opacity-50 disabled:cursor-not-allowed"
              title="Go to end (End)"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>

          {/* Window size control */}
          <div className="flex items-center gap-2 bg-card/30 rounded-lg p-2">
            <span className="text-sm text-gray-300">Window:</span>
            <select
              value={windowSize}
              onChange={(e) => setWindowSize(Number(e.target.value))}
              className="bg-transparent text-sm text-white border border-gray-600 rounded px-2 py-1"
            >
              <option value={20}>20</option>
              <option value={30}>30</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </div>

          {/* Auto-zoom toggle */}
          <div className="flex items-center gap-2 bg-card/30 rounded-lg p-2">
            <button
              onClick={() => setAutoZoom(!autoZoom)}
              className={`p-1 rounded ${autoZoom ? 'bg-purple-600 text-white' : 'hover:bg-white/10'}`}
              title="Toggle auto-zoom"
            >
              {autoZoom ? <ZoomOut className="w-4 h-4" /> : <ZoomIn className="w-4 h-4" />}
            </button>
            <span className="text-sm text-gray-300">
              {autoZoom ? 'Auto' : 'Manual'}
            </span>
          </div>
        </div>
      </div>

      {/* Progress indicator */}
      <div className="w-full bg-gray-700 rounded-full h-1">
        <div 
          className="bg-gradient-to-r from-purple-500 to-blue-500 h-1 rounded-full transition-all duration-200"
          style={{ 
            width: `${((startIndex + windowSize / 2) / priceData.length) * 100}%`,
            marginLeft: `${(startIndex / priceData.length) * 100}%` 
          }}
        ></div>
      </div>

      {/* Chart */}
      <div className="bg-card/50 rounded-xl p-4">
        <Plot
          data={plotData}
          layout={layout}
          config={config}
          style={{ width: '100%', height: '650px' }}
        />
      </div>

      {/* Keyboard shortcuts help */}
      <div className="text-xs text-gray-400 text-center">
        Keyboard: ← → to slide, Shift+← Shift+→ to jump, Home/End to go to start/end
      </div>
    </div>
  )
}