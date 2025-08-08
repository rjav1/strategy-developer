'use client'

import { useState, useEffect, useRef } from 'react'
import { Play, Settings, BarChart3, Clock, Target, Bookmark, Plus, X, TrendingUp, Download, RefreshCw, Terminal, Trash2 } from 'lucide-react'
import BacktestResults from '../../components/BacktestResults'
import TradeLog from '../../components/TradeLog'
import LogConsole from '../../components/LogConsole'
import Smooth30DayScroller from '../../components/Smooth30DayScroller'
import MultiSymbolResults from '../../components/MultiSymbolResults'
import { useWatchlist } from '../providers/WatchlistProvider'

interface BacktestResult {
  success: boolean
  results?: {
    total_trades: number
    winning_trades: number
    losing_trades: number
    win_rate: number
    total_pnl: number
    total_return_pct: number
    avg_trade_pnl: number
    avg_win: number
    avg_loss: number
    avg_holding_days: number
    max_drawdown: number
    sharpe_ratio?: number
    profit_factor?: number
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
  // Use synced watchlists from provider instead of localStorage
  const { watchlists: providerWatchlists, refreshWatchlists } = useWatchlist() as any
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
  // Multi progress
  const [symbolsCompleted, setSymbolsCompleted] = useState(0)
  const [symbolsTotal, setSymbolsTotal] = useState(0)
  const [candleProgress, setCandleProgress] = useState(0)
  const [candleTotal, setCandleTotal] = useState(100)
  const [currentTicker, setCurrentTicker] = useState('')
  const [initialCapital, setInitialCapital] = useState(10000)
  const [commission, setCommission] = useState(0.01)
  const [period, setPeriod] = useState('1y')
  const [customMonths, setCustomMonths] = useState(12) // For custom period selection
  const [useCustomPeriod, setUseCustomPeriod] = useState(false)
  const [backtestType, setBacktestType] = useState<'single' | 'multi'>('single')
  const [selectedTickerForBacktest, setSelectedTickerForBacktest] = useState('')
  const [liveResults, setLiveResults] = useState<any>(null)
  const [backtestPhase, setBacktestPhase] = useState<string>('')
  const [jobId, setJobId] = useState<string>('')
  const [showClearLogsDialog, setShowClearLogsDialog] = useState(false)
  const [pendingBacktest, setPendingBacktest] = useState<{ticker: string, shouldClear: boolean} | null>(null)
  
  // Log console state
  const [isLogConsoleOpen, setIsLogConsoleOpen] = useState(false)
  const [logsHeight, setLogsHeight] = useState(256) // Default height in pixels
  
  // Backend connection state
  const [backendStatus, setBackendStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  
  // Chart type removed - now using single Smooth30DayScroller

  // Cleanup refs for intervals and timeouts
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const maxTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Cleanup effect
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
      }
      if (maxTimeoutRef.current) {
        clearTimeout(maxTimeoutRef.current)
      }
    }
  }, [])

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

  // Sync watchlists from provider; fallback to localStorage once
  useEffect(() => {
    if (providerWatchlists && providerWatchlists.length > 0) {
      setWatchlists(providerWatchlists)
      return
    }
    const savedWatchlists = localStorage.getItem('watchlists')
    if (savedWatchlists) {
      setWatchlists(JSON.parse(savedWatchlists))
    } else {
      // Try fetching once from provider if empty
      refreshWatchlists?.().catch(() => {})
    }
  }, [providerWatchlists])

  // Load strategies from backend
  useEffect(() => {
    const fetchStrategies = async () => {
      setLoadingStrategies(true)
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout
        
        const response = await fetch('http://localhost:8000/strategies', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: controller.signal
        })
        
        clearTimeout(timeoutId)
        
        if (response.ok) {
          const strategiesData = await response.json()
          console.log('✅ Fetched strategies from backend:', strategiesData)
          setBackendStatus('connected')
          
          // Add momentum screener as built-in strategy
          const momentumStrategy = {
            id: 'momentum_screener',
            name: 'Momentum Screener',
            type: 'builtin',
            description: 'Pattern detection with visual replay'
          }
          setStrategies([momentumStrategy, ...strategiesData])
        } else {
          console.error('❌ Backend returned error:', response.status, response.statusText)
          setBackendStatus('disconnected')
          // Fallback - just add momentum screener
          setStrategies([{
            id: 'momentum_screener',
            name: 'Momentum Screener',
            type: 'builtin',
            description: 'Pattern detection with visual replay'
          }])
        }
      } catch (error: any) {
        if (error.name === 'AbortError') {
          console.error('❌ Request timeout - backend may not be running')
        } else {
          console.error('❌ Failed to fetch strategies:', error)
        }
        
        setBackendStatus('disconnected')
        
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
    // Check if there are existing logs and show confirmation dialog
    try {
      const response = await fetch('http://localhost:8000/logs?limit=1')
      if (response.ok) {
        const data = await response.json()
        if (data.logs && data.logs.length > 0) {
          // Show confirmation dialog
          setPendingBacktest({ ticker, shouldClear: false })
          setShowClearLogsDialog(true)
          return
        }
      }
    } catch (error) {
      console.warn('Could not check existing logs:', error)
    }
    
    // If no existing logs, start backtest directly
    await startBacktest(ticker, false)
  }

  const runMultiSymbolBacktest = async (symbols: string[]) => {
    // Check if there are existing logs and show confirmation dialog
    try {
      const response = await fetch('http://localhost:8000/logs?limit=1')
      if (response.ok) {
        const data = await response.json()
        if (data.logs && data.logs.length > 0) {
          // Show confirmation dialog - use first symbol as representative
          setPendingBacktest({ ticker: symbols.join(','), shouldClear: false })
          setShowClearLogsDialog(true)
          return
        }
      }
    } catch (error) {
      console.warn('Could not check existing logs:', error)
    }
    
    // If no existing logs, start multi-symbol backtest directly
    await startMultiSymbolBacktest(symbols, false)
  }

  // Start the actual backtest
  const startBacktest = async (ticker: string, shouldClearLogs: boolean) => {
    setIsRunning(true)
    setProgress(0)
    setCurrentTicker(ticker)
    setBacktestResult(null)
    setSelectedTickerForBacktest(ticker)
    setBacktestPhase('Starting...')
    setIsLogConsoleOpen(true) // Automatically show logs when backtest starts

    // Clear logs only if user confirmed
    if (shouldClearLogs) {
      try {
        await fetch('http://localhost:8000/logs', { method: 'DELETE' })
        console.log('✅ Logs cleared for new backtest')
      } catch (error) {
        console.warn('Could not clear logs:', error)
      }
    }

    try {
      // Determine the period to use
      const finalPeriod = useCustomPeriod ? `${customMonths}mo` : period

      // Start backtest with progress tracking
      const startResponse = await fetch('http://localhost:8000/backtest/momentum/progress', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ticker,
          period: finalPeriod,
          initial_capital: initialCapital
        })
      })

      if (!startResponse.ok) {
        throw new Error(`Failed to start backtest: ${startResponse.status}`)
      }

      const { job_id } = await startResponse.json()
      setJobId(job_id)
      
      // Poll for progress updates
      progressIntervalRef.current = setInterval(async () => {
        try {
          const progressResponse = await fetch(`http://localhost:8000/backtest/progress/${job_id}`)
          
          if (progressResponse.ok) {
            const progressData = await progressResponse.json()
            
            // Update progress
            setProgress(progressData.progress || 0)
            
            // Update phase and current ticker message
            if (progressData.message) {
              setBacktestPhase(progressData.message)
              setCurrentTicker(`${ticker} - ${progressData.message}`)
            }
            
            // Check if completed
            if (progressData.status === 'completed' && progressData.results) {
              if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current)
                progressIntervalRef.current = null
              }
              
              // Debug: Log the raw results from backend
              console.log('🚀 BACKEND RESPONSE - EXTENSIVE DEBUG:')
              console.log('🚀 Full progressData object:', JSON.stringify(progressData, null, 2))
              console.log('🚀 progressData.results:', JSON.stringify(progressData.results, null, 2))
              
              console.log('🚀 TRADES FROM BACKEND:')
              if (progressData.results.trades && progressData.results.trades.length > 0) {
                progressData.results.trades.forEach((trade: any, index: number) => {
                  console.log(`  Backend Trade ${index}:`, JSON.stringify(trade, null, 2))
                })
              } else {
                console.log('  No trades from backend')
              }
              
              console.log('🚀 MOMENTUM PERIODS FROM BACKEND:')
              if (progressData.results.momentum_periods && progressData.results.momentum_periods.length > 0) {
                progressData.results.momentum_periods.forEach((period: any, index: number) => {
                  console.log(`  Backend Period ${index}:`, JSON.stringify(period, null, 2))
                })
              } else {
                console.log('  No momentum periods from backend')
              }
              
              setBacktestResult(progressData.results)
              setSelectedTickerForBacktest(ticker)
              setProgress(100)
              setBacktestPhase('Completed')
              setIsRunning(false)
            }
            
            // Check if error
            if (progressData.status === 'error') {
              if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current)
                progressIntervalRef.current = null
              }
              throw new Error(progressData.message || 'Backtest failed')
            }
          }
        } catch (error) {
          console.error('Progress check failed:', error)
        }
      }, 2000) // Check every 2 seconds

      // Set a maximum timeout of 10 minutes for very long backtests
      maxTimeoutRef.current = setTimeout(() => {
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current)
          progressIntervalRef.current = null
        }
        setIsRunning(false)
        setBacktestPhase('Timeout')
        setBacktestResult({
          success: false,
          error: 'Backtest is taking longer than expected. Please check the console for progress or try a shorter time period.'
        })
      }, 600000) // 10 minutes
      
    } catch (error) {
      console.error('Backtest failed:', error)
      
      let errorMessage = 'Unknown error occurred'
      if (error instanceof Error) {
        if (error.message.includes('Failed to fetch')) {
          errorMessage = 'Unable to connect to the backend server. Please ensure the backend is running on http://localhost:8000'
        } else {
          errorMessage = error.message
        }
      }
      
      setBacktestResult({
        success: false,
        error: errorMessage
      })
      setBacktestPhase('Error')
      setIsRunning(false)
    }
  }

  // Start multi-symbol backtest
  const startMultiSymbolBacktest = async (symbols: string[], shouldClearLogs: boolean) => {
    setIsRunning(true)
    setProgress(0)
    setCurrentTicker(`Testing ${symbols.length} symbols...`)
    setBacktestResult(null)
    setSelectedTickerForBacktest('')
    setBacktestPhase('Starting multi-symbol backtest...')
    setIsLogConsoleOpen(true)
    setLiveResults(null) // Clear any previous live results

    // Clear logs only if user confirmed
    if (shouldClearLogs) {
      try {
        await fetch('http://localhost:8000/logs', { method: 'DELETE' })
        console.log('✅ Logs cleared for new backtest')
      } catch (error) {
        console.warn('Could not clear logs:', error)
      }
    }

    try {
      // Determine the period to use
      const finalPeriod = useCustomPeriod ? `${customMonths}mo` : period

      // Start multi-symbol backtest
      const startResponse = await fetch('http://localhost:8000/backtest/multi-symbol', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          symbols,
          period: finalPeriod,
          initial_capital: initialCapital
        })
      })

      if (!startResponse.ok) {
        throw new Error(`Failed to start multi-symbol backtest: ${startResponse.status}`)
      }

      const { job_id } = await startResponse.json()
      setJobId(job_id)
      
      // Poll for progress updates
      progressIntervalRef.current = setInterval(async () => {
        try {
          const progressResponse = await fetch(`http://localhost:8000/backtest/progress/${job_id}`)
          
          if (progressResponse.ok) {
            const progressData = await progressResponse.json()
            
            // Update progress
            setProgress(progressData.progress || 0)
            
            // Multi: update symbol and candle-level progress if present
            if (backtestType === 'multi') {
              setSymbolsCompleted(progressData.symbols_completed || 0)
              setSymbolsTotal(progressData.symbols_total || symbols.length)
              setCandleProgress(progressData.candle_progress || 0)
              setCandleTotal(progressData.candle_total || 100)
              
              // Update live results if available
              if (progressData.live_results) {
                setLiveResults(progressData.live_results)
              }
            }
            
            // Update phase and current ticker message
            if (progressData.message) {
              setBacktestPhase(progressData.message)
              setCurrentTicker(progressData.current_symbol || `Multi-symbol: ${progressData.message}`)
            }
            
                          // Stop as soon as backend reports completion
              if (progressData.status === 'completed') {
                if (progressIntervalRef.current) {
                  clearInterval(progressIntervalRef.current)
                  progressIntervalRef.current = null
                }
                if (maxTimeoutRef.current) {
                  clearTimeout(maxTimeoutRef.current)
                  maxTimeoutRef.current = null
                }

                console.log('🚀 Multi-symbol backtest completed:', progressData)

                // Prefer compact combined results if present
                const combined = progressData.results || progressData.combined_results || progressData
                setBacktestResult(combined)
                setSelectedTickerForBacktest('Multi-Symbol Portfolio')
                setProgress(100)
                setBacktestPhase('Completed')
                setIsRunning(false)
                setLiveResults(null) // Clear live results when completed
                return
              }
            
            // Check if error
            if (progressData.status === 'error') {
              if (progressIntervalRef.current) {
                clearInterval(progressIntervalRef.current)
                progressIntervalRef.current = null
              }
              throw new Error(progressData.message || 'Multi-symbol backtest failed')
            }
          }
        } catch (error) {
          console.error('Progress check failed:', error)
        }
      }, 2000) // Check every 2 seconds

      // Optional: previously enforced a 20-minute timeout, now disabled per user request.
      if (maxTimeoutRef.current) {
        clearTimeout(maxTimeoutRef.current)
        maxTimeoutRef.current = null
      }
      
    } catch (error) {
      console.error('Multi-symbol backtest failed:', error)
      
      let errorMessage = 'Unknown error occurred'
      if (error instanceof Error) {
        if (error.message.includes('Failed to fetch')) {
          errorMessage = 'Unable to connect to the backend server. Please ensure the backend is running on http://localhost:8000'
        } else {
          errorMessage = error.message
        }
      }
      
      setBacktestResult({
        success: false,
        error: errorMessage
      })
      setBacktestPhase('Error')
      setIsRunning(false)
    }
  }

  // Handle clear logs dialog response
  const handleClearLogsDialog = (shouldClear: boolean) => {
    setShowClearLogsDialog(false)
    if (pendingBacktest) {
      if (pendingBacktest.ticker.includes(',')) {
        // Multi-symbol backtest
        const symbols = pendingBacktest.ticker.split(',')
        startMultiSymbolBacktest(symbols, shouldClear)
      } else {
        // Single symbol backtest
        startBacktest(pendingBacktest.ticker, shouldClear)
      }
      setPendingBacktest(null)
    }
  }

  // Run backtest for selected symbols
  const runBacktest = async () => {
      const symbols = getSelectedSymbols()
  if (symbols.length === 0) {
    // If data source is watchlist and none loaded yet, try refresh once
    if (dataSource === 'watchlist') {
      await refreshWatchlists?.()
      setWatchlists((providerWatchlists as any) || [])
    }
  }
  if (symbols.length === 0) return

    if (backtestMode === 'momentum') {
      if (backtestType === 'single') {
        if (symbols.length === 1) {
          await runMomentumBacktest(symbols[0])
        } else {
          alert('Single symbol mode requires exactly one symbol. Please select one symbol or switch to multi-symbol mode.')
        }
      } else {
        // Multi-symbol backtesting
        await runMultiSymbolBacktest(symbols)
      }
    } else {
      alert('Other backtest modes coming soon!')
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
    <div className={`p-6 space-y-6 ${isRunning ? 'pb-32' : ''}`}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white">Backtest Engine</h1>
          <p className="text-muted-foreground">Run advanced backtesting simulations</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Configuration */}
        <div className="card-glow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-white">Configuration</h3>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${
                backendStatus === 'connected' ? 'bg-green-500' : 
                backendStatus === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'
              }`}></div>
              <span className={`text-sm ${
                backendStatus === 'connected' ? 'text-green-400' : 
                backendStatus === 'connecting' ? 'text-yellow-400' : 'text-red-400'
              }`}>
                {backendStatus === 'connected' ? 'Backend Connected' : 
                 backendStatus === 'connecting' ? 'Connecting...' : 'Backend Disconnected'}
              </span>
            </div>
          </div>
          
          {backendStatus === 'disconnected' && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg mb-4">
              <p className="text-red-300 text-sm">
                ⚠️ Backend server is not running. Please start the backend server to run backtests.
              </p>
            </div>
          )}
          
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
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => refreshWatchlists?.()}
                            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors text-sm"
                          >
                            Refresh
                          </button>
                          <button
                            onClick={() => window.location.href = '/watchlists'}
                            className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors text-sm"
                          >
                            Create Watchlist
                          </button>
                        </div>
                      </div>
                    ) : (
                      <select 
                        value={selectedWatchlist}
                        onChange={(e) => setSelectedWatchlist(e.target.value)}
                        className="w-full px-4 py-3 bg-card/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500 focus-border-transparent text-white"
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
                    {backtestMode === 'momentum' && backtestType === 'single' && (
                      <p className="text-xs text-yellow-400 mt-2">
                        Note: Single symbol mode will show detailed charts and analysis.
                      </p>
                    )}
                    {backtestMode === 'momentum' && backtestType === 'multi' && (
                      <p className="text-xs text-green-400 mt-2">
                        Note: Multi-symbol mode will test all symbols and provide combined results.
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
                Backtest Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setBacktestType('single')}
                  className={`p-3 rounded-lg text-left transition-all duration-200 ${
                    backtestType === 'single'
                      ? 'bg-purple-500 text-white'
                      : 'bg-card/50 text-muted-foreground hover:bg-card/70 hover:text-white'
                  }`}
                >
                  <div className="font-medium text-sm">Single Symbol</div>
                  <div className="text-xs opacity-75">Test one symbol with charts</div>
                </button>
                <button
                  onClick={() => setBacktestType('multi')}
                  className={`p-3 rounded-lg text-left transition-all duration-200 ${
                    backtestType === 'multi'
                      ? 'bg-purple-500 text-white'
                      : 'bg-card/50 text-muted-foreground hover:bg-card/70 hover:text-white'
                  }`}
                >
                  <div className="font-medium text-sm">Multi-Symbol</div>
                  <div className="text-xs opacity-75">Test multiple symbols with combined results</div>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">
                Historical Data Period
              </label>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    id="preset-period"
                    checked={!useCustomPeriod}
                    onChange={() => setUseCustomPeriod(false)}
                    className="text-purple-500"
                  />
                  <label htmlFor="preset-period" className="text-sm text-white">Preset Periods</label>
                </div>
                
                {!useCustomPeriod && (
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
                )}
                
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    id="custom-period"
                    checked={useCustomPeriod}
                    onChange={() => setUseCustomPeriod(true)}
                    className="text-purple-500"
                  />
                  <label htmlFor="custom-period" className="text-sm text-white">Custom Period</label>
                </div>
                
                {useCustomPeriod && (
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      value={customMonths}
                      onChange={(e) => setCustomMonths(Number(e.target.value))}
                      min={1}
                      max={60}
                      className="w-20 px-3 py-2 bg-card/50 border border-white/10 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white text-center"
                    />
                    <span className="text-sm text-muted-foreground">months back</span>
                    <span className="text-xs text-purple-400">
                      ({customMonths} month{customMonths !== 1 ? 's' : ''} of historical data)
                    </span>
                  </div>
                )}
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
          disabled={selectedSymbols.length === 0 || !selectedStrategy || isRunning || backendStatus === 'disconnected'}
          className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-xl font-medium transition-all duration-200 shadow-lg hover:shadow-purple-500/25 text-lg"
        >
          {isRunning ? (
            <>
              <RefreshCw className="h-6 w-6 animate-spin" />
              {backtestType === 'multi' ? 'Running Multi-Symbol Backtest...' : 'Running Backtest...'}
            </>
          ) : (
            <>
              <Play className="h-6 w-6" />
              {backtestType === 'multi' ? `Run Multi-Symbol Backtest (${selectedSymbols.length} symbols)` : 'Run Backtest'}
            </>
          )}
        </button>
      </div>

      {/* Log Console Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {isRunning && (
            <div className="flex items-center gap-2 text-sm">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-500"></div>
              <span className="text-muted-foreground">Testing {currentTicker}...</span>
            </div>
          )}
        </div>
        
        <button
          onClick={() => setIsLogConsoleOpen(!isLogConsoleOpen)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
            isLogConsoleOpen 
              ? 'bg-purple-600 text-white' 
              : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
          }`}
        >
          <Terminal className="w-4 h-4" />
          {isLogConsoleOpen ? 'Hide Logs' : 'Show Live Logs'}
        </button>
      </div>

      {/* Error Display */}
      {backtestResult && !backtestResult.success && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
          <h3 className="text-red-400 font-medium mb-2">Backtest Failed</h3>
          <p className="text-red-300 text-sm">{backtestResult.error}</p>
        </div>
      )}

      {/* Results Section */}
      {(backtestType === 'multi' || (backtestResult && backtestResult.success && backtestResult.results)) && (
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white">{isRunning && backtestType === 'multi' ? 'Backtest Running' : 'Backtest Complete'}</h2>
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
  
          {/* Multi-Symbol Results always visible during multi mode */}
          {backtestType === 'multi' ? (
            <MultiSymbolResults
              results={liveResults || backtestResult}
              initialCapital={initialCapital}
              period={useCustomPeriod ? `${customMonths} months` : period}
              isRunning={isRunning}
              progress={progress}
              symbolsCompleted={symbolsCompleted}
              symbolsTotal={symbolsTotal}
              candleProgress={candleProgress}
            />
          ) : (
            /* Single Symbol Visual Chart */
            backtestResult.price_data && (
              <>
                {/* Debug logs elided */}
                <Smooth30DayScroller
                  priceData={backtestResult.price_data}
                  trades={backtestResult.trades || []}
                  momentumPeriods={backtestResult.momentum_periods || []}
                  ticker={selectedTickerForBacktest}
                />
              </>
            )
          )}

          {/* Performance Results - Only for single symbol */}
          {backtestType === 'single' && (
            <>
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
            </>
          )}
        </div>
       )}

      {/* Log Console */}
      <LogConsole 
        isOpen={isLogConsoleOpen} 
        onClose={() => setIsLogConsoleOpen(false)}
        height={logsHeight}
        onHeightChange={setLogsHeight}
        backtestStatus={{
          isRunning,
          progress,
          currentTicker,
          phase: backtestPhase
        }}
      />

      {/* Progress Bar Section - Always at bottom */}
      {isRunning && backtestType !== 'multi' && (
        <div className="fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur-sm border-t border-gray-700 z-40 p-4 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium text-white">Backtest in Progress</span>
              </div>
              <span className="text-sm text-gray-400">{currentTicker}</span>
            </div>
            <div className="text-sm text-gray-400">
              {progress.toFixed(1)}% Complete
            </div>
          </div>
          
          {/* Progress Bars */}
          <div className="w-full bg-gray-700 rounded-full h-3 mb-3">
            <div 
              className="bg-gradient-to-r from-blue-500 to-purple-500 h-3 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          
          {/* Phase Display */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-300">{backtestPhase}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsLogConsoleOpen(!isLogConsoleOpen)}
                className="text-xs px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
              >
                {isLogConsoleOpen ? 'Hide Logs' : 'Show Logs'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Logs Confirmation Dialog */}
      {showClearLogsDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-white mb-4">Clear Logs Before Backtest?</h3>
            <p className="text-gray-300 mb-6">
              You have existing logs. Would you like to clear them before starting the new backtest for <strong>{pendingBacktest?.ticker}</strong>?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => handleClearLogsDialog(false)}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Keep Logs
              </button>
              <button
                onClick={() => handleClearLogsDialog(true)}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                Clear Logs
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 