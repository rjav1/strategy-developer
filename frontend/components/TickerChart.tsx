'use client'

import React from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts'

interface TickerData {
  symbol: string
  name: string
  current_price: number
  daily_change: number
  daily_change_percent: number
  timestamps: string[]
  prices: number[]
  highs: number[]
  lows: number[]
  opens: number[]
  volumes: number[]
}

interface TickerChartProps {
  data: TickerData
  range: string
}

const TickerChart: React.FC<TickerChartProps> = ({ data, range }) => {
  // Transform data for Recharts
  const chartData = data.timestamps.map((timestamp, index) => ({
    time: timestamp,
    price: data.prices[index],
    high: data.highs[index],
    low: data.lows[index],
    open: data.opens[index],
    volume: data.volumes[index],
    displayTime: formatTimeForDisplay(timestamp, range),
  }))

  function formatTimeForDisplay(timestamp: string, range: string): string {
    const date = new Date(timestamp)
    
    switch (range) {
      case '1d':
        return date.toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit',
          hour12: true 
        })
      case '1w':
      case '1m':
        return date.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric' 
        })
      case '3m':
      case '6m':
      case '1y':
        return date.toLocaleDateString('en-US', { 
          month: 'short', 
          year: '2-digit' 
        })
      default:
        return date.toLocaleDateString('en-US', { 
          year: 'numeric' 
        })
    }
  }

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
      return (
        <div className="bg-card/95 backdrop-blur-xl border border-white/20 rounded-xl p-4 shadow-2xl">
          <p className="text-foreground font-medium mb-2">{label}</p>
          <div className="space-y-1">
            <p className="text-purple-400">
              <span className="font-medium">Price:</span> {formatPrice(data.price)}
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
          </div>
        </div>
      )
    }
    return null
  }

  // Determine if trend is positive
  const isPositive = data.daily_change >= 0
  const primaryColor = isPositive ? '#10b981' : '#ef4444'
  const gradientId = `gradient-${data.symbol}`

  return (
    <div className="w-full h-[400px] chart-container">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{
            top: 20,
            right: 30,
            left: 20,
            bottom: 20,
          }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={primaryColor} stopOpacity={0.3}/>
              <stop offset="95%" stopColor={primaryColor} stopOpacity={0.05}/>
            </linearGradient>
            <linearGradient id="purple-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4}/>
              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.05}/>
            </linearGradient>
          </defs>
          
          <CartesianGrid 
            strokeDasharray="3 3" 
            stroke="rgba(255,255,255,0.1)" 
            horizontal={true}
            vertical={false}
          />
          
          <XAxis 
            dataKey="displayTime"
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#9ca3af', fontSize: 12 }}
            interval="preserveStartEnd"
          />
          
          <YAxis 
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#9ca3af', fontSize: 12 }}
            domain={['dataMin - 5', 'dataMax + 5']}
            tickFormatter={(value) => `$${value.toFixed(0)}`}
          />
          
          <Tooltip content={<CustomTooltip />} />
          
          <Area
            type="monotone"
            dataKey="price"
            stroke="#8b5cf6"
            strokeWidth={3}
            fill="url(#purple-gradient)"
            dot={false}
            activeDot={{ 
              r: 6, 
              fill: '#8b5cf6',
              stroke: '#ffffff',
              strokeWidth: 2,
              filter: 'drop-shadow(0 0 6px rgba(139, 92, 246, 0.6))'
            }}
            animationDuration={1000}
            animationEasing="ease-in-out"
          />
        </AreaChart>
      </ResponsiveContainer>
      
      {/* Chart Title */}
      <div className="text-center mt-4">
        <h3 className="text-lg font-semibold text-muted-foreground">
          {data.symbol} Price Chart • {range.toUpperCase()}
        </h3>
      </div>
    </div>
  )
}

export default TickerChart 