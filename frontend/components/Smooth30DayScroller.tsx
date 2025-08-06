'use client'

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'

const Plot = dynamic(() => import('react-plotly.js'), { 
  ssr: false,
  loading: () => <div className="w-full h-[500px] bg-gray-900 rounded-lg border border-gray-700 flex items-center justify-center"><div className="text-gray-400">Loading chart...</div></div>
})
import { Play, Pause, RotateCcw, SkipForward, Settings, BarChart3 } from 'lucide-react'

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
  MOMENTUM_DETECTED: 'rgba(239, 68, 68, 0.3)',
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
  
  // Fixed 30-day window with smooth animation
  const [windowDays] = useState(30) // Fixed 30 days as requested
  const [driftSpeed, setDriftSpeed] = useState(1.0) // days per second
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentPosition, setCurrentPosition] = useState(0) // Position in milliseconds from start
  const [showPlotlyView, setShowPlotlyView] = useState(false)
  
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
    
    return priceData.filter(candle => {
      const candleTime = new Date(candle.date).getTime()
      return candleTime >= windowBounds.windowStart && candleTime <= windowBounds.windowEnd
    })
  }, [priceData, windowBounds])
  
  // Get visible trades
  const visibleTrades = useMemo(() => {
    if (!trades.length) return []
    
    return trades.filter(trade => {
      const tradeTime = new Date(trade.date).getTime()
      return tradeTime >= windowBounds.windowStart && tradeTime <= windowBounds.windowEnd
    })
  }, [trades, windowBounds])
  
  // Get visible momentum periods
  const visibleMomentumPeriods = useMemo(() => {
    if (!momentumPeriods.length) return []
    
    return momentumPeriods.filter(period => {
      const periodTime = new Date(period.date).getTime()
      return periodTime >= windowBounds.windowStart && periodTime <= windowBounds.windowEnd
    })
  }, [momentumPeriods, windowBounds])
  
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
      yaxis: 'y2',
      marker: { color: 'rgba(100, 150, 255, 0.3)' },
      showlegend: false
    })
    
    // Add trade markers with enhanced visibility
    visibleTrades.forEach(trade => {
      data.push({
        type: 'scatter',
        x: [trade.date],
        y: [trade.price],
        mode: 'markers+text',
        marker: {
          color: TRADE_COLORS[trade.action as keyof typeof TRADE_COLORS],
          size: 15,
          symbol: trade.action === 'BUY' ? 'triangle-up' : 'triangle-down',
          line: { color: 'white', width: 2 }
        },
        text: [trade.action],
        textposition: trade.action === 'BUY' ? 'bottom center' : 'top center',
        textfont: { color: 'white', size: 10, family: 'Arial Black' },
        name: `${trade.action} ${trade.shares} shares`,
        yaxis: 'y',
        showlegend: false,
        hovertemplate: `<b>${trade.action}</b><br>Price: $%{y:.2f}<br>Shares: ${trade.shares}<br>P&L: ${trade.pnl ? '$' + trade.pnl.toFixed(2) : 'N/A'}<br>Date: %{x}<extra></extra>`
      })
    })
    
    // Add momentum period backgrounds with better highlighting
    visibleMomentumPeriods.forEach((period, index) => {
      const color = STATE_COLORS[period.state as keyof typeof STATE_COLORS]
      if (color) {
        // Create rectangles for momentum/consolidation periods
        const periodDate = new Date(period.date)
        const nextPeriodDate = index < visibleMomentumPeriods.length - 1 
          ? new Date(visibleMomentumPeriods[index + 1].date)
          : new Date(periodDate.getTime() + 24 * 60 * 60 * 1000) // Add 1 day
        
        data.push({
          type: 'scatter',
          x: [period.date, nextPeriodDate.toISOString().split('T')[0], nextPeriodDate.toISOString().split('T')[0], period.date, period.date],
          y: [priceMin - pricePadding, priceMin - pricePadding, priceMax + pricePadding, priceMax + pricePadding, priceMin - pricePadding],
          mode: 'lines',
          fill: 'toself',
          fillcolor: color,
          line: { color: 'transparent' },
          showlegend: false,
          hovertemplate: `<b>${period.state}</b><br>Date: %{x}<extra></extra>`,
          yaxis: 'y'
        })
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
        
        {/* Current time window display */}
        <div className="mb-4 text-sm text-gray-400">
          <span>Viewing: {windowBounds.startDate.toLocaleDateString()} - {windowBounds.endDate.toLocaleDateString()}</span>
          <span className="ml-4">Window: {windowDays} days</span>
          <span className="ml-4">Candles: {visibleData.length}</span>
        </div>
        
        {/* Legend */}
        <div className="mb-4 flex items-center gap-6 text-xs text-gray-400">
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
        
        {/* Chart */}
        <div className="w-full h-[500px]">
          <Plot
            data={plotData as any}
            layout={{
              autosize: true,
              margin: { l: 60, r: 60, t: 20, b: 60 },
              plot_bgcolor: 'rgba(17, 24, 39, 1)',
              paper_bgcolor: 'rgba(17, 24, 39, 1)',
              font: { color: 'white' },
              xaxis: { 
                title: 'Date',
                type: 'date',
                fixedrange: true, // Disable zoom/pan for smooth experience
                showgrid: true,
                gridcolor: 'rgba(75, 85, 99, 0.3)'
              },
              yaxis: { 
                title: 'Price ($)',
                side: 'left',
                fixedrange: true, // Disable zoom/pan for smooth experience
                showgrid: true,
                gridcolor: 'rgba(75, 85, 99, 0.3)'
              },
              yaxis2: {
                title: 'Volume',
                side: 'right',
                overlaying: 'y',
                fixedrange: true, // Disable zoom/pan for smooth experience
                showgrid: false
              },
              showlegend: false,
              hovermode: 'closest'
            }}
            config={{
              displayModeBar: false, // Remove toolbar for cleaner experience
              staticPlot: false,
              doubleClick: false,
              scrollZoom: false,
              editable: false
            }}
            style={{ width: '100%', height: '100%' }}
            useResizeHandler={true}
          />
        </div>
      </div>
    </div>
  )
}