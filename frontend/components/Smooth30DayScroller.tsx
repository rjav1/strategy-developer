'use client'

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'

const Plot = dynamic(() => import('react-plotly.js'), { 
  ssr: false,
  loading: () => <div className="w-full h-[500px] bg-gray-900 rounded-lg border border-gray-700 flex items-center justify-center"><div className="text-gray-400">Loading chart...</div></div>
})
import { Play, Pause, RotateCcw, SkipForward, Settings, BarChart3, ZoomIn, ZoomOut, RotateCcw as ResetIcon, MousePointer } from 'lucide-react'

// Custom slider styles
const sliderStyles = `
  .slider::-webkit-slider-thumb {
    appearance: none;
    height: 20px;
    width: 20px;
    border-radius: 50%;
    background: #8b5cf6;
    cursor: pointer;
    border: 2px solid #ffffff;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }
  
  .slider::-moz-range-thumb {
    height: 20px;
    width: 20px;
    border-radius: 50%;
    background: #8b5cf6;
    cursor: pointer;
    border: 2px solid #ffffff;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }
  
  .slider::-webkit-slider-track {
    height: 8px;
    border-radius: 4px;
    background: transparent;
  }
  
  .slider::-moz-range-track {
    height: 8px;
    border-radius: 4px;
    background: transparent;
  }
`

interface Smooth30DayScrollerProps {
  priceData: any[]
  trades: any[]
  momentumPeriods: any[]
  ticker: string
  isLoading?: boolean
}

interface ViewportState {
  currentPosition: number
  driftSpeed: number
  isPlaying: boolean
  windowDays: number
}

const TRADE_COLORS = {
  BUY: '#10b981',
  SELL: '#ef4444'
}

const STATE_COLORS = {
  MOMENTUM: 'rgba(239, 68, 68, 0.3)',           // Backend uses "MOMENTUM"
  MOMENTUM_DETECTED: 'rgba(239, 68, 68, 0.3)',  // Keep for backward compatibility
  CONSOLIDATION: 'rgba(251, 191, 36, 0.3)',
  IN_POSITION: 'rgba(16, 185, 129, 0.3)',
  NOT_IN_TRADE: null
}

export default function Smooth30DayScroller({ 
  priceData, 
  trades, 
  momentumPeriods, 
  ticker,
  isLoading = false 
}: Smooth30DayScrollerProps) {
  
  // Debug: Log all incoming data with extensive details
  console.log('='.repeat(80))
  console.log('📊 EXTENSIVE DEBUG - Component received data:')
  console.log('📊 Price Data Length:', priceData?.length || 0)
  console.log('📊 Trades Length:', trades?.length || 0)
  console.log('📊 Momentum Periods Length:', momentumPeriods?.length || 0)
  console.log('📊 Ticker:', ticker)
  
  // Log complete data structures
  console.log('📊 FULL TRADES DATA:')
  if (trades && trades.length > 0) {
    trades.forEach((trade, index) => {
      console.log(`  Trade ${index}:`, JSON.stringify(trade, null, 2))
    })
  } else {
    console.log('  No trades data or empty array')
  }
  
  console.log('📊 FULL MOMENTUM PERIODS DATA:')
  if (momentumPeriods && momentumPeriods.length > 0) {
    momentumPeriods.forEach((period, index) => {
      console.log(`  Period ${index}:`, JSON.stringify(period, null, 2))
    })
  } else {
    console.log('  No momentum periods data or empty array')
  }
  
  console.log('📊 SAMPLE PRICE DATA (first 3):')
  if (priceData && priceData.length > 0) {
    priceData.slice(0, 3).forEach((price, index) => {
      console.log(`  Price ${index}:`, JSON.stringify(price, null, 2))
    })
  } else {
    console.log('  No price data or empty array')
  }
  console.log('='.repeat(80))
  
  // Fixed 30-day window with smooth animation
  const [windowDays] = useState(30) // Fixed 30 days as requested
  const [driftSpeed, setDriftSpeed] = useState(1.0) // days per second
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentPosition, setCurrentPosition] = useState(0) // Position in milliseconds from start
  const [showPlotlyView, setShowPlotlyView] = useState(false)
  
  // Zoom state
  const [zoomLevel, setZoomLevel] = useState(1.0) // 1.0 = normal, 2.0 = 2x zoom, 0.5 = 0.5x zoom
  const [zoomMode, setZoomMode] = useState<'auto' | 'manual'>('auto') // auto = follow timeline, manual = free zoom
  const [zoomLocked, setZoomLocked] = useState(false) // true = zoom stays when timeline changes, false = zoom resets
  const [lockedZoomLevel, setLockedZoomLevel] = useState(1.0) // Store zoom level when locked
  
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
  
  // Get visible data slice based on time window and zoom level
  const visibleData = useMemo(() => {
    if (!priceData.length) return []
    
    // Calculate the effective window size based on zoom level
    const effectiveWindowDays = zoomMode === 'manual' && zoomLevel < 1.0 
      ? windowDays / zoomLevel 
      : windowDays
    
    // Calculate the center of the current window
    const windowCenter = windowBounds.windowStart + (windowBounds.windowEnd - windowBounds.windowStart) / 2
    
    // Calculate the expanded window bounds
    const expandedWindowStart = windowCenter - (effectiveWindowDays * 24 * 60 * 60 * 1000) / 2
    const expandedWindowEnd = windowCenter + (effectiveWindowDays * 24 * 60 * 60 * 1000) / 2
    
    return priceData.filter(candle => {
      const candleTime = new Date(candle.date).getTime()
      return candleTime >= expandedWindowStart && candleTime <= expandedWindowEnd
    })
  }, [priceData, windowBounds, zoomMode, zoomLevel, windowDays])
  
  // Get visible trades (using same expanded window as visibleData)
  const visibleTrades = useMemo(() => {
    if (!trades.length) return []
    
    // Debug: Log all trades first
    console.log('🔍 All trades received:', trades.map(t => ({ date: t.date, action: t.action, price: t.price })))
    
    // Use the same expanded window calculation as visibleData
    const effectiveWindowDays = zoomMode === 'manual' && zoomLevel < 1.0 
      ? windowDays / zoomLevel 
      : windowDays
    
    const windowCenter = windowBounds.windowStart + (windowBounds.windowEnd - windowBounds.windowStart) / 2
    const expandedWindowStart = windowCenter - (effectiveWindowDays * 24 * 60 * 60 * 1000) / 2
    const expandedWindowEnd = windowCenter + (effectiveWindowDays * 24 * 60 * 60 * 1000) / 2
    
    console.log('📅 Window bounds:', {
      expandedWindowStart: new Date(expandedWindowStart).toISOString(),
      expandedWindowEnd: new Date(expandedWindowEnd).toISOString(),
      effectiveWindowDays
    })
    
    const filtered = trades.filter(trade => {
      // Handle different trade data formats
      let tradeDates = []
      
      if (trade.entry_date && trade.exit_date) {
        // New format: Enhanced backtester with entry/exit dates
        const entryDate = new Date(trade.entry_date)
        const exitDate = new Date(trade.exit_date)
        
        if (!isNaN(entryDate.getTime())) tradeDates.push(entryDate)
        if (!isNaN(exitDate.getTime())) tradeDates.push(exitDate)
      } else if (trade.date) {
        // Old format: Single date field
        const tradeDate = new Date(trade.date)
        if (!isNaN(tradeDate.getTime())) tradeDates.push(tradeDate)
      }
      
      if (tradeDates.length === 0) {
        console.error(`❌ No valid date found in trade:`, trade)
        return false
      }
      
      // Check if any trade date is within the visible window
      const isVisible = tradeDates.some(tradeDate => {
        const tradeTime = tradeDate.getTime()
        return tradeTime >= expandedWindowStart && tradeTime <= expandedWindowEnd
      })
      
      // Debug: Log each trade and whether it's visible
      console.log(`🔍 Trade with dates ${tradeDates.map(d => d.toISOString().split('T')[0]).join(', ')}:`, {
        tradeDates: tradeDates.map(d => d.toISOString()),
        isVisible,
        windowStart: new Date(expandedWindowStart).toISOString(),
        windowEnd: new Date(expandedWindowEnd).toISOString()
      })
      
      return isVisible
    })
    
    // Debug logging
    if (filtered.length > 0) {
      console.log('💰 Visible trades:', filtered.map(t => ({ date: t.date, action: t.action, price: t.price })))
    } else {
      console.log('❌ No trades visible in current window')
    }
    
    return filtered
  }, [trades, windowBounds, zoomMode, zoomLevel, windowDays])
  
  // Get visible momentum periods with overlap resolution and trade-based IN_POSITION periods
  const visibleMomentumPeriods = useMemo(() => {
    if (!momentumPeriods.length) return []
    
    // Use the same expanded window calculation as visibleData
    const effectiveWindowDays = zoomMode === 'manual' && zoomLevel < 1.0 
      ? windowDays / zoomLevel 
      : windowDays
    
    const windowCenter = windowBounds.windowStart + (windowBounds.windowEnd - windowBounds.windowStart) / 2
    const expandedWindowStart = windowCenter - (effectiveWindowDays * 24 * 60 * 60 * 1000) / 2
    const expandedWindowEnd = windowCenter + (effectiveWindowDays * 24 * 60 * 60 * 1000) / 2
    
    // First, normalize all periods and filter by window
    const normalizedPeriods = momentumPeriods
      .map((period: any) => {
        let startDate: Date, endDate: Date, state: string
        
        if (period.start_date && period.end_date) {
          startDate = new Date(period.start_date)
          endDate = new Date(period.end_date)
          state = period.type === 'momentum' ? 'MOMENTUM' : period.type.toUpperCase()
        } else if (period.date && period.state) {
          startDate = new Date(period.date)
          endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000)
          state = period.state
        } else {
          return null
        }
        
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          return null
        }
        
        return {
          startTime: startDate.getTime(),
          endTime: endDate.getTime(),
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
          state: state
        }
      })
      .filter((period: any) => period && 
        period.startTime <= expandedWindowEnd && 
        period.endTime >= expandedWindowStart
      )
      .sort((a: any, b: any) => a.startTime - b.startTime)
    
    // Extend consolidation periods to include BUY candles and add IN_POSITION periods
    visibleTrades.forEach((trade: any) => {
      if (trade.entry_date && trade.exit_date) {
        const entryTime = new Date(trade.entry_date).getTime()
        const exitTime = new Date(trade.exit_date).getTime()
        
        // Find any consolidation period that ends close to this entry date
        const consolidationPeriods = normalizedPeriods.filter((p: any) => p && p.state === 'CONSOLIDATION')
        consolidationPeriods.forEach((consol: any) => {
          const dayBefore = entryTime - (24 * 60 * 60 * 1000)
          const dayOf = entryTime
          
          // If consolidation ends the day before or day of entry, extend it to include the BUY candle
          if (consol.endTime >= dayBefore && consol.endTime <= dayOf) {
            console.log(`🔧 Extending consolidation from ${consol.endDate} to include BUY on ${new Date(entryTime).toISOString().split('T')[0]}`)
            consol.endTime = entryTime
            consol.endDate = new Date(entryTime).toISOString().split('T')[0]
          }
        })
        
        // Add IN_POSITION period from entry to exit
        normalizedPeriods.push({
          startTime: entryTime,
          endTime: exitTime,
          startDate: new Date(entryTime).toISOString().split('T')[0],
          endDate: new Date(exitTime).toISOString().split('T')[0],
          state: 'IN_POSITION'
        })
      }
    })
    
    // Re-sort after adding trade periods
    normalizedPeriods.sort((a: any, b: any) => a.startTime - b.startTime)
    
    if (normalizedPeriods.length === 0) {
      console.log('❌ No momentum periods visible in current window')
      return []
    }
    
    // Resolve overlaps by creating non-overlapping segments
    // Priority: IN_POSITION > CONSOLIDATION > MOMENTUM > NOT_IN_TRADE (IN_POSITION now has highest priority)
    const statePriority: { [key: string]: number } = { 'IN_POSITION': 4, 'CONSOLIDATION': 3, 'MOMENTUM': 2, 'NOT_IN_TRADE': 0 }
    
    // Create timeline events
    const events: any[] = []
    normalizedPeriods.forEach((period: any) => {
      if (period) {
        events.push({ time: period.startTime, type: 'start', state: period.state })
        events.push({ time: period.endTime, type: 'end', state: period.state })
      }
    })
    events.sort((a: any, b: any) => a.time - b.time || (a.type === 'end' ? -1 : 1)) // End events before start events at same time
    
    // Process events to create non-overlapping segments without gaps
    const segments: any[] = []
    let activeStates = new Set<string>()
    let lastTime: number | null = null
    
    events.forEach((event: any, index: number) => {
      // Add segment for the gap if we have active states
      if (lastTime !== null && lastTime < event.time && activeStates.size > 0) {
        const highestPriorityState = Array.from(activeStates)
          .sort((a: string, b: string) => (statePriority[b] || 0) - (statePriority[a] || 0))[0]
        
        segments.push({
          start_date: new Date(lastTime).toISOString().split('T')[0],
          end_date: new Date(event.time).toISOString().split('T')[0],
          state: highestPriorityState,
          type: highestPriorityState.toLowerCase()
        })
      }
      
      // Update active states
      if (event.type === 'start') {
        activeStates.add(event.state)
      } else {
        activeStates.delete(event.state)
      }
      
      lastTime = event.time
    })
    
    // Fill any gaps between segments with the previous state
    for (let i = 0; i < segments.length - 1; i++) {
      const currentSegment = segments[i]
      const nextSegment = segments[i + 1]
      
      const currentEndTime = new Date(currentSegment.end_date).getTime()
      const nextStartTime = new Date(nextSegment.start_date).getTime()
      
      // If there's a gap, fill it with a continuation of the current state
      if (currentEndTime < nextStartTime) {
        console.log(`🔧 Filling gap from ${currentSegment.end_date} to ${nextSegment.start_date} with ${currentSegment.state}`)
        
        // Extend the current segment to fill the gap
        currentSegment.end_date = nextSegment.start_date
      }
    }
    
    console.log('🎨 Resolved momentum periods with IN_POSITION priority:', segments)
    return segments
  }, [momentumPeriods, visibleTrades, windowBounds, zoomMode, zoomLevel, windowDays])
  
  // Save viewport state when it changes
  useEffect(() => {
    if (ticker) {
      const state: ViewportState = {
        currentPosition,
        driftSpeed,
        isPlaying,
        windowDays
      }
      viewportStateRef.current.set(ticker, state)
    }
  }, [ticker, windowDays, driftSpeed, isPlaying, currentPosition])
  
  // Restore viewport state when ticker changes
  useEffect(() => {
    if (ticker && viewportStateRef.current.has(ticker)) {
      const savedState = viewportStateRef.current.get(ticker)!
      setDriftSpeed(savedState.driftSpeed)
      setIsPlaying(savedState.isPlaying)
      setCurrentPosition(savedState.currentPosition)
    } else {
      // Reset to beginning for new ticker
      setCurrentPosition(0)
      setIsPlaying(false)
    }
  }, [ticker])
  
  // Ultra-smooth animation loop using requestAnimationFrame (60-90 FPS)
  const animate = useCallback((currentTime: number) => {
    if (!isPlaying) return
    
    const deltaTime = currentTime - lastFrameTimeRef.current
    lastFrameTimeRef.current = currentTime
    
    // Calculate drift amount based on speed and frame time (frame-rate independent)
    const driftMs = (driftSpeed * 24 * 60 * 60 * 1000) * (deltaTime / 1000) // Convert days per second to ms per frame
    
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
    
    // Continue animation at 60-90 FPS
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

  // Timeline slider functions
  const handleTimelineChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value)
    const maxPosition = Math.max(0, dataBounds.duration - (windowDays * 24 * 60 * 60 * 1000))
    const newPosition = (value / 100) * maxPosition
    setCurrentPosition(newPosition)
    setIsPlaying(false) // Stop playing when manually adjusting
  }, [dataBounds.duration, windowDays])

  // Handle timeline input for immediate feedback
  const handleTimelineInput = useCallback((e: React.FormEvent<HTMLInputElement>) => {
    const value = parseFloat((e.target as HTMLInputElement).value)
    const maxPosition = Math.max(0, dataBounds.duration - (windowDays * 24 * 60 * 60 * 1000))
    const newPosition = (value / 100) * maxPosition
    setCurrentPosition(newPosition)
  }, [dataBounds.duration, windowDays])

  // Zoom control functions
  const handleZoomIn = useCallback(() => {
    const newZoom = Math.min(zoomLevel * 1.5, 5.0) // Max 5x zoom
    setZoomLevel(newZoom)
    if (zoomLocked) {
      setLockedZoomLevel(newZoom)
    }
  }, [zoomLevel, zoomLocked])

  const handleZoomOut = useCallback(() => {
    const newZoom = Math.max(zoomLevel / 1.5, 0.2) // Min 0.2x zoom
    setZoomLevel(newZoom)
    if (zoomLocked) {
      setLockedZoomLevel(newZoom)
    }
  }, [zoomLevel, zoomLocked])

  const handleResetZoom = useCallback(() => {
    setZoomLevel(1.0)
    if (zoomLocked) {
      setLockedZoomLevel(1.0)
    }
  }, [zoomLocked])

  const handleToggleZoomMode = useCallback(() => {
    setZoomMode(prev => prev === 'auto' ? 'manual' : 'auto')
  }, [])

  const handleToggleZoomLock = useCallback(() => {
    if (zoomLocked) {
      // Unlocking - keep current zoom level
      setZoomLocked(false)
    } else {
      // Locking - store current zoom level
      setZoomLocked(true)
      setLockedZoomLevel(zoomLevel)
    }
  }, [zoomLocked, zoomLevel])

  // Handle mouse wheel zoom
  const handleChartWheel = useCallback((event: React.WheelEvent) => {
    if (zoomMode === 'manual') {
      event.preventDefault()
      if (event.deltaY < 0) {
        handleZoomIn()
      } else {
        handleZoomOut()
      }
    }
  }, [zoomMode, handleZoomIn, handleZoomOut])

  // Effect to handle zoom changes when timeline changes
  useEffect(() => {
    if (zoomMode === 'manual') {
      if (zoomLocked) {
        // When locked, maintain the locked zoom level
        setZoomLevel(lockedZoomLevel)
      } else {
        // When unlocked, reset zoom when timeline changes
        setZoomLevel(1.0)
      }
    }
  }, [currentPosition, zoomLocked, zoomMode, lockedZoomLevel])

  // Calculate timeline slider value (0-100)
  const timelineValue = useMemo(() => {
    if (dataBounds.duration === 0) return 0
    const maxPosition = Math.max(0, dataBounds.duration - (windowDays * 24 * 60 * 60 * 1000))
    return (currentPosition / maxPosition) * 100
  }, [currentPosition, dataBounds.duration, windowDays])

  // Format date range for display
  const formatDateRange = useCallback((startDate: Date, endDate: Date) => {
    const formatDate = (date: Date) => {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: 'numeric'
      })
    }
    return `${formatDate(startDate)} → ${formatDate(endDate)}`
  }, [])
  
  // Generate plot data for current viewport
  const plotData = useMemo(() => {
    if (!visibleData.length) return []
    
    // Calculate price and volume ranges for auto-zoom
    const prices = visibleData.flatMap(d => [d.high, d.low])
    const volumes = visibleData.map(d => d.volume)
    
    const priceMin = Math.min(...prices)
    const priceMax = Math.max(...prices)
    const volumeMax = Math.max(...volumes)
    
    const priceRange = priceMax - priceMin
    const pricePadding = priceRange * 0.1
    
    const data = []
    
    // Candlestick chart
    data.push({
      type: 'candlestick',
      x: visibleData.map(d => d.date),
      open: visibleData.map(d => d.open),
      high: visibleData.map(d => d.high),
      low: visibleData.map(d => d.low),
      close: visibleData.map(d => d.close),
      name: 'Price',
      xaxis: 'x',
      yaxis: 'y',
      increasing: { line: { color: '#10b981' } },
      decreasing: { line: { color: '#ef4444' } },
      showlegend: false
    })
    
    // Volume bars
    data.push({
      type: 'bar',
      x: visibleData.map(d => d.date),
      y: visibleData.map(d => d.volume),
      name: 'Volume',
      xaxis: 'x2',
      yaxis: 'y2',
      marker: { color: 'rgba(100, 150, 255, 0.3)' },
      showlegend: false
    })
    
    // Add trade markers with enhanced visibility
    console.log('🎯 TRADE RENDERING DEBUG:')
    console.log('🎯 visibleTrades array:', JSON.stringify(visibleTrades, null, 2))
    console.log('🎯 Rendering trade markers for:', visibleTrades.length, 'trades')
    
    visibleTrades.forEach(trade => {
      console.log('🎯 Processing individual trade:', JSON.stringify(trade, null, 2))
      
      // Handle different trade data formats from backend
      let tradeDate, tradeAction, tradePrice, tradeShares, tradePnl
      
      if (trade.entry_date && trade.entry_price && trade.exit_date && trade.exit_price) {
        // New format: Enhanced backtester trade format
        // We need to create separate BUY and SELL markers
        const buyDate = new Date(trade.entry_date)
        const sellDate = new Date(trade.exit_date)
        
        if (!isNaN(buyDate.getTime())) {
          console.log('🎯 Adding BUY marker:', { date: trade.entry_date, price: trade.entry_price })
          data.push({
            type: 'scatter',
            x: [trade.entry_date],
            y: [trade.entry_price],
            mode: 'markers+text',
            marker: {
              color: TRADE_COLORS.BUY,
              size: 12,
              symbol: 'circle',
              line: { color: 'white', width: 2 }
            },
            text: ['BUY'],
            textposition: 'bottom center',
            textfont: { color: 'white', size: 10, family: 'Arial Black' },
            name: `BUY ${trade.shares || 0} shares`,
            xaxis: 'x',
            yaxis: 'y',
            showlegend: false,
            hovertemplate: `<b>BUY</b><br>Price: $%{y:.2f}<br>Shares: ${trade.shares || 0}<br>Date: %{x}<extra></extra>`
          })
        }
        
        if (!isNaN(sellDate.getTime())) {
          console.log('🎯 Adding SELL marker:', { date: trade.exit_date, price: trade.exit_price })
          data.push({
            type: 'scatter',
            x: [trade.exit_date],
            y: [trade.exit_price],
            mode: 'markers+text',
            marker: {
              color: TRADE_COLORS.SELL,
              size: 12,
              symbol: 'circle',
              line: { color: 'white', width: 2 }
            },
            text: ['SELL'],
            textposition: 'top center',
            textfont: { color: 'white', size: 10, family: 'Arial Black' },
            name: `SELL ${trade.shares || 0} shares`,
            xaxis: 'x',
            yaxis: 'y',
            showlegend: false,
            hovertemplate: `<b>SELL</b><br>Price: $%{y:.2f}<br>Shares: ${trade.shares || 0}<br>P&L: ${trade.pnl ? '$' + trade.pnl.toFixed(2) : 'N/A'}<br>Date: %{x}<extra></extra>`
          })
        }
        return
      } else if (trade.date && trade.action && trade.price !== undefined) {
        // Old format: Direct action/price format
        tradeDate = new Date(trade.date)
        tradeAction = trade.action
        tradePrice = trade.price
        tradeShares = trade.shares || 0
        tradePnl = trade.pnl
      } else {
        console.error('❌ Invalid trade data format:', trade)
        return
      }
      
      // Validate date for old format
      if (isNaN(tradeDate.getTime())) {
        console.error(`❌ Invalid trade date: ${trade.date} for trade:`, trade)
        return
      }
      
      console.log('🎯 Adding trade marker:', { date: trade.date, action: tradeAction, price: tradePrice })
      data.push({
        type: 'scatter',
        x: [trade.date],
        y: [tradePrice],
        mode: 'markers+text',
        marker: {
          color: TRADE_COLORS[tradeAction as keyof typeof TRADE_COLORS],
          size: 12,
          symbol: 'circle',
          line: { color: 'white', width: 2 }
        },
        text: [tradeAction],
        textposition: tradeAction === 'BUY' ? 'bottom center' : 'top center',
        textfont: { color: 'white', size: 10, family: 'Arial Black' },
        name: `${tradeAction} ${tradeShares} shares`,
        xaxis: 'x',
        yaxis: 'y',
        showlegend: false,
        hovertemplate: `<b>${tradeAction}</b><br>Price: $%{y:.2f}<br>Shares: ${tradeShares}<br>P&L: ${tradePnl ? '$' + tradePnl.toFixed(2) : 'N/A'}<br>Date: %{x}<extra></extra>`
      })
    })
    
    // Add momentum period backgrounds with better highlighting
    console.log('🎨 MOMENTUM PERIOD RENDERING DEBUG:')
    console.log('🎨 visibleMomentumPeriods array:', JSON.stringify(visibleMomentumPeriods, null, 2))
    console.log('🎨 Rendering momentum periods for:', visibleMomentumPeriods.length, 'periods')
    console.log('🎨 Available states:', Object.keys(STATE_COLORS))
    
    visibleMomentumPeriods.forEach((period, index) => {
      console.log('🎨 Processing individual period:', JSON.stringify(period, null, 2))
      
      // Handle different data formats from backend
      let periodDate, periodState, periodEndDate
      
      if (period.start_date && period.end_date && period.type) {
        // New format: HighlightPeriod from enhanced backtester
        periodDate = new Date(period.start_date)
        periodEndDate = new Date(period.end_date)
        periodState = period.type === 'momentum' ? 'MOMENTUM' : period.type.toUpperCase()
        console.log('🎨 Using new format:', { date: period.start_date, state: periodState, endDate: period.end_date })
      } else if (period.date && period.state) {
        // Old format: Direct state mapping
        periodDate = new Date(period.date)
        periodState = period.state
        periodEndDate = index < visibleMomentumPeriods.length - 1 
          ? new Date(visibleMomentumPeriods[index + 1].date)
          : new Date(periodDate.getTime() + 24 * 60 * 60 * 1000)
        console.log('🎨 Using old format:', { date: period.date, state: period.state })
      } else {
        console.error('❌ Invalid momentum period data format:', period)
        return
      }
      
      // Validate date
      if (isNaN(periodDate.getTime())) {
        console.error(`❌ Invalid momentum period date: ${period.start_date || period.date} for period:`, period)
        return
      }
      
      const color = STATE_COLORS[periodState as keyof typeof STATE_COLORS]
      console.log('🎨 Period color lookup:', { state: periodState, color: color })
      
      if (color) {
        // Validate end date
        if (isNaN(periodEndDate.getTime())) {
          console.error(`❌ Invalid end date for period:`, period)
          return
        }
        
        // Calculate the full price range for better coverage
        const fullPriceRange = priceMax - priceMin
        const extendedPadding = fullPriceRange * 0.15 // 15% padding for better visibility
        
        console.log('🎨 Adding momentum background:', {
          startDate: periodDate.toISOString().split('T')[0],
          endDate: periodEndDate.toISOString().split('T')[0],
          state: periodState,
          color: color
        })
        
        data.push({
          type: 'scatter',
          x: [periodDate.toISOString().split('T')[0], periodEndDate.toISOString().split('T')[0], periodEndDate.toISOString().split('T')[0], periodDate.toISOString().split('T')[0], periodDate.toISOString().split('T')[0]],
          y: [priceMin - extendedPadding, priceMin - extendedPadding, priceMax + extendedPadding, priceMax + extendedPadding, priceMin - extendedPadding],
          mode: 'lines',
          fill: 'toself',
          fillcolor: color,
          line: { color: 'transparent' },
          showlegend: false,
          hovertemplate: `<b>${periodState}</b><br>Date: %{x}<extra></extra>`,
          xaxis: 'x',
          yaxis: 'y'
        })
      } else {
        console.warn('⚠️ No color found for state:', periodState)
      }
    })
    
    // Add moving averages if available in data
    if (visibleData.length > 0 && visibleData[0].sma10) {
      // SMA 10
      data.push({
        type: 'scatter',
        x: visibleData.map(d => d.date),
        y: visibleData.map(d => d.sma10),
        mode: 'lines',
        line: { color: '#3b82f6', width: 1 },
        name: 'SMA 10',
        xaxis: 'x',
        yaxis: 'y',
        showlegend: false,
        hovertemplate: 'SMA10: $%{y:.2f}<extra></extra>'
      })
      
      // SMA 20
      data.push({
        type: 'scatter',
        x: visibleData.map(d => d.date),
        y: visibleData.map(d => d.sma20),
        mode: 'lines',
        line: { color: '#f97316', width: 1 },
        name: 'SMA 20',
        xaxis: 'x',
        yaxis: 'y',
        showlegend: false,
        hovertemplate: 'SMA20: $%{y:.2f}<extra></extra>'
      })
      
      // SMA 50
      data.push({
        type: 'scatter',
        x: visibleData.map(d => d.date),
        y: visibleData.map(d => d.sma50),
        mode: 'lines',
        line: { color: '#ef4444', width: 1.5 },
        name: 'SMA 50',
        xaxis: 'x',
        yaxis: 'y',
        showlegend: false,
        hovertemplate: 'SMA50: $%{y:.2f}<extra></extra>'
      })
    }
    
    return data
  }, [visibleData, visibleTrades, visibleMomentumPeriods])
  
  // Calculate progress percentage
  const progress = useMemo(() => {
    if (dataBounds.duration === 0) return 0
    const maxPosition = Math.max(0, dataBounds.duration - (windowDays * 24 * 60 * 60 * 1000))
    return maxPosition > 0 ? (currentPosition / maxPosition) * 100 : 0
  }, [currentPosition, dataBounds.duration, windowDays])
  
  if (isLoading) {
    return (
      <div className="w-full h-[600px] bg-gray-900 rounded-lg border border-gray-700 flex items-center justify-center">
        <div className="text-gray-400">Loading chart data...</div>
      </div>
    )
  }
  
  if (!priceData.length) {
    return (
      <div className="w-full h-[600px] bg-gray-900 rounded-lg border border-gray-700 flex items-center justify-center">
        <div className="text-gray-400">No data available</div>
      </div>
    )
  }
  
  if (showPlotlyView) {
    // Plotly fallback view with region selection
    const allData = [{
      type: 'candlestick',
      x: priceData.map(d => d.date),
      open: priceData.map(d => d.open),
      high: priceData.map(d => d.high),
      low: priceData.map(d => d.low),
      close: priceData.map(d => d.close),
      name: 'Price',
      increasing: { line: { color: '#10b981' } },
      decreasing: { line: { color: '#ef4444' } }
    }]
    
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Plotly Interactive View</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPlotlyView(false)}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors text-sm"
            >
              <BarChart3 className="w-4 h-4 mr-2 inline" />
              Back to Smooth View
            </button>
          </div>
        </div>
        
        <div className="bg-gray-900 rounded-lg border border-gray-700 p-4">
          <Plot
            ref={plotlyRef}
            data={allData as any}
            layout={{
              title: `${ticker} - Full Dataset`,
              xaxis: { 
                title: 'Date',
                rangeslider: { visible: true },
                type: 'date'
              },
              yaxis: { title: 'Price ($)' },
              plot_bgcolor: 'rgba(17, 24, 39, 1)',
              paper_bgcolor: 'rgba(17, 24, 39, 1)',
              font: { color: 'white' },
              margin: { l: 60, r: 60, t: 60, b: 60 },
              height: 500
            }}
            config={{
              displayModeBar: true,
              displaylogo: false,
              modeBarButtonsToRemove: ['pan2d', 'lasso2d'],
              toImageButtonOptions: {
                format: 'png',
                filename: `${ticker}_chart`,
                height: 500,
                width: 1000,
                scale: 1
              }
            }}
            style={{ width: '100%', height: '500px' }}
            useResizeHandler={true}
          />
          <div className="mt-4 text-sm text-gray-400 text-center">
            Use the range selector below or drag to zoom. Double-click to reset zoom.
          </div>
        </div>
      </div>
    )
  }
  
  return (
    <div className="space-y-4">
      <style dangerouslySetInnerHTML={{ __html: sliderStyles }} />
      {/* Ultra-smooth 30-day scroller controls */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">30-Day Smooth Scroller</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPlotlyView(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm"
          >
            <Settings className="w-4 h-4 mr-2 inline" />
            Switch to Plotly View
          </button>
        </div>
      </div>
      
      <div className="bg-gray-900 rounded-lg border border-gray-700 p-4">
        {/* Animation Controls */}
        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={togglePlayPause}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              isPlaying 
                ? 'bg-orange-600 hover:bg-orange-700 text-white' 
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          
          <button
            onClick={resetToStart}
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
          
          <button
            onClick={jumpToEnd}
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
          >
            <SkipForward className="w-4 h-4" />
            Jump to End
          </button>
          
          <div className="flex items-center gap-2 ml-4">
            <label className="text-sm text-gray-300">Speed:</label>
            <input
              type="range"
              min="0.1"
              max="10.0"
              step="0.1"
              value={driftSpeed}
              onChange={(e) => setDriftSpeed(parseFloat(e.target.value))}
              className="w-24"
            />
            <span className="text-sm text-gray-300 w-16">{driftSpeed.toFixed(1)}x</span>
          </div>
          
          <div className="flex items-center gap-2 ml-4">
            <span className="text-sm text-gray-300">Progress:</span>
            <div className="w-32 bg-gray-700 rounded-full h-2">
              <div 
                className="bg-purple-600 h-2 rounded-full transition-all duration-100 ease-linear"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-sm text-gray-300 w-12">{Math.round(progress)}%</span>
          </div>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-300">Zoom:</span>
            <button
              onClick={handleZoomOut}
              className="flex items-center gap-1 px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors text-sm"
              title="Zoom Out"
            >
              <ZoomOut className="w-3 h-3" />
            </button>
            <span className="text-sm text-gray-300 min-w-[60px] text-center">
              {zoomLevel.toFixed(1)}x
            </span>
            <button
              onClick={handleZoomIn}
              className="flex items-center gap-1 px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors text-sm"
              title="Zoom In"
            >
              <ZoomIn className="w-3 h-3" />
            </button>
            <button
              onClick={handleResetZoom}
              className="flex items-center gap-1 px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors text-sm"
              title="Reset Zoom"
            >
              <ResetIcon className="w-3 h-3" />
            </button>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-300">Mode:</span>
            <button
              onClick={handleToggleZoomMode}
              className={`flex items-center gap-1 px-3 py-1 rounded-lg transition-colors text-sm ${
                zoomMode === 'manual' 
                  ? 'bg-purple-600 hover:bg-purple-700 text-white' 
                  : 'bg-gray-600 hover:bg-gray-700 text-white'
              }`}
              title={zoomMode === 'manual' ? 'Manual Zoom (Scroll to zoom)' : 'Auto Zoom (Follow timeline)'}
            >
              <MousePointer className="w-3 h-3" />
              {zoomMode === 'manual' ? 'Manual' : 'Auto'}
            </button>
          </div>
          
          {zoomMode === 'manual' && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-300">Lock:</span>
              <button
                onClick={handleToggleZoomLock}
                className={`flex items-center gap-1 px-3 py-1 rounded-lg transition-colors text-sm ${
                  zoomLocked 
                    ? 'bg-green-600 hover:bg-green-700 text-white' 
                    : 'bg-gray-600 hover:bg-gray-700 text-white'
                }`}
                title={zoomLocked ? 'Zoom Locked (Zoom stays when timeline changes)' : 'Zoom Unlocked (Zoom resets when timeline changes)'}
              >
                <div className={`w-3 h-3 ${zoomLocked ? 'bg-white' : 'border border-white'}`}></div>
                {zoomLocked ? 'Locked' : 'Unlocked'}
              </button>
            </div>
          )}
          
          {zoomMode === 'manual' && (
            <div className="text-xs text-yellow-400 bg-yellow-400/10 px-2 py-1 rounded">
              💡 Scroll on chart to zoom in/out
            </div>
          )}
        </div>

        {/* Timeline Slider for Manual Navigation */}
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-2 flex-1">
            <span className="text-sm text-gray-300 min-w-[60px]">Timeline:</span>
            <input
              type="range"
              min="0"
              max="100"
              step="0.1"
              value={timelineValue}
              onChange={handleTimelineChange}
              onInput={handleTimelineInput}
              className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
              style={{
                background: `linear-gradient(to right, #8b5cf6 0%, #8b5cf6 ${timelineValue}%, #374151 ${timelineValue}%, #374151 100%)`
              }}
            />
            <span className="text-sm text-gray-300 min-w-[80px]">
              {Math.round(timelineValue)}%
            </span>
          </div>
          <div className="text-sm text-gray-400 min-w-[200px]">
            {formatDateRange(windowBounds.startDate, windowBounds.endDate)}
          </div>
        </div>
        
        {/* Full Data Range Info */}
        {priceData.length > 0 && (
          <div className="text-xs text-gray-500 mb-2">
            Full dataset: {formatDateRange(new Date(priceData[0].date), new Date(priceData[priceData.length - 1].date))} 
            ({priceData.length} candles)
          </div>
        )}
        
        {/* Current time window display */}
        <div className="mb-4 text-sm text-gray-400">
          <span>Viewing: {windowBounds.startDate.toLocaleDateString()} - {windowBounds.endDate.toLocaleDateString()}</span>
          <span className="ml-4">Window: {windowDays} days</span>
          <span className="ml-4">Candles: {visibleData.length}</span>
        </div>
        
        {/* Legend */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-6 text-xs text-gray-400">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-red-500/30 border border-red-500/50"></div>
            <span>Momentum</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-yellow-500/30 border border-yellow-500/50"></div>
            <span>Consolidation</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-green-500/30 border border-green-500/50"></div>
            <span>In Position</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-b-[8px] border-l-transparent border-r-transparent border-b-green-500"></div>
            <span>Buy</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-red-500"></div>
            <span>Sell</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-0.5 bg-blue-500"></div>
            <span>SMA10</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-0.5 bg-orange-500"></div>
            <span>SMA20</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-0.5 bg-red-500"></div>
            <span>SMA50</span>
            </div>
          </div>
          
          {/* Zoom Status */}
          <div className="flex items-center gap-2 text-xs">
            <span className={`px-2 py-1 rounded ${
              zoomMode === 'manual' 
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' 
                : 'bg-gray-500/20 text-gray-300 border border-gray-500/30'
            }`}>
              {zoomMode === 'manual' ? 'Manual Zoom' : 'Auto Zoom'}
            </span>
            {zoomLevel !== 1.0 && (
              <span className="px-2 py-1 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                {zoomLevel.toFixed(1)}x
              </span>
            )}
            {zoomMode === 'manual' && zoomLocked && (
              <span className="px-2 py-1 rounded bg-green-500/20 text-green-300 border border-green-500/30">
                🔒 Locked
              </span>
            )}
          </div>
        </div>
        
        {/* Chart */}
        <div 
          className="w-full h-[500px]"
          onWheel={handleChartWheel}
          style={{ cursor: zoomMode === 'manual' ? 'crosshair' : 'default' }}
        >
          <Plot
            data={plotData as any}
            layout={{
              autosize: true,
              margin: { l: 60, r: 60, t: 20, b: 60 },
              plot_bgcolor: 'rgba(17, 24, 39, 1)',
              paper_bgcolor: 'rgba(17, 24, 39, 1)',
              font: { color: 'white' },
              grid: {
                rows: 2,
                columns: 1,
                pattern: 'independent',
                rowheight: [0.7, 0.3] // 70% for price chart, 30% for volume
              },
              xaxis: { 
                title: 'Date',
                type: 'date',
                fixedrange: zoomMode === 'auto', // Enable zoom/pan in manual mode
                showgrid: true,
                gridcolor: 'rgba(75, 85, 99, 0.3)',
                domain: [0, 1] // Full width
              },
              yaxis: { 
                title: 'Price ($)',
                side: 'left',
                fixedrange: zoomMode === 'auto', // Enable zoom/pan in manual mode
                showgrid: true,
                gridcolor: 'rgba(75, 85, 99, 0.3)',
                domain: [0.3, 1] // Top 70% of chart
              },
              xaxis2: {
                title: '',
                type: 'date',
                fixedrange: zoomMode === 'auto',
                showgrid: true,
                gridcolor: 'rgba(75, 85, 99, 0.3)',
                domain: [0, 1] // Full width
              },
              yaxis2: {
                title: 'Volume',
                side: 'left',
                fixedrange: zoomMode === 'auto', // Enable zoom/pan in manual mode
                showgrid: true,
                gridcolor: 'rgba(75, 85, 99, 0.3)',
                domain: [0, 0.25] // Bottom 25% of chart
              },
              showlegend: false,
              hovermode: 'closest'
            }}
            config={{
              displayModeBar: zoomMode === 'manual', // Show toolbar in manual mode
              staticPlot: false,
              doubleClick: zoomMode === 'manual', // Enable double-click reset in manual mode
              scrollZoom: zoomMode === 'manual', // Enable scroll zoom in manual mode
              editable: false,
              modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d'],
              toImageButtonOptions: {
                format: 'png',
                filename: `${ticker}_chart_${zoomLevel}x`,
                height: 500,
                width: 1000,
                scale: 1
              }
            }}
            style={{ width: '100%', height: '100%' }}
            useResizeHandler={true}
          />
        </div>
      </div>
    </div>
  )
}