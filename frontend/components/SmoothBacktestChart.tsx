'use client'

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
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

interface SmoothBacktestChartProps {
  ticker: string
  isStreaming?: boolean
  onStreamData?: (callback: (data: PriceDataPoint) => void) => void
  autoStart?: boolean
}

// Simplified color system
const TRADE_COLORS = {
  BUY: '#10b981',   // Green for all buys
  SELL: '#ef4444'   // Red for all sells
}

const STATE_COLORS = {
  MOMENTUM_DETECTED: 'rgba(239, 68, 68, 0.3)',    // Red background
  CONSOLIDATION: 'rgba(251, 191, 36, 0.3)',       // Yellow background  
  IN_POSITION: 'rgba(16, 185, 129, 0.3)',         // Green background
  NOT_IN_TRADE: null                               // No background
}

export default function SmoothBacktestChart({ 
  ticker,
  isStreaming = false,
  onStreamData,
  autoStart = false
}: SmoothBacktestChartProps) {
  // Real-time streaming data state
  const [priceData, setPriceData] = useState<PriceDataPoint[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [momentumPeriods, setMomentumPeriods] = useState<MomentumPeriod[]>([])
  
  // TradingView-style smooth scrolling state
  const [windowSize, setWindowSize] = useState(60) // TRUE SLIDING WINDOW - Last 60 candles only
  const [isAutoScrolling, setIsAutoScrolling] = useState(true) // Always auto-scroll
  const [isPlaying, setIsPlaying] = useState(true) // Always playing - no toggle
  const [hasStarted, setHasStarted] = useState(false) // Track if chart has started
  const [playbackSpeed, setPlaybackSpeed] = useState(60) // ms between frames for manual playback
  
  // Smooth animation state
  const [smoothOffset, setSmoothOffset] = useState(0) // Fractional offset for GPU transforms
  const animationRef = useRef<number | null>(null)
  const lastUpdateTime = useRef<number>(0)
  
  // Chart rendering optimization
  const plotlyRef = useRef<any>(null)
  const updateInProgress = useRef<boolean>(false)

  // Stable Y-axis ranges to prevent jumping
  const [stablePriceRange, setStablePriceRange] = useState<[number, number]>([0, 100])
  const [stableVolumeRange, setStableVolumeRange] = useState<[number, number]>([0, 1000])
  
  // Calculate current visible window
  const windowEnd = Math.min(priceData.length, priceData.length)
  const windowStart = Math.max(0, windowEnd - windowSize)
  const visibleData = priceData.slice(windowStart, windowEnd)

  // Update stable ranges only when necessary to prevent Y-axis jumping
  const updateStableRanges = useCallback((newData: PriceDataPoint[], forceUpdate = false) => {
    if (newData.length === 0) return

    const shouldUpdate = forceUpdate || newData.length % 10 === 0 // Update every 10 candles
    if (!shouldUpdate) return

    // Use expanded window for stable calculations
    const expandedStart = Math.max(0, newData.length - windowSize * 2)
    const expandedData = newData.slice(expandedStart)
    
    // Price range calculation
    const allPrices = expandedData.flatMap(d => [d.high, d.low, d.price, d.open])
    const minPrice = Math.min(...allPrices)
    const maxPrice = Math.max(...allPrices)
    const priceRange = maxPrice - minPrice
    const pricePadding = priceRange * 0.1 // 10% padding for stability
    
    const newPriceRange: [number, number] = [
      Math.max(0, minPrice - pricePadding), 
      maxPrice + pricePadding
    ]
    
    // Volume range calculation
    const allVolumes = expandedData.map(d => d.volume)
    const maxVolume = Math.max(...allVolumes)
    const minVolume = Math.min(...allVolumes)
    
    const newVolumeRange: [number, number] = [
      minVolume * 0.8, 
      maxVolume * 1.2
    ]
    
    // Only update if ranges have changed significantly
    const priceChangeThreshold = (stablePriceRange[1] - stablePriceRange[0]) * 0.2
    const volumeChangeThreshold = (stableVolumeRange[1] - stableVolumeRange[0]) * 0.2
    
    if (Math.abs(newPriceRange[0] - stablePriceRange[0]) > priceChangeThreshold ||
        Math.abs(newPriceRange[1] - stablePriceRange[1]) > priceChangeThreshold) {
      setStablePriceRange(newPriceRange)
    }
    
    if (Math.abs(newVolumeRange[0] - stableVolumeRange[0]) > volumeChangeThreshold ||
        Math.abs(newVolumeRange[1] - stableVolumeRange[1]) > volumeChangeThreshold) {
      setStableVolumeRange(newVolumeRange)
    }
  }, [windowSize, stablePriceRange, stableVolumeRange])

  // SINGLE CANDLE QUEUE for one-at-a-time streaming
  const dataQueue = useRef<PriceDataPoint[]>([])
  const streamingLoopRef = useRef<number | null>(null)
  const isStreamingActive = useRef<boolean>(false)

  // HIGHLIGHT MOMENTUM per candle
  const highlightMomentum = useCallback((candle: PriceDataPoint) => {
    const isMomentum = candle.trading_state && ['MOMENTUM_DETECTED', 'IN_POSITION'].includes(candle.trading_state)
    return isMomentum ? { 
      color: 'rgba(251, 191, 36, 0.3)', 
      drawOnTop: true,
      type: 'momentum' as const
    } : null
  }, [])

  // ADD SINGLE CANDLE with TRUE 60-CANDLE SLIDING WINDOW
  const addSingleCandle = useCallback((candle: PriceDataPoint) => {
    if (updateInProgress.current) return
    updateInProgress.current = true

    console.log(`🕯️ Adding single candle: ${candle.date} - ${candle.price}`)
    
    // Apply momentum highlight to this candle
    const highlight = highlightMomentum(candle)
    const enhancedCandle = { ...candle, highlight }

    setPriceData(prevData => {
      // Add exactly ONE candle to buffer
      let newData = [...prevData, enhancedCandle]
      
      // TRUE SLIDING WINDOW - Keep exactly 60 candles
      if (newData.length > windowSize) {
        const candlesToRemove = newData.length - windowSize
        newData = newData.slice(candlesToRemove) // Remove oldest candles to maintain 60
        
        // SMOOTH GPU SLIDE - Translate viewport left by candle width
        requestAnimationFrame(() => {
          setSmoothOffset(prev => prev + candlesToRemove * 12) // 12px per candle width
        })
      }
      
      // Update stable ranges for the visible window
      updateStableRanges(newData)
      
      updateInProgress.current = false
      return newData
    })

    // Process momentum periods for sliding window compatibility
    if (highlight) {
      setMomentumPeriods(prev => {
        const lastPeriod = prev[prev.length - 1]
        if (!lastPeriod || lastPeriod.end_date) {
          // Start new momentum period
          return [...prev, {
            start_date: candle.date,
            end_date: candle.date,
            type: 'momentum' as const,
            start_price: candle.price,
            end_price: candle.price
          }]
        } else {
          // Extend current momentum period
          return prev.map((period, idx) => 
            idx === prev.length - 1 
              ? { ...period, end_date: candle.date, end_price: candle.price }
              : period
          )
        }
      })
    }

    // Process consolidation periods
    if (candle.trading_state === 'CONSOLIDATION') {
      setMomentumPeriods(prev => {
        const lastPeriod = prev[prev.length - 1]
        if (!lastPeriod || lastPeriod.type !== 'consolidation') {
          // Start new consolidation period
          return [...prev, {
            start_date: candle.date,
            end_date: candle.date,
            type: 'consolidation' as const,
            start_price: candle.price,
            end_price: candle.price
          }]
        } else {
          // Extend current consolidation period
          return prev.map((period, idx) => 
            idx === prev.length - 1 
              ? { ...period, end_date: candle.date, end_price: candle.price }
              : period
          )
        }
      })
    }

    // Process trades with full buy/sell signals
    if ((candle as any).trade_event) {
      const tradeEvent = (candle as any).trade_event
      if (tradeEvent.type === 'buy' || tradeEvent.type === 'sell') {
        setTrades(prevTrades => [...prevTrades, {
          entry_date: tradeEvent.type === 'buy' ? candle.date : prevTrades[prevTrades.length - 1]?.entry_date || candle.date,
          entry_price: tradeEvent.type === 'buy' ? candle.price : prevTrades[prevTrades.length - 1]?.entry_price || candle.price,
          exit_date: tradeEvent.type === 'sell' ? candle.date : undefined,
          exit_price: tradeEvent.type === 'sell' ? candle.price : undefined,
          pnl: tradeEvent.pnl || 0,
          status: tradeEvent.type === 'sell' ? 'closed' : 'open',
          signal_type: tradeEvent.type // Store signal type for markers
        }])
      }
    }
  }, [windowSize, updateStableRanges, highlightMomentum])

  // TRADINGVIEW-LIKE STREAMING LOOP - Process exactly ONE candle per frame
  const processQueue = useCallback(() => {
    // Process exactly ONE candle per animation frame
    if (dataQueue.current.length > 0 && !updateInProgress.current) {
      const candle = dataQueue.current.shift() // Take only ONE candle - no batching
      if (candle) {
        addSingleCandle(candle)
      }
    }
    
    // Continue the persistent loop for smooth streaming
    if (isStreamingActive.current) {
      streamingLoopRef.current = requestAnimationFrame(processQueue)
    }
  }, [addSingleCandle])

  // START PERSISTENT STREAMING LOOP
  const startStreamingLoop = useCallback(() => {
    if (!isStreamingActive.current) {
      console.log("🚀 Starting persistent streaming loop - one candle per frame")
      isStreamingActive.current = true
      streamingLoopRef.current = requestAnimationFrame(processQueue)
    }
  }, [processQueue])

  // QUEUE-BASED CANDLE ADDITION - One candle per frame streaming
  const addCandleToChart = useCallback((newPoint: PriceDataPoint) => {
    console.log(`📥 Queuing candle: ${newPoint.date}`)
    
    // Add to queue for single-candle processing
    dataQueue.current.push(newPoint)
    
    // Start streaming loop if not already active
    startStreamingLoop()
  }, [startStreamingLoop])

  // SINGLE CALLBACK REGISTRATION - No duplicates
  const callbackRegistered = useRef<boolean>(false)
  
  useEffect(() => {
    if (onStreamData && !callbackRegistered.current) {
      console.log("🔌 Registering streaming callback ONCE for real-time candles")
      console.log("📋 Callback function:", addCandleToChart)
      onStreamData(addCandleToChart)
      callbackRegistered.current = true
    } else if (!onStreamData) {
      console.warn("⚠️ onStreamData prop is missing!")
    }
  }, [onStreamData, addCandleToChart])
  
  // GRACEFUL MONITORING - No errors, just monitoring
  useEffect(() => {
    if (isStreaming) {
      console.log("🚀 Streaming started, monitoring candle flow...")
      console.log("📊 Current candle count:", priceData.length)
      
      const timeoutId = setTimeout(() => {
        if (priceData.length === 0) {
          console.warn("⚠️ No candles received yet, but continuing gracefully...")
        } else {
          console.log("✅ SUCCESS: Chart has received", priceData.length, "candles")
        }
      }, 3000) // Reduced timeout, no error throwing
      
      return () => clearTimeout(timeoutId)
    }
  }, [isStreaming, priceData.length])

  // ALWAYS AUTO-START - No toggle, always ready
  useEffect(() => {
    if (autoStart) {
      console.log("🎬 Auto-starting chart for live backtest")
      setIsAutoScrolling(true)
      setIsPlaying(true) // Always playing
      setHasStarted(true)
      
      // Clear data for fresh start
      setPriceData([])
      setTrades([])
      setSmoothOffset(0)
    }
  }, [autoStart])

  // AUTO-RUN ALWAYS ON - No conditions or toggles
  useEffect(() => {
    // Chart is always ready for streaming - auto-run is default
    setIsPlaying(true)
    setIsAutoScrolling(true)
    setHasStarted(true)
    
    // Pre-start the streaming loop for immediate response
    startStreamingLoop()
  }, [startStreamingLoop])

  // TRUE SLIDING WINDOW ANIMATION - TradingView style
  useEffect(() => {
    if (!isAutoScrolling || !isPlaying) return

    const animate = (currentTime: number) => {
      if (currentTime - lastUpdateTime.current >= 16) { // Target 60 FPS
        // Only animate when we have a full window (60 candles)
        if (priceData.length >= windowSize) {
          setSmoothOffset(prev => {
            // Calculate smooth drift for continuous sliding
            const targetOffset = (priceData.length - windowSize) * 10 // Fine-tuned for 60-candle window
            const currentOffset = prev
            const diff = targetOffset - currentOffset
            return currentOffset + (diff * 0.08) // TradingView-like smooth easing
          })
        }
        lastUpdateTime.current = currentTime
      }
      
      if (isAutoScrolling && isPlaying) {
        animationRef.current = requestAnimationFrame(animate)
      }
    }
    
    animationRef.current = requestAnimationFrame(animate)
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isAutoScrolling, isPlaying, priceData.length, windowSize])

  // CLEANUP streaming loop on unmount
  useEffect(() => {
    return () => {
      isStreamingActive.current = false
      if (streamingLoopRef.current) {
        cancelAnimationFrame(streamingLoopRef.current)
      }
    }
  }, [])

  // REMOVED MANUAL CONTROLS - Always auto-run
  // No toggle controls - chart always runs automatically

  // Process data for Plotly with memoization for performance
  const plotData = useMemo(() => {
    if (visibleData.length === 0) return []

    const traces: any[] = [
      // Candlestick trace
      {
        type: 'candlestick' as const,
        x: visibleData.map(d => d.date),
        open: visibleData.map(d => d.open),
        high: visibleData.map(d => d.high),
        low: visibleData.map(d => d.low),
        close: visibleData.map(d => d.price),
        name: ticker,
        yaxis: 'y',
        increasing: { line: { color: '#10b981' } },
        decreasing: { line: { color: '#ef4444' } },
        showlegend: false,
        hovertemplate: 
          '<b>%{x}</b><br>' +
          'Open: $%{open:.2f}<br>' +
          'High: $%{high:.2f}<br>' +
          'Low: $%{low:.2f}<br>' +
          'Close: $%{close:.2f}<br>' +
          'Volume: %{customdata.volume:,.0f}<br>' +
          'State: %{customdata.trading_state}<br>' +
          '<extra></extra>',
        customdata: visibleData.map(d => ({
          trading_state: d.trading_state || 'NOT_IN_TRADE',
          volume: d.volume,
          sma_20: d.sma_20 || 0,
          momentum_strength: d.momentum_strength || 0,
          atr: d.atr || 0
        }))
      },
      // 20-day SMA line
      {
        type: 'scatter' as const,
        mode: 'lines' as const,
        x: visibleData.map(d => d.date),
        y: visibleData.map(d => d.sma_20),
        name: '20-day SMA',
        yaxis: 'y',
        line: {
          color: '#8b5cf6',
          width: 2
        },
        showlegend: false,
        hovertemplate: 
          '<b>%{x}</b><br>' +
          '20-day SMA: $%{y:.2f}' +
          '<extra></extra>'
      },
      // Volume trace
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
        showlegend: false,
        hovertemplate: 
          '<b>%{x}</b><br>' +
          'Volume: %{y:,.0f}<br>' +
          '<extra></extra>'
      }
    ]

    // ADD MOMENTUM HIGHLIGHTS - Visual momentum period overlays
    const visibleMomentumPeriods = momentumPeriods.filter(period => {
      const startDate = new Date(period.start_date)
      const endDate = new Date(period.end_date)
      const firstVisible = visibleData.length > 0 ? new Date(visibleData[0].date) : null
      const lastVisible = visibleData.length > 0 ? new Date(visibleData[visibleData.length - 1].date) : null
      
      return firstVisible && lastVisible && startDate <= lastVisible && endDate >= firstVisible
    })

    // MOMENTUM PERIOD HIGHLIGHTS
    visibleMomentumPeriods.forEach((period, index) => {
      if (period.type === 'momentum') {
        // Momentum background fill
        traces.push({
          type: 'scatter',
          mode: 'none',
          x: [period.start_date, period.end_date, period.end_date, period.start_date, period.start_date],
          y: [period.start_price, period.start_price, period.end_price, period.end_price, period.start_price],
          fill: 'toself',
          fillcolor: 'rgba(251, 191, 36, 0.2)', // Golden momentum highlight
          line: { color: 'transparent' },
          name: 'Momentum Period',
          showlegend: false,
          hovertemplate: `<b>Momentum Period</b><br>Start: %{x}<br>Price: $%{y:.2f}<extra></extra>`,
          yaxis: 'y'
        })

        // Momentum start marker
        traces.push({
          type: 'scatter',
          mode: 'markers+text',
          x: [period.start_date],
          y: [period.start_price],
          marker: {
            color: '#f59e0b',
            size: 10,
            symbol: 'triangle-up',
            line: { color: '#ffffff', width: 2 }
          },
          text: ['📈'],
          textposition: 'top center',
          name: 'Momentum Detected',
          showlegend: false,
          hovertemplate: `<b>Momentum Detected</b><br>Date: %{x}<br>Price: $%{y:.2f}<extra></extra>`,
          yaxis: 'y'
        })
      }
    })

    // CONSOLIDATION PERIOD HIGHLIGHTS
    visibleMomentumPeriods.forEach((period, index) => {
      if (period.type === 'consolidation') {
        // Consolidation background fill
        traces.push({
          type: 'scatter',
          mode: 'none',
          x: [period.start_date, period.end_date, period.end_date, period.start_date, period.start_date],
          y: [period.start_price, period.start_price, period.end_price, period.end_price, period.start_price],
          fill: 'toself',
          fillcolor: 'rgba(139, 69, 19, 0.15)', // Brown consolidation highlight
          line: { color: 'transparent' },
          name: 'Consolidation Period',
          showlegend: false,
          hovertemplate: `<b>Consolidation Period</b><br>Start: %{x}<br>Price: $%{y:.2f}<extra></extra>`,
          yaxis: 'y'
        })

        // Consolidation marker
        traces.push({
          type: 'scatter',
          mode: 'markers+text',
          x: [period.start_date],
          y: [period.start_price],
          marker: {
            color: '#8b4513',
            size: 8,
            symbol: 'square',
            line: { color: '#ffffff', width: 1 }
          },
          text: ['📊'],
          textposition: 'top center',
          name: 'Consolidation',
          showlegend: false,
          hovertemplate: `<b>Consolidation</b><br>Date: %{x}<br>Price: $%{y:.2f}<extra></extra>`,
          yaxis: 'y'
        })
      }
    })

    // BUY/SELL SIGNAL MARKERS
    const visibleTrades = trades.filter(trade => {
      const entryTime = new Date(trade.entry_date).getTime()
      const exitTime = trade.exit_date ? new Date(trade.exit_date).getTime() : entryTime
      const windowStart = new Date(visibleData[0]?.date || '').getTime()
      const windowEnd = new Date(visibleData[visibleData.length - 1]?.date || '').getTime()
      
      return (entryTime >= windowStart && entryTime <= windowEnd) || 
             (exitTime >= windowStart && exitTime <= windowEnd)
    })

    // BUY SIGNALS
    const buySignals = visibleTrades.filter(trade => trade.status === 'open' || trade.entry_date)
    if (buySignals.length > 0) {
      traces.push({
        type: 'scatter',
        mode: 'markers+text',
        x: buySignals.map(trade => trade.entry_date),
        y: buySignals.map(trade => trade.entry_price),
        marker: {
          color: '#10b981', // Green for buy
          size: 12,
          symbol: 'triangle-up',
          line: { color: '#ffffff', width: 2 }
        },
        text: buySignals.map(() => 'BUY'),
        textposition: 'bottom center',
        textfont: { color: '#10b981', size: 10, family: 'monospace' },
        name: 'Buy Signals',
        showlegend: false,
        hovertemplate: `<b>BUY Signal</b><br>Date: %{x}<br>Price: $%{y:.2f}<extra></extra>`,
        yaxis: 'y'
      })
    }

    // SELL SIGNALS
    const sellSignals = visibleTrades.filter(trade => trade.status === 'closed' && trade.exit_date)
    if (sellSignals.length > 0) {
      traces.push({
        type: 'scatter',
        mode: 'markers+text',
        x: sellSignals.map(trade => trade.exit_date!),
        y: sellSignals.map(trade => trade.exit_price!),
        marker: {
          color: '#ef4444', // Red for sell
          size: 12,
          symbol: 'triangle-down',
          line: { color: '#ffffff', width: 2 }
        },
        text: sellSignals.map(() => 'SELL'),
        textposition: 'top center',
        textfont: { color: '#ef4444', size: 10, family: 'monospace' },
        name: 'Sell Signals',
        showlegend: false,
        hovertemplate: `<b>SELL Signal</b><br>Date: %{x}<br>Price: $%{y:.2f}<br>P&L: $%{customdata:.2f}<extra></extra>`,
        customdata: sellSignals.map(trade => trade.pnl),
        yaxis: 'y'
      })
    }

    return traces
  }, [visibleData, ticker, momentumPeriods, stablePriceRange])

  // Optimized layout with stable ranges
  const layout = useMemo(() => ({
    title: {
      text: `${ticker} - Live Smooth Backtest ${isStreaming ? '📊' : ''}`,
      font: { color: 'white', size: 18 }
    },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(17, 24, 39, 0.95)',
    font: { color: 'white' },
    showlegend: false,
    xaxis: {
      title: 'Date',
      gridcolor: 'rgba(255,255,255,0.1)',
      color: 'white',
      rangeslider: { visible: false },
      type: 'date',
      fixedrange: true // Prevent user zooming to maintain smooth scrolling
    },
    yaxis: {
      title: 'Price ($)',
      gridcolor: 'rgba(255,255,255,0.1)',
      color: 'white',
      domain: [0.3, 1],
      range: stablePriceRange, // Stable range prevents Y-axis jumping
      autorange: false,
      fixedrange: true
    },
    yaxis2: {
      title: 'Volume',
      gridcolor: 'rgba(255,255,255,0.1)',
      color: 'white',
      domain: [0, 0.25],
      side: 'right',
      range: stableVolumeRange, // Stable volume range
      autorange: false,
      fixedrange: true
    },
    margin: { l: 50, r: 50, t: 50, b: 50 },
    height: 650,
    // GPU-optimized transitions
    transition: {
      duration: 100,
      easing: 'cubic-in-out'
    }
  }), [ticker, isStreaming, stablePriceRange, stableVolumeRange])

  const config = {
    responsive: true,
    displayModeBar: false, // Clean experience
    displaylogo: false,
    scrollZoom: false, // Maintain our smooth scrolling
    doubleClick: false, // Disable zoom
    staticPlot: false, // Allow hover
    editable: false
  }

  return (
    <div className="w-full space-y-4">
      {/* Enhanced Controls Header */}
      <div className="flex items-center justify-between bg-card/30 rounded-xl p-4">
        <div className="flex items-center gap-4">
          <h3 className="text-xl font-semibold text-white flex items-center gap-2">
            <span>🚀 Ultra-Smooth Live Backtest</span>
            {isStreaming && <span className="text-green-400 animate-pulse">● LIVE</span>}
            {isPlaying && !isStreaming && <span className="text-blue-400 animate-pulse">▶ READY</span>}
          </h3>
          <div className="text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <span>📊 {visibleData.length} visible</span>
              <span>|</span>
              <span>📈 Status: {isStreaming ? 
                `STREAMING (${priceData.length} candles)` : 
                priceData.length > 0 ? 
                  `LOADED (${priceData.length} candles)` : 
                  'WAITING FOR DATA'
              }</span>
              {priceData.length > 0 && (
                <>
                  <span>|</span>
                  <span>💹 {priceData.length} candles</span>
                </>
              )}
            </span>
          </div>
        </div>
        
        {/* STATUS ONLY - No manual controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-card/50 rounded-lg p-2">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-sm text-green-400">AUTO-STREAMING</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Buffer: {windowSize} candles</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Mode: TradingView-Like</span>
          </div>
        </div>
      </div>

      {/* Real-time Statistics */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-card/30 rounded-lg p-4">
          <h4 className="text-sm font-medium text-muted-foreground mb-1">Live Candles</h4>
          <p className="text-2xl font-bold text-green-400">{priceData.length}</p>
        </div>
        
        <div className="bg-card/30 rounded-lg p-4">
          <h4 className="text-sm font-medium text-muted-foreground mb-1">Window Size</h4>
          <p className="text-2xl font-bold text-blue-400">{windowSize}</p>
        </div>
        
        <div className="bg-card/30 rounded-lg p-4">
          <h4 className="text-sm font-medium text-muted-foreground mb-1">Trades</h4>
          <p className="text-2xl font-bold text-purple-400">{trades.length}</p>
        </div>

        <div className="bg-card/30 rounded-lg p-4">
          <h4 className="text-sm font-medium text-muted-foreground mb-1">Status</h4>
          <p className="text-lg font-bold text-white">
            {isStreaming ? '🟢 LIVE' : priceData.length > 0 ? '🟡 READY' : '⚪ WAITING'}
          </p>
        </div>

        <div className="bg-card/30 rounded-lg p-4">
          <h4 className="text-sm font-medium text-muted-foreground mb-1">Current Price</h4>
          <p className="text-lg font-bold text-white">
            {priceData.length > 0 ? `$${priceData[priceData.length - 1].price.toFixed(2)}` : '$0.00'}
          </p>
        </div>
      </div>

      {/* Ultra-Smooth Chart with GPU Acceleration */}
      <div className="w-full bg-card/50 rounded-xl p-4 transition-all duration-300 ease-in-out">
        <div 
          className="opacity-100"
          style={{
            transform: `translateX(${smoothOffset * -0.8}px)`, // TRUE SLIDING WINDOW - GPU accelerated
            transition: isStreaming ? 'none' : 'transform 0.15s cubic-bezier(0.23, 1, 0.32, 1)', // TradingView-like easing
            willChange: 'transform', // GPU optimization hint
            transformOrigin: 'left center' // Smooth transform origin
          }}
        >
          <Plot
            ref={plotlyRef}
            data={plotData}
            layout={layout}
            config={config}
            style={{ 
              width: '100%', 
              height: '650px'
            }}
            useResizeHandler={true}
            className="chart-smooth-render"
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
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-green-400">
            {isStreaming ? '📡 Live Stream' : '⏸ Paused'}
          </span>
          <div className={`w-2 h-2 rounded-full ${isStreaming ? 'bg-green-400 animate-pulse' : 'bg-gray-400'}`}></div>
        </div>
      </div>
    </div>
  )
}