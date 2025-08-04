'use client'

import React from 'react'

interface CandlestickData {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  index: number
}

interface CandlestickChartProps {
  data: CandlestickData[]
  width: number
  height: number
  onCandleHover?: (data: CandlestickData | null) => void
}

export default function CandlestickChart({ data, width, height, onCandleHover }: CandlestickChartProps) {
  if (!data.length) return null

  // Calculate price range
  const prices = data.flatMap(d => [d.high, d.low])
  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)
  const priceRange = maxPrice - minPrice
  const padding = priceRange * 0.1 // 10% padding

  // Chart dimensions
  const chartPadding = { top: 20, right: 30, bottom: 40, left: 60 }
  const chartWidth = width - chartPadding.left - chartPadding.right
  const chartHeight = height - chartPadding.top - chartPadding.bottom

  // Calculate candle width - ensure minimum width for visibility
  const candleWidth = Math.max(3, Math.min(15, chartWidth / Math.max(1, data.length) * 0.7))
  
  // Helper functions
  const getY = (price: number) => {
    const normalizedPrice = (price - (minPrice - padding)) / (priceRange + 2 * padding)
    return chartHeight - (normalizedPrice * chartHeight)
  }

  const getX = (index: number) => {
    return (index / Math.max(1, data.length - 1)) * chartWidth
  }

  const formatPrice = (price: number) => `$${price.toFixed(2)}`

  return (
    <svg width={width} height={height} className="bg-transparent">
      {/* Grid lines */}
      <defs>
        <pattern id="grid" width="1" height="20" patternUnits="userSpaceOnUse">
          <path d="M 1 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1"/>
        </pattern>
      </defs>
      
      {/* Grid */}
      {[0, 0.25, 0.5, 0.75, 1].map(ratio => (
        <line
          key={ratio}
          x1={chartPadding.left}
          y1={chartPadding.top + ratio * chartHeight}
          x2={chartPadding.left + chartWidth}
          y2={chartPadding.top + ratio * chartHeight}
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="1"
          strokeDasharray="3,3"
        />
      ))}

      {/* Y-axis labels */}
      {[0, 0.25, 0.5, 0.75, 1].map(ratio => {
        const price = (minPrice - padding) + ratio * (priceRange + 2 * padding)
        return (
          <text
            key={ratio}
            x={chartPadding.left - 10}
            y={chartPadding.top + (1 - ratio) * chartHeight + 4}
            fill="#9ca3af"
            fontSize={11}
            fontFamily="Inter, system-ui, sans-serif"
            textAnchor="end"
          >
            {formatPrice(price)}
          </text>
        )
      })}

      {/* Candlesticks */}
      {data.map((candle, index) => {
        const x = chartPadding.left + getX(index)
        const openY = chartPadding.top + getY(candle.open)
        const closeY = chartPadding.top + getY(candle.close)
        const highY = chartPadding.top + getY(candle.high)
        const lowY = chartPadding.top + getY(candle.low)
        
        const isGreen = candle.close >= candle.open
        const color = isGreen ? '#10b981' : '#ef4444'
        const bodyHeight = Math.abs(closeY - openY)
        const bodyY = Math.min(openY, closeY)

        return (
          <g key={index}>
            {/* Wick */}
            <line
              x1={x}
              y1={highY}
              x2={x}
              y2={lowY}
              stroke={color}
              strokeWidth="1"
            />
            
            {/* Body */}
            <rect
              x={x - candleWidth / 2}
              y={bodyY}
              width={candleWidth}
              height={Math.max(1, bodyHeight)}
              fill={isGreen ? color : color}
              stroke={color}
              strokeWidth="1"
              className="cursor-pointer hover:opacity-80 transition-opacity"
              onMouseEnter={() => onCandleHover?.(candle)}
              onMouseLeave={() => onCandleHover?.(null)}
            />
          </g>
        )
      })}

      {/* X-axis labels */}
      {data.filter((_, i) => i % Math.max(1, Math.floor(data.length / 8)) === 0).map((candle, index) => (
        <text
          key={index}
          x={chartPadding.left + getX(candle.index)}
          y={height - 10}
          fill="#9ca3af"
          fontSize={10}
          fontFamily="Inter, system-ui, sans-serif"
          textAnchor="middle"
        >
          {new Date(candle.date).toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric' 
          })}
        </text>
      ))}
    </svg>
  )
}