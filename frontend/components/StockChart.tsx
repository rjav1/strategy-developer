'use client'

import { useEffect, useRef } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import annotationPlugin from 'chartjs-plugin-annotation'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  annotationPlugin
)

interface StockChartProps {
  data: {
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
}

export default function StockChart({ data }: StockChartProps) {
  // Calculate trend line
  const calculateTrendLine = () => {
    const prices = data.prices
    const n = prices.length
    
    if (n < 2) return { slope: 0, intercept: 0 }
    
    let sumX = 0
    let sumY = 0
    let sumXY = 0
    let sumX2 = 0
    
    for (let i = 0; i < n; i++) {
      sumX += i
      sumY += prices[i]
      sumXY += i * prices[i]
      sumX2 += i * i
    }
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
    const intercept = (sumY - slope * sumX) / n
    
    return { slope, intercept }
  }

  const { slope, intercept } = calculateTrendLine()
  const trendLineData = data.prices.map((_, index) => slope * index + intercept)

  const chartData = {
    labels: data.timestamps.map(ts => new Date(ts).toLocaleDateString()),
    datasets: [
      {
        label: 'Price',
        data: data.prices,
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: 2,
        fill: false,
        tension: 0.1,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: 'rgb(59, 130, 246)',
      },
      {
        label: 'Trend Line',
        data: trendLineData,
        borderColor: 'rgb(239, 68, 68)',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderWidth: 2,
        borderDash: [5, 5],
        fill: false,
        tension: 0,
        pointRadius: 0,
        pointHoverRadius: 0,
      }
    ]
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        labels: {
          color: 'rgb(156, 163, 175)',
          usePointStyle: true,
          padding: 20,
        }
      },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.9)',
        titleColor: 'rgb(255, 255, 255)',
        bodyColor: 'rgb(156, 163, 175)',
        borderColor: 'rgb(75, 85, 99)',
        borderWidth: 1,
        cornerRadius: 8,
        displayColors: true,
        callbacks: {
          title: (context: any) => {
            return `Date: ${context[0].label}`
          },
          label: (context: any) => {
            const label = context.dataset.label || ''
            const value = context.parsed.y
            return `${label}: $${value.toFixed(2)}`
          }
        }
      }
    },
    scales: {
      x: {
        display: true,
        title: {
          display: true,
          text: 'Date',
          color: 'rgb(156, 163, 175)',
          font: {
            size: 12
          }
        },
        grid: {
          color: 'rgba(75, 85, 99, 0.2)',
        },
        ticks: {
          color: 'rgb(156, 163, 175)',
          maxTicksLimit: 10,
        }
      },
      y: {
        display: true,
        title: {
          display: true,
          text: 'Price ($)',
          color: 'rgb(156, 163, 175)',
          font: {
            size: 12
          }
        },
        grid: {
          color: 'rgba(75, 85, 99, 0.2)',
        },
        ticks: {
          color: 'rgb(156, 163, 175)',
          callback: (value: any) => `$${value.toFixed(2)}`
        }
      }
    }
  }

  return (
    <div className="w-full h-full">
      <Line data={chartData} options={options} />
    </div>
  )
} 