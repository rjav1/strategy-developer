'use client'

import { useState, useEffect } from 'react'
import { Search, TrendingUp, TrendingDown, Target, Zap } from 'lucide-react'
import TickerChart from '@/components/TickerChart'
import LoadingSkeleton from '@/components/LoadingSkeleton'
import { useRouter } from 'next/navigation'

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

const ranges = ['1d', '1w', '1m', '3m', '6m', '1y', '5y', 'max']

export default function Home() {
  const [symbol, setSymbol] = useState('')
  const [selectedRange, setSelectedRange] = useState('1d')
  const [data, setData] = useState<TickerData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  // Auto-fetch data when range changes and we have a symbol
  useEffect(() => {
    if (symbol.trim() && data) {
      fetchTickerData(symbol, selectedRange)
    }
  }, [selectedRange])

  const fetchTickerData = async (tickerSymbol: string, range: string) => {
    setLoading(true)
    setError('')
    
    try {
      const response = await fetch(`http://localhost:8002/ticker/${tickerSymbol.toUpperCase()}?range=${range}`)
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to fetch ticker data')
      }
      const tickerData = await response.json()
      setData(tickerData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!symbol.trim()) return

    await fetchTickerData(symbol, selectedRange)
  }

  const handleRangeChange = (newRange: string) => {
    setSelectedRange(newRange)
  }

  const handleMomentumAnalysis = () => {
    if (data) {
      // Navigate to analytics page with the symbol pre-filled
      router.push(`/analytics?symbol=${data.symbol}`)
    }
  }

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-purple-400 to-purple-600 bg-clip-text text-transparent mb-4">
            Advanced Trading Analytics
          </h1>
          <p className="text-muted-foreground text-lg">
            Real-time market data with 5 Star momentum pattern analysis
          </p>
        </div>

        {/* Search Form */}
        <form onSubmit={handleSubmit} className="mb-8">
          <div className="flex flex-col md:flex-row gap-4 max-w-2xl mx-auto">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-5 w-5" />
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                placeholder="Enter ticker symbol (e.g., AAPL, BTC-USD, TSLA)"
                className="w-full pl-10 pr-4 py-3 bg-card/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white placeholder-muted-foreground"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !symbol.trim()}
              className="px-8 py-3 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-medium transition-all duration-200 shadow-lg hover:shadow-purple-500/25"
            >
              {loading ? 'Loading...' : 'Lookup'}
            </button>
          </div>
        </form>

        {/* Range Selector */}
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          {ranges.map((range) => (
            <button
              key={range}
              onClick={() => handleRangeChange(range)}
              className={`px-4 py-2 rounded-xl font-medium transition-all duration-200 ${
                selectedRange === range
                  ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/25'
                  : 'bg-card/50 text-muted-foreground hover:bg-card/70 hover:text-white'
              }`}
            >
              {range.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-destructive/20 border border-destructive/30 rounded-xl text-destructive-foreground">
            <p className="text-center">{error}</p>
          </div>
        )}

        {/* Loading Skeleton */}
        {loading && <LoadingSkeleton />}

        {/* Ticker Data */}
        {data && !loading && (
          <div className="animate-fade-in space-y-6">
            {/* Ticker Header */}
            <div className="ticker-header">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="space-y-3">
                  <h2 className="text-3xl md:text-4xl font-bold text-white">{data.symbol}</h2>
                  <p className="text-muted-foreground text-lg">{data.name}</p>
                </div>
                <div className="flex flex-col md:items-end space-y-2">
                  <div className="text-3xl md:text-4xl font-bold text-white">
                    ${data.current_price.toFixed(2)}
                  </div>
                  <div className={`flex items-center gap-2 text-lg font-medium ${
                    data.daily_change >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {data.daily_change >= 0 ? (
                      <TrendingUp className="h-5 w-5" />
                    ) : (
                      <TrendingDown className="h-5 w-5" />
                    )}
                    {data.daily_change >= 0 ? '+' : ''}{data.daily_change.toFixed(2)} ({data.daily_change_percent.toFixed(2)}%)
                  </div>
                </div>
              </div>
            </div>

            {/* Chart */}
            <div className="card-glow p-6">
              <TickerChart data={data} range={selectedRange} />
            </div>

            {/* Momentum Analysis CTA */}
            <div className="card-glow p-6">
              <div className="text-center space-y-4">
                <div>
                  <h3 className="text-xl font-semibold text-white mb-2">
                    Want deeper insights into {data.symbol}?
                  </h3>
                  <p className="text-muted-foreground">
                    Run a comprehensive 5 Star momentum pattern analysis to identify potential trading opportunities
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <button 
                    onClick={handleMomentumAnalysis}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 rounded-xl font-medium transition-all duration-200 shadow-lg hover:shadow-green-500/25"
                  >
                    <Target className="h-5 w-5" />
                    5 Star Pattern Analysis
                  </button>
                  <button 
                    onClick={() => router.push('/screeners')}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 rounded-xl font-medium transition-all duration-200 shadow-lg hover:shadow-blue-500/25"
                  >
                    <Zap className="h-5 w-5" />
                    Run Screeners
                  </button>
                </div>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="metric-card">
                <h3 className="text-sm font-medium text-muted-foreground mb-2">High</h3>
                <p className="text-2xl font-bold text-green-400">
                  ${Math.max(...data.highs).toFixed(2)}
                </p>
              </div>
              <div className="metric-card">
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Low</h3>
                <p className="text-2xl font-bold text-red-400">
                  ${Math.min(...data.lows).toFixed(2)}
                </p>
              </div>
              <div className="metric-card">
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Volume</h3>
                <p className="text-2xl font-bold text-white">
                  {Math.max(...data.volumes).toLocaleString()}
                </p>
              </div>
              <div className="metric-card">
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Range</h3>
                <p className="text-2xl font-bold text-purple-400">
                  {selectedRange.toUpperCase()}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Features Section */}
        {!data && !loading && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
            <div className="card-glow p-6 text-center">
              <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center mx-auto mb-4">
                <Search className="h-6 w-6 text-purple-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Real-time Data</h3>
              <p className="text-muted-foreground text-sm">
                Get live market data for stocks and cryptocurrencies with comprehensive historical analysis
              </p>
            </div>
            
            <div className="card-glow p-6 text-center">
              <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center mx-auto mb-4">
                <Target className="h-6 w-6 text-green-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">5 Star Analysis</h3>
              <p className="text-muted-foreground text-sm">
                Advanced momentum pattern recognition using the complete 5 Star Trading Setup methodology
              </p>
            </div>
            
            <div className="card-glow p-6 text-center">
              <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center mx-auto mb-4">
                <Zap className="h-6 w-6 text-blue-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">Smart Screening</h3>
              <p className="text-muted-foreground text-sm">
                Screen thousands of stocks automatically to find the best momentum and volatility opportunities
              </p>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center mt-12 text-muted-foreground">
          <p className="text-sm">
            Powered by Advanced Analytics Engine • Real-time data with professional-grade analysis
          </p>
        </div>
      </div>
    </div>
  )
} 