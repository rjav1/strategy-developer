'use client'

import { useState, useEffect } from 'react'
import { Play, Settings, BarChart3, Clock, Target, Bookmark, Plus, X, TrendingUp, Download, RefreshCw } from 'lucide-react'
import BacktestChart from '../../components/BacktestChart'
import BacktestResults from '../../components/BacktestResults'
import TradeLog from '../../components/TradeLog'

interface BacktestResult {
  success: boolean
  results?: {
    total_trades: number
    winning_trades: number
    losing_trades: number
    win_rate: number
    total_pnl: number
    average_pnl: number
    best_trade: number
    worst_trade: number
    average_holding_period: number
    max_drawdown: number
    sharpe_ratio?: number
    profit_factor?: number
    total_return: number
    annualized_return: number
  }
  trades?: any[]
  price_data?: any[]
  momentum_periods?: any[]
  error?: string
}

export default function BacktestEngine() {
  const [selectedStrategy, setSelectedStrategy] = useState('momentum_screener')
  const [selectedData, setSelectedData] = useState('')
  const [backtestMode, setBacktestMode] = useState('momentum')
  const [watchlists, setWatchlists] = useState<any[]>([])
  const [selectedWatchlist, setSelectedWatchlist] = useState<string>('')
  const [customSymbols, setCustomSymbols] = useState('ALAB')
  const [dataSource, setDataSource] = useState<'watchlist' | 'custom'>('custom')
  const [showCustomSymbols, setShowCustomSymbols] = useState(false)
  const [strategies, setStrategies] = useState<any[]>([])
  const [loadingStrategies, setLoadingStrategies] = useState(false)
  
  // Backtest state
  const [isRunning, setIsRunning] = useState(false)
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null)
  const [progress, setProgress] = useState(0)
  const [currentTicker, setCurrentTicker] = useState('')
  const [initialCapital, setInitialCapital] = useState(10000)
  const [commission, setCommission] = useState(0.01)
  const [period, setPeriod] = useState('1y')
  const [selectedTickerForBacktest, setSelectedTickerForBacktest] = useState('')

  const datasets = [
    { id: '1', name: 'AAPL Historical Data' },
    { id: '2', name: 'SPY Daily Data' },
    { id: '3', name: 'BTC-USD Data' }
  ]

  const modes = [
    { id: 'momentum', name: 'Momentum Screener', description: 'Visual replay with momentum pattern detection' },
    { id: 'standard', name: 'Standard Backtest', description: 'Traditional time-series backtest' },
    { id: 'monte_carlo', name: 'Monte Carlo', description: 'Random sampling simulation' },
    { id: 'walk_forward', name: 'Walk Forward', description: 'Out-of-sample validation' }
  ]

  const periods = [
    { id: '6mo', name: '6 Months' },
    { id: '1y', name: '1 Year' },
    { id: '2y', name: '2 Years' },
    { id: '5y', name: '5 Years' }
  ]

  // Load watchlists from localStorage
  useEffect(() => {
    const savedWatchlists = localStorage.getItem('watchlists')
    if (savedWatchlists) {
      setWatchlists(JSON.parse(savedWatchlists))
    }
  }, [])

  // Load strategies from backend
  useEffect(() => {
    const fetchStrategies = async () => {
      setLoadingStrategies(true)
      try {
        const response = await fetch('http://localhost:8000/strategies')
        if (response.ok) {
          const strategiesData = await response.json()
          // Add momentum screener as built-in strategy
          const momentumStrategy = {
            id: 'momentum_screener',
            name: 'Momentum Screener',
            type: 'builtin',
            description: 'Pattern detection with visual replay'
          }
          setStrategies([momentumStrategy, ...strategiesData])
        }
      } catch (error) {
        console.error('Failed to fetch strategies:', error)
        // Fallback - just add momentum screener
        setStrategies([{
          id: 'momentum_screener',
          name: 'Momentum Screener',
          type: 'builtin',
          description: 'Pattern detection with visual replay'
        }])
      } finally {
        setLoadingStrategies(false)
      }
    }

    fetchStrategies()
  }, [])

  // Run momentum backtest
  const runMomentumBacktest = async (ticker: string) => {
    setIsRunning(true)
    setProgress(0)
    setCurrentTicker(ticker)
    setBacktestResult(null)

    try {
      // Create AbortController for request timeout management
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 60000) // 60 second timeout

      // Simulate progress for long-running backtest
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev < 90) return prev + 5
          return prev
        })
      }, 2000)

      const response = await fetch('http://localhost:8000/backtest/momentum', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ticker,
          period,
          initial_capital: initialCapital
        }),
        signal: controller.signal
      })

      clearTimeout(timeoutId)
      clearInterval(progressInterval)

      if (!response.ok) {
        let errorMessage = `HTTP error! status: ${response.status}`
        try {
          const errorData = await response.json()
          errorMessage = errorData.detail || errorMessage
        } catch {
          // If we can't parse the error response, use the default message
        }
        throw new Error(errorMessage)
      }

      const result = await response.json()
      setBacktestResult(result)
      setSelectedTickerForBacktest(ticker)
      
    } catch (error) {
      console.error('Backtest failed:', error)
      
      let errorMessage = 'Unknown error occurred'
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorMessage = 'Backtest timed out after 60 seconds. This may happen with complex calculations. Please try again or consider using a shorter time period.'
        } else if (error.message.includes('Failed to fetch')) {
          errorMessage = 'Unable to connect to the backend server. Please ensure the backend is running on http://localhost:8000'
        } else {
          errorMessage = error.message
        }
      }
      
      setBacktestResult({
        success: false,
        error: errorMessage
      })
    } finally {
      setIsRunning(false)
      setProgress(100)
    }
  }

  // Run backtest for selected symbols
  const runBacktest = async () => {
    const symbols = getSelectedSymbols()
    if (symbols.length === 0) return

    if (backtestMode === 'momentum' && symbols.length === 1) {
      await runMomentumBacktest(symbols[0])
    } else {
      // Handle other backtest modes or multiple symbols
      alert('Multi-symbol backtesting coming soon! For now, please select a single symbol for momentum backtesting.')
    }
  }

  const getSelectedSymbols = () => {
    if (dataSource === 'watchlist' && selectedWatchlist) {
      const watchlist = watchlists.find(w => w.id === selectedWatchlist)
      return watchlist ? watchlist.symbols : []
    } else if (dataSource === 'custom' && customSymbols) {
      return customSymbols.split(',').map(s => s.trim().toUpperCase()).filter(s => s)
    }
    return []
  }

  const exportResults = () => {
    if (!backtestResult || !backtestResult.success) return

    // Create CSV content
    const csvContent = [
      // Header
      ['Ticker', 'Period', 'Initial Capital', 'Total Trades', 'Win Rate', 'Total P&L', 'Sharpe Ratio', 'Max Drawdown'],
      // Data
      [
        selectedTickerForBacktest,
        period,
        initialCapital.toString(),
        backtestResult.results?.total_trades?.toString() || '0',
        `${backtestResult.results?.win_rate || 0}%`,
        `$${backtestResult.results?.total_pnl?.toFixed(2) || '0.00'}`,
        backtestResult.results?.sharpe_ratio?.toFixed(2) || '0.00',
        `$${backtestResult.results?.max_drawdown?.toFixed(2) || '0.00'}`
      ]
    ].map(row => row.join(',')).join('\n')

    // Create trades CSV
    const tradesCsv = [
      ['Trade #', 'Entry Date', 'Entry Price', 'Exit Date', 'Exit Price', 'P&L', 'P&L %', 'Holding Days'],
      ...(backtestResult.trades || []).map((trade, index) => [
        (index + 1).toString(),
        trade.entry_date,
        `$${trade.entry_price?.toFixed(2) || '0.00'}`,
        trade.exit_date || '',
        trade.exit_price ? `$${trade.exit_price.toFixed(2)}` : '',
        `$${trade.pnl?.toFixed(2) || '0.00'}`,
        `${trade.pnl_percent?.toFixed(2) || '0.00'}%`,
        trade.holding_days?.toString() || '0'
      ])
    ].map(row => row.join(',')).join('\n')

    // Create blob and download
    const blob = new Blob([csvContent + '\n\n' + tradesCsv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${selectedTickerForBacktest}_backtest_${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  const selectedSymbols = getSelectedSymbols()

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Backtest Engine</h1>
        <p className="text-muted-foreground">Run advanced backtesting simulations</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Configuration */}
        <div className="card-glow p-6">
          <h3 className="text-xl font-semibold text-white mb-4">Configuration</h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">
                Strategy
              </label>
              <select 
                value={selectedStrategy}
                onChange={(e) => setSelectedStrategy(e.target.value)}
                disabled={loadingStrategies}
                className="w-full px-4 py-3 bg-card/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white disabled:opacity-50"
              >
                <option value="">
                  {loadingStrategies ? 'Loading strategies...' : 'Select a strategy'}
                </option>
                {strategies.map((strategy) => (
                  <option key={strategy.id} value={strategy.id}>
                    {strategy.name}
                    {strategy.type === 'builtin' && ' (Built-in)'}
                  </option>
                ))}
              </select>
              {strategies.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {strategies.length} strategy{strategies.length !== 1 ? 'ies' : 'y'} available
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">
                Data Source
              </label>
              <div className="space-y-3">
                <div className="flex gap-3">
                  <button
                    onClick={() => setDataSource('watchlist')}
                    className={`flex-1 p-3 rounded-lg text-left transition-all duration-200 ${
                      dataSource === 'watchlist'
                        ? 'bg-purple-500 text-white'
                        : 'bg-card/50 text-muted-foreground hover:bg-card/70 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Bookmark className="h-4 w-4" />
                      <div>
                        <div className="font-medium text-sm">Watchlist</div>
                        <div className="text-xs opacity-75">Use stocks from watchlist</div>
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => setDataSource('custom')}
                    className={`flex-1 p-3 rounded-lg text-left transition-all duration-200 ${
                      dataSource === 'custom'
                        ? 'bg-purple-500 text-white'
                        : 'bg-card/50 text-muted-foreground hover:bg-card/70 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Plus className="h-4 w-4" />
                      <div>
                        <div className="font-medium text-sm">Custom</div>
                        <div className="text-xs opacity-75">Enter symbols manually</div>
                      </div>
                    </div>
                  </button>
                </div>

                {dataSource === 'watchlist' && (
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-2">
                      Select Watchlist
                    </label>
                    {watchlists.length === 0 ? (
                      <div className="p-4 bg-gray-800/50 rounded-lg text-center">
                        <Bookmark className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                        <p className="text-muted-foreground text-sm mb-3">No watchlists found</p>
                        <button
                          onClick={() => window.location.href = '/watchlists'}
                          className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors text-sm"
                        >
                          Create Watchlist
                        </button>
                      </div>
                    ) : (
                      <select 
                        value={selectedWatchlist}
                        onChange={(e) => setSelectedWatchlist(e.target.value)}
                        className="w-full px-4 py-3 bg-card/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white"
                      >
                        <option value="">Select a watchlist</option>
                        {watchlists.map((watchlist) => (
                          <option key={watchlist.id} value={watchlist.id}>
                            {watchlist.name} ({watchlist.symbols.length} symbols)
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                {dataSource === 'custom' && (
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-2">
                      Custom Symbols
                    </label>
                    <textarea
                      value={customSymbols}
                      onChange={(e) => setCustomSymbols(e.target.value)}
                      placeholder="Enter symbols separated by commas (e.g., AAPL, MSFT, GOOGL)"
                      rows={3}
                      className="w-full px-4 py-3 bg-card/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white"
                    />
                    {backtestMode === 'momentum' && (
                      <p className="text-xs text-yellow-400 mt-2">
                        Note: Momentum backtesting currently supports single symbols only. Enter one symbol for best results.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">
                Backtest Mode
              </label>
              <div className="grid grid-cols-2 gap-2">
                {modes.map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => setBacktestMode(mode.id)}
                    className={`p-3 rounded-lg text-left transition-all duration-200 ${
                      backtestMode === mode.id
                        ? 'bg-purple-500 text-white'
                        : 'bg-card/50 text-muted-foreground hover:bg-card/70 hover:text-white'
                    }`}
                  >
                    <div className="font-medium text-sm">{mode.name}</div>
                    <div className="text-xs opacity-75">{mode.description}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">
                Historical Data Period
              </label>
              <div className="grid grid-cols-2 gap-2">
                {periods.map((periodOption) => (
                  <button
                    key={periodOption.id}
                    onClick={() => setPeriod(periodOption.id)}
                    className={`p-3 rounded-lg text-left transition-all duration-200 ${
                      period === periodOption.id
                        ? 'bg-purple-500 text-white'
                        : 'bg-card/50 text-muted-foreground hover:bg-card/70 hover:text-white'
                    }`}
                  >
                    <div className="font-medium text-sm">{periodOption.name}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  Initial Capital
                </label>
                <input
                  type="number"
                  value={initialCapital}
                  onChange={(e) => setInitialCapital(Number(e.target.value))}
                  className="w-full px-4 py-3 bg-card/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  Commission ($)
                </label>
                <input
                  type="number"
                  value={commission}
                  onChange={(e) => setCommission(Number(e.target.value))}
                  step={0.01}
                  className="w-full px-4 py-3 bg-card/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Selected Symbols Preview */}
        <div className="card-glow p-6">
          <h3 className="text-xl font-semibold text-white mb-4">Selected Symbols</h3>
          
          <div className="space-y-4">
            {selectedSymbols.length === 0 ? (
              <div className="text-center py-8">
                <Target className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-2">No symbols selected</p>
                <p className="text-sm text-muted-foreground">
                  {dataSource === 'watchlist' 
                    ? 'Select a watchlist to see symbols'
                    : 'Enter custom symbols to see them here'
                  }
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {selectedSymbols.length} symbol{selectedSymbols.length !== 1 ? 's' : ''} selected
                  </span>
                  <span className="text-sm text-purple-400">
                    {dataSource === 'watchlist' ? 'From Watchlist' : 'Custom Symbols'}
                  </span>
                </div>
                
                <div className="max-h-48 overflow-y-auto">
                  <div className="grid grid-cols-3 gap-2">
                    {selectedSymbols.map((symbol: string, index: number) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-2 bg-gray-800/50 rounded-lg"
                      >
                        <span className="text-sm font-mono text-white">{symbol}</span>
                        <button
                          onClick={() => {
                            if (dataSource === 'custom') {
                              const symbols = customSymbols.split(',').map(s => s.trim().toUpperCase()).filter(s => s && s !== symbol)
                              setCustomSymbols(symbols.join(', '))
                            }
                          }}
                          className="text-gray-400 hover:text-red-400 transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Target className="h-5 w-5 text-blue-400 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-white mb-1">Ready to Backtest</h4>
                      <p className="text-sm text-muted-foreground">
                        Your strategy will be tested on {selectedSymbols.length} symbol{selectedSymbols.length !== 1 ? 's' : ''}. 
                        {dataSource === 'watchlist' && selectedWatchlist && (
                          <> The watchlist "{watchlists.find(w => w.id === selectedWatchlist)?.name}" will be used.</>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Run Button */}
      <div className="flex justify-center">
        <button 
          onClick={runBacktest}
          disabled={selectedSymbols.length === 0 || !selectedStrategy || isRunning}
          className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-xl font-medium transition-all duration-200 shadow-lg hover:shadow-purple-500/25 text-lg"
        >
          {isRunning ? (
            <>
              <RefreshCw className="h-6 w-6 animate-spin" />
              Running Backtest...
            </>
          ) : (
            <>
              <Play className="h-6 w-6" />
              Run Backtest
            </>
          )}
        </button>
      </div>

      {/* Progress Indicator */}
      {isRunning && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Testing {currentTicker}...
            </span>
            <span className="text-purple-400 font-medium">
              {progress}%
            </span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div 
              className="bg-gradient-to-r from-purple-500 to-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {backtestResult && !backtestResult.success && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
          <h3 className="text-red-400 font-medium mb-2">Backtest Failed</h3>
          <p className="text-red-300 text-sm">{backtestResult.error}</p>
        </div>
      )}

      {/* Results Section */}
      {backtestResult && backtestResult.success && backtestResult.results && (
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white">Backtest Complete</h2>
            <div className="flex items-center gap-2">
              <button 
                onClick={exportResults}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
              >
                <Download className="h-4 w-4" />
                Export Results
              </button>
              <button 
                onClick={() => setBacktestResult(null)}
                className="flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
              >
                <X className="h-4 w-4" />
                Clear Results
              </button>
            </div>
          </div>

          {/* Visual Chart */}
          {backtestResult.price_data && (
            <BacktestChart
              priceData={backtestResult.price_data}
              trades={backtestResult.trades || []}
              momentumPeriods={backtestResult.momentum_periods || []}
              ticker={selectedTickerForBacktest}
            />
          )}

          {/* Performance Results */}
          <BacktestResults
            results={backtestResult.results}
            trades={backtestResult.trades || []}
            initialCapital={initialCapital}
            ticker={selectedTickerForBacktest}
            period={period}
          />

          {/* Trade Log */}
          {backtestResult.trades && backtestResult.trades.length > 0 && (
            <TradeLog
              trades={backtestResult.trades}
              ticker={selectedTickerForBacktest}
            />
          )}
        </div>
      )}
    </div>
  )
} 