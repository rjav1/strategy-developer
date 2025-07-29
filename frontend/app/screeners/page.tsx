'use client'

import { useState, useEffect } from 'react'
import { Search, Filter, Plus, Play, Edit, Trash2, Loader2, TrendingUp, Shield, BarChart3, Info } from 'lucide-react'
import StockChart from '../../components/StockChart'

interface ScreenResult {
  symbol: string
  value: number
  name?: string
}

interface StockData {
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

export default function Screeners() {
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<ScreenResult[]>([])
  const [screenerType, setScreenerType] = useState<'momentum' | 'volatility' | null>(null)
  const [error, setError] = useState('')
  const [selectedStock, setSelectedStock] = useState<StockData | null>(null)
  const [showAnalysis, setShowAnalysis] = useState(false)
  const [analysisData, setAnalysisData] = useState<any>(null)

  const runScreener = async (type: 'momentum' | 'volatility') => {
    setLoading(true)
    setError('')
    setScreenerType(type)
    setResults([]) // Clear previous results immediately
    
    try {
      const endpoint = type === 'momentum' ? '/screen/high_momentum' : '/screen/low_volatility'
      const response = await fetch(`http://localhost:8000${endpoint}?period=3mo&top_n=10`)
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const data = await response.json()
      setResults(data)
      
      // Generate analysis data
      generateAnalysis(data, type)
      
    } catch (err) {
      setError(`Failed to run screener: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  const generateAnalysis = (data: ScreenResult[], type: 'momentum' | 'volatility') => {
    const avgValue = data.reduce((sum, item) => sum + item.value, 0) / data.length
    const maxValue = Math.max(...data.map(item => item.value))
    const minValue = Math.min(...data.map(item => item.value))
    
    setAnalysisData({
      type,
      totalStocks: data.length,
      averageValue: avgValue,
      maxValue,
      minValue,
      topPerformer: data[0],
      worstPerformer: data[data.length - 1],
      positiveCount: type === 'momentum' ? data.filter(item => item.value > 0).length : 0,
      negativeCount: type === 'momentum' ? data.filter(item => item.value < 0).length : 0
    })
  }

  const fetchStockData = async (symbol: string) => {
    try {
      const response = await fetch(`http://localhost:8000/ticker/${symbol}?range=3m`)
      if (response.ok) {
        const data = await response.json()
        setSelectedStock(data)
      }
    } catch (err) {
      console.error('Failed to fetch stock data:', err)
    }
  }

  const formatValue = (value: number, type: 'momentum' | 'volatility') => {
    if (type === 'momentum') {
      return `${(value * 100).toFixed(2)}%`
    } else {
      return `${(value * 100).toFixed(2)}%`
    }
  }

  const getAnalysisText = () => {
    if (!analysisData) return ''
    
    const { type, totalStocks, averageValue, topPerformer, worstPerformer, positiveCount, negativeCount } = analysisData
    
    if (type === 'momentum') {
      return `Analysis: Screened ${totalStocks} stocks. Average momentum: ${(averageValue * 100).toFixed(2)}%. 
      ${positiveCount} stocks showed positive momentum, ${negativeCount} showed negative. 
      Top performer: ${topPerformer.symbol} (${(topPerformer.value * 100).toFixed(2)}%), 
      Worst: ${worstPerformer.symbol} (${(worstPerformer.value * 100).toFixed(2)}%).`
    } else {
      return `Analysis: Screened ${totalStocks} stocks. Average volatility: ${(averageValue * 100).toFixed(2)}%. 
      Lowest volatility: ${topPerformer.symbol} (${(topPerformer.value * 100).toFixed(2)}%), 
      Highest: ${worstPerformer.symbol} (${(worstPerformer.value * 100).toFixed(2)}%).`
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Screeners</h1>
          <p className="text-muted-foreground">Manage your stock screeners</p>
        </div>
        <button className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 rounded-xl font-medium transition-all duration-200 shadow-lg hover:shadow-purple-500/25">
          <Plus className="h-5 w-5" />
          New Screener
        </button>
      </div>

      {/* Analysis Panel */}
      {analysisData && (
        <div className="card-glow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">
              {screenerType === 'momentum' ? 'High Momentum' : 'Low Volatility'} Analysis
            </h2>
            <button 
              onClick={() => setShowAnalysis(!showAnalysis)}
              className="flex items-center gap-2 px-3 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg transition-colors"
            >
              <BarChart3 className="h-4 w-4" />
              {showAnalysis ? 'Hide' : 'Show'} Analysis
            </button>
          </div>
          
          {showAnalysis && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-gray-800/50 rounded-lg">
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">Total Stocks</h3>
                  <p className="text-2xl font-bold text-white">{analysisData.totalStocks}</p>
                </div>
                <div className="p-4 bg-gray-800/50 rounded-lg">
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">
                    {screenerType === 'momentum' ? 'Average Momentum' : 'Average Volatility'}
                  </h3>
                  <p className="text-2xl font-bold text-white">
                    {(analysisData.averageValue * 100).toFixed(2)}%
                  </p>
                </div>
                <div className="p-4 bg-gray-800/50 rounded-lg">
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">
                    {screenerType === 'momentum' ? 'Top Performer' : 'Lowest Volatility'}
                  </h3>
                  <p className="text-lg font-bold text-green-400">{analysisData.topPerformer.symbol}</p>
                  <p className="text-sm text-muted-foreground">
                    {(analysisData.topPerformer.value * 100).toFixed(2)}%
                  </p>
                </div>
              </div>
              
              <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <div className="flex items-start gap-3">
                  <Info className="h-5 w-5 text-blue-400 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-white mb-2">Market Insights</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {getAnalysisText()}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Results Display */}
      {results.length > 0 && (
        <div className="card-glow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">
              {screenerType === 'momentum' ? 'High Momentum' : 'Low Volatility'} Results
            </h2>
            <span className="text-sm text-muted-foreground">
              {results.length} results
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left p-3 text-muted-foreground font-medium">Rank</th>
                  <th className="text-left p-3 text-muted-foreground font-medium">Symbol</th>
                  <th className="text-left p-3 text-muted-foreground font-medium">Company</th>
                  <th className="text-left p-3 text-muted-foreground font-medium">
                    {screenerType === 'momentum' ? 'Momentum' : 'Volatility'}
                  </th>
                  <th className="text-left p-3 text-muted-foreground font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result, index) => (
                  <tr key={result.symbol} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="p-3 text-white font-medium">#{index + 1}</td>
                    <td className="p-3 text-white font-mono">{result.symbol}</td>
                    <td className="p-3 text-muted-foreground">{result.name || result.symbol}</td>
                    <td className={`p-3 font-medium ${
                      screenerType === 'momentum' 
                        ? result.value > 0 ? 'text-green-400' : 'text-red-400'
                        : 'text-blue-400'
                    }`}>
                      {formatValue(result.value, screenerType!)}
                    </td>
                    <td className="p-3">
                      <button 
                        onClick={() => fetchStockData(result.symbol)}
                        className="px-3 py-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded text-sm transition-colors"
                      >
                        View Chart
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Stock Chart Modal */}
      {selectedStock && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 rounded-xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold text-white">{selectedStock.symbol}</h2>
                <p className="text-muted-foreground">{selectedStock.name}</p>
              </div>
              <button 
                onClick={() => setSelectedStock(null)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="p-4 bg-gray-800/50 rounded-lg">
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Current Price</h3>
                <p className="text-2xl font-bold text-white">${selectedStock.current_price.toFixed(2)}</p>
              </div>
              <div className="p-4 bg-gray-800/50 rounded-lg">
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Daily Change</h3>
                <p className={`text-2xl font-bold ${selectedStock.daily_change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {selectedStock.daily_change >= 0 ? '+' : ''}{selectedStock.daily_change.toFixed(2)}
                </p>
                <p className={`text-sm ${selectedStock.daily_change_percent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {selectedStock.daily_change_percent >= 0 ? '+' : ''}{selectedStock.daily_change_percent.toFixed(2)}%
                </p>
              </div>
              <div className="p-4 bg-gray-800/50 rounded-lg">
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Data Points</h3>
                <p className="text-2xl font-bold text-white">{selectedStock.prices.length}</p>
              </div>
            </div>

            {/* Interactive Chart */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-white mb-4">Price Chart with Trend Line</h3>
              <div className="h-80 bg-gray-900 rounded-lg p-4 relative">
                <StockChart data={selectedStock} />
              </div>
              <div className="mt-4 text-sm text-muted-foreground">
                <p>• Blue line: Price movement</p>
                <p>• Red dashed line: Linear trend line</p>
                <p>• Hover for detailed price information</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="card-glow p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-6 w-6 text-green-400" />
              <div>
                <h3 className="text-lg font-semibold text-white">High Momentum</h3>
                <div className="w-3 h-3 rounded-full bg-green-400"></div>
              </div>
            </div>
          </div>
          
          <p className="text-muted-foreground mb-4 text-sm">
            Screens for stocks with the highest price momentum over the last 3 months
          </p>
          
          <div className="flex gap-2">
            <button 
              onClick={() => runScreener('momentum')}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading && screenerType === 'momentum' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Run
            </button>
            <button className="flex items-center justify-center px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg transition-colors">
              <Edit className="h-4 w-4" />
            </button>
            <button className="flex items-center justify-center px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="card-glow p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <Shield className="h-6 w-6 text-blue-400" />
              <div>
                <h3 className="text-lg font-semibold text-white">Low Volatility</h3>
                <div className="w-3 h-3 rounded-full bg-blue-400"></div>
              </div>
            </div>
          </div>
          
          <p className="text-muted-foreground mb-4 text-sm">
            Screens for stocks with the lowest price volatility over the last 3 months
          </p>
          
          <div className="flex gap-2">
            <button 
              onClick={() => runScreener('volatility')}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg transition-colors disabled:opacity-50"
            >
              {loading && screenerType === 'volatility' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Run
            </button>
            <button className="flex items-center justify-center px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg transition-colors">
              <Edit className="h-4 w-4" />
            </button>
            <button className="flex items-center justify-center px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="card-glow p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <Filter className="h-6 w-6 text-purple-400" />
              <div>
                <h3 className="text-lg font-semibold text-white">Value Stocks</h3>
                <div className="w-3 h-3 rounded-full bg-gray-400"></div>
              </div>
            </div>
          </div>
          
          <p className="text-muted-foreground mb-4 text-sm">Screens for undervalued stocks</p>
          
          <div className="flex gap-2">
            <button className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg transition-colors">
              <Play className="h-4 w-4" />
              Run
            </button>
            <button className="flex items-center justify-center px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg transition-colors">
              <Edit className="h-4 w-4" />
            </button>
            <button className="flex items-center justify-center px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
} 