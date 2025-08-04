'use client'

import { useState, useEffect } from 'react'
import { Search, Filter, Plus, Play, Edit, Trash2, Loader2, TrendingUp, Shield, BarChart3, Info, Star, CheckCircle, XCircle, Target, Zap, Eye, Download, Maximize2, Minimize2, X, Bookmark, CheckSquare, Square } from 'lucide-react'
import StockChart from '../../components/StockChart'
import WatchlistButton from '../../components/WatchlistButton'
import { useWatchlist } from '../providers/WatchlistProvider'
import { useScreener } from '../providers/ScreenerProvider'

interface ScreenResult {
  symbol: string
  criteria_met: Record<string, boolean>
  total_met: number
  pattern_strength: string
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

interface MomentumCriteria {
  // Criterion 1: Large percentage move
  days_large_move: number
  pct_large_move: number

  // Criteria 2 & 3: Consolidation pattern  
  min_consol_days: number
  max_consol_days: number
  max_range_pct: number
  below_avg_volume: boolean
  below_avg_range: boolean

  // Criterion 4: MA10 tolerance
  ma10_tolerance_pct: number

  // Criterion 7: Reconsolidation after breakout
  reconsol_days: number
  reconsol_volume_pct: number

  // Criterion 8 & 9: Technical analysis
  linear_r2_threshold: number
  avoid_barcode_max_avgrange: number
}

interface MomentumAnalysisResult {
  symbol: string
  pattern_found: boolean
  confidence_score: number
  analysis_report: string | null
  chart_image_base64: string | null
  criteria_details: MomentumCriteria | null
  total_criteria_met: number
  pattern_strength: string
  criteria_met?: Record<string, boolean>  // New field for individual criteria results
}

export default function Screeners() {
  // Watchlist functionality is now handled by WatchlistButton component
  const { 
    results, 
    setResults, 
    clearResults, 
    lastScreenerParams, 
    setLastScreenerParams,
    selectedStocks,
    allSelected,
    toggleStockSelection,
    toggleSelectAll,
    selectAllStocks,
    deselectAllStocks,
    clearSelection,
    loading,
    setLoading,
    setError: setScreenerError
  } = useScreener()
  
  const { watchlists, addToWatchlist, createWatchlist: createWatchlistProvider } = useWatchlist()
  
  const [screenerType, setScreenerType] = useState<'momentum' | 'volatility' | null>(null)
  const [error, setError] = useState('')
  const [selectedStock, setSelectedStock] = useState<StockData | null>(null)
  const [showAnalysis, setShowAnalysis] = useState(false)
  const [analysisData, setAnalysisData] = useState<any>(null)
  
  // New state for momentum analysis
  const [momentumAnalysis, setMomentumAnalysis] = useState<MomentumAnalysisResult | null>(null)
  const [showMomentumModal, setShowMomentumModal] = useState(false)
  const [analyzingSymbol, setAnalyzingSymbol] = useState('')
  const [customSymbols, setCustomSymbols] = useState('')
  const [minCriteria, setMinCriteria] = useState(3)
  const [topN, setTopN] = useState(20)
  const [period, setPeriod] = useState('6mo')
  
  // Advanced criteria parameters
  const [minPercentageMove, setMinPercentageMove] = useState(30.0)
  const [maxConsolidationRange, setMaxConsolidationRange] = useState(10.0)
  const [narrowRangeMultiplier, setNarrowRangeMultiplier] = useState(0.7)
  const [volumeSpikeThreshold, setVolumeSpikeThreshold] = useState(1.5)
  const [hodDistanceThreshold, setHodDistanceThreshold] = useState(0.05)
  const [smaDistanceThreshold, setSmaDistanceThreshold] = useState(15.0)
  const [correlationThreshold, setCorrelationThreshold] = useState(0.7)
  const [volatilityThreshold, setVolatilityThreshold] = useState(0.05)
  const [requireAllSma, setRequireAllSma] = useState(true)
  const [requireBothMaTrending, setRequireBothMaTrending] = useState(true)
  const [enabledCriteria, setEnabledCriteria] = useState([1,2,3,4])
  const [fallbackEnabled, setFallbackEnabled] = useState(true)
  const [showAdvancedControls, setShowAdvancedControls] = useState(false)
  
  // Progress tracking state
  const [showProgress, setShowProgress] = useState(false)
  const [progressPercent, setProgressPercent] = useState(0)
  
  // Modal state
  const [showWatchlistModal, setShowWatchlistModal] = useState(false)
  const [showCreateWatchlistModal, setShowCreateWatchlistModal] = useState(false)
  const [newWatchlistName, setNewWatchlistName] = useState('')
  const [newWatchlistDescription, setNewWatchlistDescription] = useState('')
  const [progressMessage, setProgressMessage] = useState('')
  const [currentSymbol, setCurrentSymbol] = useState('')
  const [isMinimized, setIsMinimized] = useState(false)
  const [abortController, setAbortController] = useState<AbortController | null>(null)
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(50)
  const [allResults, setAllResults] = useState<ScreenResult[]>([])

  // Watchlist functionality moved to WatchlistButton component

  // Load previous screening parameters on mount
  useEffect(() => {
    if (lastScreenerParams) {
      setCustomSymbols(lastScreenerParams.customSymbols || '')
      setMinPercentageMove(lastScreenerParams.minPercentageMove || 30.0)
      setMaxConsolidationRange(lastScreenerParams.maxConsolidationRange || 10.0)
      setCorrelationThreshold(lastScreenerParams.correlationThreshold || 0.7)
      setVolatilityThreshold(lastScreenerParams.volatilityThreshold || 0.05)
      setMinCriteria(lastScreenerParams.minCriteria || 3)
      setTopN(lastScreenerParams.topN || 20)
      setPeriod(lastScreenerParams.period || '6mo')
      setScreenerType(lastScreenerParams.type || null)
    }
  }, [lastScreenerParams])

  // Handle Escape key to close modals
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowMomentumModal(false)
        setSelectedStock(null)
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  const runScreener = async (type: 'momentum' | 'volatility') => {
    setLoading(true)
    setError('')
    setScreenerError(null)
    setScreenerType(type)
    setResults([])
    clearSelection()
    
    // Setup progress tracking
    setShowProgress(true)
    setProgressPercent(0)
    setProgressMessage('Initializing screener...')
    setCurrentSymbol('')
    setIsMinimized(false)
    
    // Create abort controller for cancellation
    const controller = new AbortController()
    setAbortController(controller)
    
    try {
      if (type === 'momentum') {
        // Save screening parameters for persistence
        const screeningParams = {
          type,
          customSymbols,
          minPercentageMove,
          maxConsolidationRange,
          correlationThreshold,
          volatilityThreshold,
          minCriteria,
          topN,
          period
        }
        setLastScreenerParams(screeningParams)
        // Use new streaming momentum screening API
        const symbols = customSymbols.trim() 
          ? customSymbols.split(',').map(s => s.trim().toUpperCase())
          : undefined // Let backend use full stock list
        
        const requestBody = {
          symbols: symbols,
          criteria: {
            days_large_move: 30,
            pct_large_move: minPercentageMove / 100, // Convert percentage to decimal
            min_consol_days: 3,
            max_consol_days: 15,
            max_range_pct: maxConsolidationRange / 100,
            below_avg_volume: true,
            below_avg_range: true,
            ma10_tolerance_pct: 0.05,
            reconsol_days: 3,
            reconsol_volume_pct: 0.8,
            linear_r2_threshold: correlationThreshold,
            avoid_barcode_max_avgrange: volatilityThreshold
          }
        }

        // Use streaming endpoint for real-time progress
        const response = await fetch('http://localhost:8000/screen_momentum_stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        })
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        
        const reader = response.body?.getReader()
        const decoder = new TextDecoder()
        const results: ScreenResult[] = []
        let buffer = ''
        
            // Reset pagination when starting new screening
    setCurrentPage(1)
    setAllResults([])
    setResults([])
        
        if (reader) {
          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              
              buffer += decoder.decode(value, { stream: true })
              const lines = buffer.split('\n')
              
              // Keep the last line in buffer as it might be incomplete
              buffer = lines.pop() || ''
              
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const data = JSON.parse(line.slice(6))
                    console.log('Received SSE data:', data) // Debug log
                    
                    if (data.type === 'progress') {
                      setProgressPercent(data.percent)
                      setProgressMessage(data.message)
                      setCurrentSymbol(data.current_symbol || '')
                    } else if (data.type === 'result') {
                      results.push(data.result)
                      // Auto-sort results by criteria met (descending) and pattern strength
                      const sortedResults = [...results].sort((a, b) => {
                        if (a.total_met !== b.total_met) {
                          return b.total_met - a.total_met // Higher criteria met first
                        }
                        // If same criteria met, sort by pattern strength
                        const strengthOrder = { 'Strong': 3, 'Moderate': 2, 'Weak': 1, 'Very Weak': 0 }
                        return strengthOrder[b.pattern_strength as keyof typeof strengthOrder] - strengthOrder[a.pattern_strength as keyof typeof strengthOrder]
                      })
                      setAllResults(sortedResults)
                      setResults(sortedResults.slice(0, itemsPerPage)) // Show first page
                    } else if (data.type === 'complete') {
                      setProgressMessage('Screening completed!')
                      setProgressPercent(100)
                      generateAnalysis(allResults, type)
                    } else if (data.type === 'error') {
                      console.error('Screening error:', data.error)
                    }
                  } catch (e) {
                    console.error('Error parsing SSE data:', e, 'Line:', line)
                  }
                }
              }
            }
          } catch (error: any) {
            if (error.name === 'AbortError') {
              console.log('Screening was cancelled')
            } else {
              throw error
            }
          }
        }
        
      } else {
        // Use existing volatility screening API
        let queryParams = new URLSearchParams({
          period: period,
          top_n: topN.toString()
        })

        if (customSymbols.trim()) {
          queryParams.append('symbols', customSymbols.trim())
        }

        const response = await fetch(`http://localhost:8000/screen/low_volatility?${queryParams}`)
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        
        const data = await response.json()
        setAllResults(data)
        setResults(data.slice(0, itemsPerPage))
        generateAnalysis(data, type)
      }
      
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Screening was cancelled')
      } else {
        setError(`Failed to run screener: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
      setResults([])
    } finally {
      setLoading(false)
      // Hide progress popup after a short delay to show completion
      setTimeout(() => {
        setShowProgress(false)
        setProgressPercent(0)
        setProgressMessage('')
        setCurrentSymbol('')
        setAbortController(null)
      }, 500)
    }
  }

  const generateAnalysis = (data: ScreenResult[], type: 'momentum' | 'volatility') => {
    if (type === 'momentum') {
      // For momentum screening, use total_met as the value
      const avgValue = data.reduce((sum, item) => sum + item.total_met, 0) / data.length
      const maxValue = Math.max(...data.map(item => item.total_met))
      const minValue = Math.min(...data.map(item => item.total_met))
      
      setAnalysisData({
        type,
        totalStocks: data.length,
        averageValue: avgValue,
        maxValue,
        minValue,
        topPerformer: data[0],
        worstPerformer: data[data.length - 1],
        positiveCount: data.filter(item => item.total_met >= 3).length,
        negativeCount: data.filter(item => item.total_met < 3).length,
        strongPatterns: data.filter(item => item.pattern_strength === 'Strong').length,
        moderatePatterns: data.filter(item => item.pattern_strength === 'Moderate').length,
        weakPatterns: data.filter(item => item.pattern_strength === 'Weak').length
      })
    } else {
      // For volatility screening, use the original value property (if it exists)
      const avgValue = data.reduce((sum, item) => sum + (item as any).value, 0) / data.length
      const maxValue = Math.max(...data.map(item => (item as any).value))
      const minValue = Math.min(...data.map(item => (item as any).value))
      
      setAnalysisData({
        type,
        totalStocks: data.length,
        averageValue: avgValue,
        maxValue,
        minValue,
        topPerformer: data[0],
        worstPerformer: data[data.length - 1],
        positiveCount: 0,
        negativeCount: 0,
        strongPatterns: 0,
        moderatePatterns: 0,
        weakPatterns: 0
      })
    }
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

  const analyzeMomentumPattern = async (symbol: string) => {
    setAnalyzingSymbol(symbol)
    setMomentumAnalysis(null)
    setShowMomentumModal(true)
    
    try {
              const response = await fetch(`http://localhost:8000/analyze/momentum_pattern/${symbol}?period=1y`)
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const data = await response.json()
      console.log('Momentum analysis data received:', {
        symbol: data.symbol,
        hasChart: !!data.chart_image_base64,
        chartLength: data.chart_image_base64?.length || 0,
        criteriaMet: data.criteria_met,
        chartPreview: data.chart_image_base64?.substring(0, 200) || 'No chart data'
      })
      setMomentumAnalysis(data)
      
    } catch (err) {
      setError(`Failed to analyze momentum pattern: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setAnalyzingSymbol('')
    }
  }

  const formatValue = (result: ScreenResult, type: 'momentum' | 'volatility') => {
    if (type === 'momentum') {
      return `${result.total_met}/4 criteria met`
    } else {
      // For volatility, use the value property if it exists
      const value = (result as any).value || 0
      return `${(value * 100).toFixed(2)}%`
    }
  }

  const getPatternStrengthColor = (strength: string) => {
    switch (strength) {
      case 'Strong': return 'text-green-400'
      case 'Moderate': return 'text-yellow-400'
      case 'Weak': return 'text-orange-400'
      default: return 'text-gray-400'
    }
  }

  const getAnalysisText = () => {
    if (!analysisData) return ''
    
    const { type, totalStocks, averageValue, topPerformer, worstPerformer, strongPatterns, moderatePatterns, weakPatterns } = analysisData
    
    // Fix: If no results, avoid accessing properties of undefined
    if (!topPerformer || !worstPerformer) {
      return 'No results to analyze.'
    }
    
    if (type === 'momentum') {
      return `Screened ${totalStocks} stocks using 5 Star Trading Setup criteria. Average criteria met: ${averageValue.toFixed(1)}/4. 
      Pattern strength distribution: ${strongPatterns} Strong, ${moderatePatterns} Moderate, ${weakPatterns} Weak patterns found. 
      Top performer: ${topPerformer.symbol} (${topPerformer.total_met}/4 criteria met, ${topPerformer.pattern_strength} pattern).`
    } else {
      return `Screened ${totalStocks} stocks for volatility. Average volatility: ${(averageValue * 100).toFixed(2)}%. 
      Lowest volatility: ${topPerformer.symbol} (${(topPerformer.value * 100).toFixed(2)}%), 
      Highest: ${worstPerformer.symbol} (${(worstPerformer.value * 100).toFixed(2)}%).`
    }
  }

  const downloadReport = () => {
    if (!momentumAnalysis) return
    
    const reportData = {
      symbol: momentumAnalysis.symbol,
      analysis_date: new Date().toISOString(),
      pattern_found: momentumAnalysis.pattern_found,
      confidence_score: momentumAnalysis.confidence_score,
      pattern_strength: momentumAnalysis.pattern_strength,
      criteria_met: momentumAnalysis.total_criteria_met,
      analysis_report: momentumAnalysis.analysis_report,
      criteria_details: momentumAnalysis.criteria_details
    }
    
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${momentumAnalysis.symbol}_momentum_analysis_${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Pagination functions
  const totalPages = Math.ceil(allResults.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const currentResults = allResults.slice(startIndex, endIndex)

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    setResults(allResults.slice((page - 1) * itemsPerPage, page * itemsPerPage))
  }

  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage)
    setCurrentPage(1) // Reset to first page
    setResults(allResults.slice(0, newItemsPerPage))
  }

  // Watchlist functions - now handled by context

  const addStocksToWatchlist = async (watchlistId: string) => {
    const symbolsToAdd = Array.from(selectedStocks)
    
    try {
      // Add each symbol to the watchlist
      for (const symbol of symbolsToAdd) {
        await addToWatchlist(symbol, watchlistId)
      }
      
      setShowWatchlistModal(false)
      clearSelection()
    } catch (error) {
      console.error('Error adding stocks to watchlist:', error)
    }
  }

  const createWatchlist = async () => {
    if (!newWatchlistName.trim()) return

    try {
      const newWatchlist = await createWatchlistProvider(newWatchlistName.trim(), newWatchlistDescription.trim())
      
      if (newWatchlist) {
        // Add selected stocks to the new watchlist
        const symbolsToAdd = Array.from(selectedStocks)
        for (const symbol of symbolsToAdd) {
          await addToWatchlist(symbol, newWatchlist.id)
        }
        
        setNewWatchlistName('')
        setNewWatchlistDescription('')
        setShowCreateWatchlistModal(false)
        clearSelection()
      }
    } catch (error) {
      console.error('Error creating watchlist:', error)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Advanced Momentum Screeners</h1>
          <p className="text-muted-foreground">5 Star Trading Setup Pattern Analysis & Screening</p>
        </div>
        <button className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 rounded-xl font-medium transition-all duration-200 shadow-lg hover:shadow-purple-500/25">
          <Plus className="h-5 w-5" />
          New Screener
        </button>
      </div>

      {/* Advanced Controls */}
      <div className="card-glow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Screening Parameters</h2>
          <button
            onClick={() => setShowAdvancedControls(!showAdvancedControls)}
            className="flex items-center gap-2 px-3 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg transition-colors"
          >
            <Filter className="h-4 w-4" />
            {showAdvancedControls ? 'Hide Advanced' : 'Show Advanced'}
          </button>
        </div>
        
        {/* Basic Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">Period</label>
            <select 
              value={period} 
              onChange={(e) => setPeriod(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
            >
              <option value="3mo">3 Months</option>
              <option value="6mo">6 Months</option>
              <option value="1y">1 Year</option>
              <option value="2y">2 Years</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">Top Results</label>
            <input 
              type="number" 
              value={topN} 
              onChange={(e) => setTopN(parseInt(e.target.value) || 20)}
              min="5" max="100" 
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">Min Criteria (out of 4)</label>
            <input 
              type="number" 
              value={minCriteria} 
              onChange={(e) => setMinCriteria(parseInt(e.target.value) || 3)}
              min="1" max="4" 
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">Custom Symbols (optional)</label>
            <input 
              type="text" 
              value={customSymbols} 
              onChange={(e) => setCustomSymbols(e.target.value)}
              placeholder="AAPL,MSFT,GOOGL"
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
            />
          </div>
        </div>

        {/* Advanced Controls */}
        {showAdvancedControls && (
          <div className="border-t border-gray-700 pt-6">
            <h3 className="text-lg font-semibold text-white mb-4">5 Star Trading Setup Criteria</h3>
            
            {/* Criteria Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-muted-foreground mb-3">Enabled Criteria</label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: 1, name: "Large Momentum Move (LOW to HIGH ≥3x ADR)" },
                  { id: 2, name: "Multi-Phase Consolidation Analysis" },
                  { id: 3, name: "Current Price Above 50-Day Moving Average" },
                  { id: 4, name: "Optimal Volatility Range (3-20% ADR)" }
                ].map((criterion) => (
                  <label key={criterion.id} className="flex items-center gap-2 text-sm text-gray-300">
                    <input
                      type="checkbox"
                      checked={enabledCriteria.includes(criterion.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setEnabledCriteria([...enabledCriteria, criterion.id])
                        } else {
                          setEnabledCriteria(enabledCriteria.filter(id => id !== criterion.id))
                        }
                      }}
                      className="rounded bg-gray-800 border-gray-600 text-purple-500"
                    />
                    {criterion.name}
                  </label>
                ))}
              </div>
            </div>

            {/* Thresholds Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  ADR Multiplier for Momentum Move <span className="text-xs">(Criterion 1)</span>
                </label>
                <input 
                  type="number" 
                  value={3} 
                  onChange={() => {}} // Fixed at 3x ADR
                  min="2" max="5" step="0.5"
                  disabled
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-400"
                />
                <div className="text-xs text-gray-500 mt-1">
                  Fixed at 3x ADR (LOW to HIGH calculation)
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  Consolidation Analysis <span className="text-xs">(Criterion 2)</span>
                </label>
                <div className="text-xs text-muted-foreground mb-2">
                  • ≥3 candles • Lower volume vs move period
                </div>
                <div className="text-xs text-muted-foreground">
                  • Lower ADR vs move • Price stability ≤1.5% ADR
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  (Automated multi-phase detection)
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  50 SMA Requirement <span className="text-xs">(Criterion 3)</span>
                </label>
                <div className="text-xs text-muted-foreground mb-2">
                  Current close price must be above 50-day SMA
                </div>
                <div className="text-xs text-gray-500">
                  (Automated trend confirmation check)
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  ADR Range Limits <span className="text-xs">(Criterion 4)</span>
                </label>
                <div className="text-xs text-muted-foreground mb-2">
                  Minimum: 3.0% ADR • Maximum: 20.0% ADR
                </div>
                <div className="text-xs text-gray-500">
                  (Optimal volatility range for momentum patterns)
                </div>
              </div>
            </div>

            {/* Analysis Options */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex items-center gap-3 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={true}
                  onChange={() => {}} // Always enabled for new system
                  disabled
                  className="rounded bg-gray-700 border-gray-600 text-purple-400"
                />
                <span className="text-gray-400">Use 50 SMA Trend Filter (Always On)</span>
              </label>
              <label className="flex items-center gap-3 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={fallbackEnabled}
                  onChange={(e) => setFallbackEnabled(e.target.checked)}
                  className="rounded bg-gray-800 border-gray-600 text-purple-500"
                />
                Enable Fallback Mode (3/4 instead of 4/4 criteria)
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Analysis Panel */}
      {analysisData && (
        <div className="card-glow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">
              {screenerType === 'momentum' ? '5 Star Momentum Pattern' : 'Low Volatility'} Analysis
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
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-4 bg-gray-800/50 rounded-lg">
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">Total Stocks</h3>
                  <p className="text-2xl font-bold text-white">{analysisData.totalStocks}</p>
                </div>
                <div className="p-4 bg-gray-800/50 rounded-lg">
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">
                    {screenerType === 'momentum' ? 'Avg Confidence' : 'Average Volatility'}
                  </h3>
                  <p className="text-2xl font-bold text-white">
                    {screenerType === 'momentum' 
                      ? `${analysisData.averageValue.toFixed(1)}%`
                      : `${(analysisData.averageValue * 100).toFixed(2)}%`
                    }
                  </p>
                </div>
                {screenerType === 'momentum' && (
                  <>
                    <div className="p-4 bg-gray-800/50 rounded-lg">
                      <h3 className="text-sm font-medium text-muted-foreground mb-2">Strong Patterns</h3>
                      <p className="text-2xl font-bold text-green-400">{analysisData.strongPatterns}</p>
                    </div>
                    <div className="p-4 bg-gray-800/50 rounded-lg">
                      <h3 className="text-sm font-medium text-muted-foreground mb-2">Moderate Patterns</h3>
                      <p className="text-2xl font-bold text-yellow-400">{analysisData.moderatePatterns}</p>
                    </div>
                  </>
                )}
                {screenerType === 'volatility' && (
                  <div className="p-4 bg-gray-800/50 rounded-lg">
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">Lowest Volatility</h3>
                    <p className="text-lg font-bold text-green-400">{analysisData.topPerformer.symbol}</p>
                    <p className="text-sm text-muted-foreground">
                      {(analysisData.topPerformer.value * 100).toFixed(2)}%
                    </p>
                  </div>
                )}
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
      {allResults.length > 0 && (
        <div className="card-glow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">
              {screenerType === 'momentum' ? '5 Star Momentum Patterns' : 'Low Volatility'} Results
            </h2>
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">
                {allResults.length} total results
              </span>
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground">Show:</label>
                <select 
                  value={itemsPerPage} 
                  onChange={(e) => handleItemsPerPageChange(parseInt(e.target.value))}
                  className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-white"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={allResults.length}>All</option>
                </select>
                <span className="text-sm text-muted-foreground">per page</span>
              </div>
            </div>
          </div>

          {/* Watchlist Actions */}
          {selectedStocks.size > 0 && (
            <div className="mb-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setShowWatchlistModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg transition-colors"
                >
                  <Bookmark className="h-4 w-4" />
                  Add to Watchlist
                </button>
                <button
                  onClick={clearSelection}
                  className="text-sm text-muted-foreground hover:text-white transition-colors"
                >
                  Clear Selection
                </button>
              </div>
            </div>
          )}

          {/* Selection Controls */}
          <div className="mb-4 flex items-center gap-4">
            <button
              onClick={toggleSelectAll}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                allSelected
                  ? 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
                  : 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
              }`}
            >
              {allSelected ? (
                <>
                  <Square className="h-4 w-4" />
                  Deselect All
                </>
              ) : (
                <>
                  <CheckSquare className="h-4 w-4" />
                  Select All
                </>
              )}
            </button>
            {selectedStocks.size > 0 && (
              <span className="text-sm text-muted-foreground">
                {selectedStocks.size} of {allResults.length} selected
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left p-3 text-muted-foreground font-medium">
                    Select
                  </th>
                  <th className="text-left p-3 text-muted-foreground font-medium">Rank</th>
                  <th className="text-left p-3 text-muted-foreground font-medium">Symbol</th>
                  <th className="text-left p-3 text-muted-foreground font-medium">Company</th>
                  <th className="text-left p-3 text-muted-foreground font-medium">
                    {screenerType === 'momentum' ? 'Confidence' : 'Volatility'}
                  </th>
                  {screenerType === 'momentum' && (
                    <th className="text-left p-3 text-muted-foreground font-medium">Pattern</th>
                  )}
                  <th className="text-center p-3 text-muted-foreground font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {currentResults.map((result, index) => (
                  <tr key={result.symbol} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={selectedStocks.has(result.symbol)}
                        onChange={() => toggleStockSelection(result.symbol)}
                        className="rounded border-gray-600 bg-gray-800 text-purple-500 focus:ring-purple-500"
                      />
                    </td>
                    <td className="p-3 text-white font-medium">#{startIndex + index + 1}</td>
                    <td className="p-3 text-white font-mono">{result.symbol}</td>
                    <td className="p-3 text-muted-foreground">{result.name || result.symbol}</td>
                    <td className={`p-3 font-medium ${
                      screenerType === 'momentum' 
                        ? result.total_met >= 4 ? 'text-green-400' : result.total_met >= 3 ? 'text-yellow-400' : 'text-orange-400'
                        : 'text-blue-400'
                    }`}>
                      {formatValue(result, screenerType!)}
                    </td>
                    {screenerType === 'momentum' && (
                      <td className={`p-3 font-medium ${getPatternStrengthColor(result.pattern_strength || '')}`}>
                        <div className="flex items-center gap-1">
                          <Star className="h-4 w-4" />
                          {result.pattern_strength}
                        </div>
                      </td>
                    )}
                    <td className="p-3">
                      <div className="flex gap-2">
                        <button 
                          onClick={() => fetchStockData(result.symbol)}
                          className="px-3 py-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded text-sm transition-colors"
                        >
                          Chart
                        </button>
                        {screenerType === 'momentum' && (
                          <button 
                            onClick={() => analyzeMomentumPattern(result.symbol)}
                            className="px-3 py-1 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded text-sm transition-colors"
                          >
                            Analyze
                          </button>
                        )}
                        <WatchlistButton symbol={result.symbol} size="md" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-700">
              <div className="text-sm text-muted-foreground">
                Showing {startIndex + 1} to {Math.min(endIndex, allResults.length)} of {allResults.length} results
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded text-sm transition-colors"
                >
                  Previous
                </button>
                <span className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded text-sm transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Momentum Analysis Modal */}
      {showMomentumModal && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9000] p-4"
          onClick={() => setShowMomentumModal(false)}
        >
          <div 
            className="bg-gray-900 rounded-xl w-full max-w-6xl max-h-[95vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-semibold text-white">5 Star Momentum Pattern Analysis</h2>
                  <p className="text-muted-foreground">
                    {momentumAnalysis ? momentumAnalysis.symbol : analyzingSymbol || 'Loading...'}
                  </p>
                </div>
                <div className="flex gap-2">
                  {momentumAnalysis && (
                    <button 
                      onClick={downloadReport}
                      className="flex items-center gap-2 px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg transition-colors"
                    >
                      <Download className="h-4 w-4" />
                      Export
                    </button>
                  )}
                  <button 
                    onClick={() => setShowMomentumModal(false)}
                    className="text-gray-400 hover:text-white text-xl font-bold w-8 h-8 rounded-lg hover:bg-gray-800"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {analyzingSymbol && !momentumAnalysis && (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <Loader2 className="h-12 w-12 animate-spin text-purple-400 mx-auto mb-4" />
                    <p className="text-white text-lg">Analyzing momentum pattern...</p>
                    <p className="text-muted-foreground">This may take a few moments</p>
                  </div>
                </div>
              )}

              {momentumAnalysis && (
                <div className="space-y-6">
                  {/* Pattern Summary */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="p-4 bg-gray-800/50 rounded-lg">
                      <h3 className="text-sm font-medium text-muted-foreground mb-2">Pattern Found</h3>
                      <div className="flex items-center gap-2">
                        {momentumAnalysis.pattern_found ? (
                          <CheckCircle className="h-6 w-6 text-green-400" />
                        ) : (
                          <XCircle className="h-6 w-6 text-red-400" />
                        )}
                        <p className={`text-lg font-bold ${momentumAnalysis.pattern_found ? 'text-green-400' : 'text-red-400'}`}>
                          {momentumAnalysis.pattern_found ? 'YES' : 'NO'}
                        </p>
                      </div>
                    </div>
                    <div className="p-4 bg-gray-800/50 rounded-lg">
                      <h3 className="text-sm font-medium text-muted-foreground mb-2">Confidence Score</h3>
                      <p className="text-2xl font-bold text-white">{momentumAnalysis.confidence_score.toFixed(1)}%</p>
                    </div>
                    <div className="p-4 bg-gray-800/50 rounded-lg">
                      <h3 className="text-sm font-medium text-muted-foreground mb-2">Pattern Strength</h3>
                      <p className={`text-lg font-bold ${getPatternStrengthColor(momentumAnalysis.pattern_strength)}`}>
                        {momentumAnalysis.pattern_strength}
                      </p>
                    </div>
                    <div className="p-4 bg-gray-800/50 rounded-lg">
                      <h3 className="text-sm font-medium text-muted-foreground mb-2">Criteria Met</h3>
                      <p className="text-2xl font-bold text-white">{momentumAnalysis.total_criteria_met}/4</p>
                    </div>
                  </div>

                  {/* Interactive Chart */}
                  {momentumAnalysis.chart_image_base64 && (
                    <div className="card-glow p-6">
                      <h3 className="text-lg font-semibold text-white mb-4">Interactive Technical Analysis Chart</h3>
                      <div className="bg-gray-900 rounded-lg p-2 overflow-hidden">
                        <iframe
                          srcDoc={momentumAnalysis.chart_image_base64}
                          className="w-full"
                          style={{ 
                            minHeight: '600px', 
                            border: 'none',
                            backgroundColor: 'transparent'
                          }}
                          title={`${momentumAnalysis.symbol} Momentum Analysis Chart`}
                          sandbox="allow-scripts allow-same-origin"
                        />
                        {/* Debug info */}
                        <div className="text-xs text-gray-500 mt-2">
                          Chart data length: {momentumAnalysis.chart_image_base64?.length || 0} characters
                          {momentumAnalysis.chart_image_base64 && (
                            <div>
                              Preview: {momentumAnalysis.chart_image_base64.substring(0, 100)}...
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="mt-4 text-sm text-muted-foreground">
                        <p>• Interactive chart with SMA10, SMA20, and SMA50 moving averages</p>
                        <p>• Hover over lines for detailed price information</p>
                        <p>• Zoom, pan, and download chart functionality available</p>
                        <p>• Green/red candlesticks show daily price action</p>
                      </div>
                    </div>
                  )}

                  {/* Criteria Breakdown */}
                  {momentumAnalysis.criteria_met && (
                    <div className="card-glow p-6">
                      <h3 className="text-lg font-semibold text-white mb-4">5 Star Trading Setup Criteria Analysis</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {Object.entries(momentumAnalysis.criteria_met).map(([key, met], index) => {
                          const criterionNames = {
                            'large_move': 'Large Momentum Move (LOW to HIGH ≥3x ADR)',
                            'consolidation': 'Multi-Phase Consolidation Analysis',
                            'above_50_sma': 'Current Price Above 50-Day Moving Average',
                            'adr_range': 'Optimal Volatility Range (3-20% ADR)'
                          };
                          const descriptions = {
                            'large_move': 'Move from LOW of start day to HIGH of end day must exceed 3x ADR',
                            'consolidation': '4 criteria: ≥3 candles, lower volume vs move, lower ADR vs move, price stability ≤1.5% ADR',
                            'above_50_sma': 'Most recent closing price must be above 50-day Simple Moving Average',
                            'adr_range': 'Average Daily Range over last 20 days must be between 3% and 20%'
                          };
                          
                          return (
                            <div key={key} className={`p-4 rounded-lg border ${
                              met ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'
                            }`}>
                              <div className="flex items-center gap-2 mb-2">
                                {met ? (
                                  <CheckCircle className="h-5 w-5 text-green-400" />
                                ) : (
                                  <XCircle className="h-5 w-5 text-red-400" />
                                )}
                                <h4 className="font-medium text-white">{criterionNames[key as keyof typeof criterionNames] || key}</h4>
                              </div>
                              <p className="text-sm text-muted-foreground">{descriptions[key as keyof typeof descriptions] || 'Criterion analysis'}</p>
                              <div className="mt-2 text-xs text-muted-foreground">
                                <span className={`font-medium ${met ? 'text-green-400' : 'text-red-400'}`}>
                                  {met ? 'PASSED' : 'FAILED'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Analysis Report */}
                  {momentumAnalysis.analysis_report && (
                    <div className="card-glow p-6">
                      <h3 className="text-lg font-semibold text-white mb-4">Detailed Analysis Report</h3>
                      <div className="bg-gray-800/50 rounded-lg p-4">
                        <pre className="text-sm text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
                          {momentumAnalysis.analysis_report}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stock Chart Modal */}
      {selectedStock && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9000]"
          onClick={() => setSelectedStock(null)}
        >
          <div 
            className="bg-gray-900 rounded-xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
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
            
            <div className="mt-4 flex justify-center">
              <button 
                onClick={() => analyzeMomentumPattern(selectedStock.symbol)}
                className="flex items-center gap-2 px-6 py-3 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg transition-colors"
              >
                <Target className="h-5 w-5" />
                Run 5 Star Analysis
              </button>
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

      <div className="max-w-md">
        <div className="card-glow p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-6 w-6 text-green-400" />
              <div>
                <h3 className="text-lg font-semibold text-white">5 Star Momentum</h3>
                <div className="w-3 h-3 rounded-full bg-green-400"></div>
              </div>
            </div>
          </div>
          
          <p className="text-muted-foreground mb-4 text-sm">
            Advanced momentum screening using the complete 5 Star Trading Setup checklist with 4 technical criteria
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
                <Zap className="h-4 w-4" />
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
      </div>

      {/* Progress Popup */}
      {showProgress && !isMinimized && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9100] p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Screening Progress</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsMinimized(true)}
                  className="p-1 hover:bg-gray-700 rounded transition-colors"
                  title="Minimize"
                >
                  <Minimize2 className="h-4 w-4 text-gray-400" />
                </button>
                <button
                  onClick={() => {
                    if (abortController) {
                      abortController.abort()
                    }
                    setShowProgress(false)
                    setProgressPercent(0)
                    setProgressMessage('')
                    setAbortController(null)
                  }}
                  className="p-1 hover:bg-red-500/20 rounded transition-colors"
                  title="Cancel"
                >
                  <X className="h-4 w-4 text-red-400" />
                </button>
              </div>
            </div>
            
            <div className="mb-4">
              <div className="flex justify-between text-sm text-gray-400 mb-2">
                <span>{progressMessage}</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div 
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${progressPercent}%` }}
                ></div>
              </div>
              {currentSymbol && (
                <div className="mt-2 text-sm text-blue-400 font-mono">
                  Current: {currentSymbol}
                </div>
              )}
            </div>
            
            {progressPercent < 100 && (
              <div className="text-center">
                <Loader2 className="h-6 w-6 animate-spin text-blue-400 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Please wait while we screen the stock universe...</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Minimized Progress Bar */}
      {showProgress && isMinimized && (
        <div className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-700 p-3 z-[9100]">
          <div className="flex items-center justify-between max-w-4xl mx-auto">
            <div className="flex items-center gap-4 flex-1">
              <div className="flex-1">
                <div className="flex justify-between text-sm text-gray-400 mb-1">
                  <span>{progressMessage}</span>
                  <span>{progressPercent}%</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div 
                    className="bg-blue-500 h-2 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${progressPercent}%` }}
                  ></div>
                </div>
                {currentSymbol && (
                  <div className="text-xs text-blue-400 font-mono mt-1">
                    Current: {currentSymbol}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2 ml-4">
              <button
                onClick={() => setIsMinimized(false)}
                className="px-3 py-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded text-sm transition-colors"
                title="Expand"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
              <button
                onClick={() => {
                  if (abortController) {
                    abortController.abort()
                  }
                  setShowProgress(false)
                  setProgressPercent(0)
                  setProgressMessage('')
                  setAbortController(null)
                }}
                className="px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded text-sm transition-colors"
                title="Cancel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add to Watchlist Modal */}
      {showWatchlistModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9200] p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-white mb-4">
              Add {selectedStocks.size} Stock{selectedStocks.size !== 1 ? 's' : ''} to Watchlist
            </h3>
            
            {watchlists.length === 0 ? (
              <div className="text-center py-6">
                <Bookmark className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">No watchlists found</p>
                <button
                  onClick={() => {
                    setShowWatchlistModal(false)
                    setShowCreateWatchlistModal(true)
                  }}
                  className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors"
                >
                  Create First Watchlist
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {watchlists.map((watchlist) => (
                  <button
                    key={watchlist.id}
                    onClick={() => addStocksToWatchlist(watchlist.id)}
                    className="w-full p-3 text-left bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <div className="font-medium text-white">{watchlist.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {watchlist.symbols.length} symbols
                    </div>
                  </button>
                ))}
              </div>
            )}
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowWatchlistModal(false)}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              {watchlists.length > 0 && (
                <button
                  onClick={() => {
                    setShowWatchlistModal(false)
                    setShowCreateWatchlistModal(true)
                  }}
                  className="flex-1 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors"
                >
                  Create New Watchlist
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Watchlist Modal */}
      {showCreateWatchlistModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9200] p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-white mb-4">Create New Watchlist</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  Name
                </label>
                <input
                  type="text"
                  value={newWatchlistName}
                  onChange={(e) => setNewWatchlistName(e.target.value)}
                  placeholder="Enter watchlist name"
                  className="w-full px-4 py-3 bg-card/50 border border-white/10 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  Description (Optional)
                </label>
                <textarea
                  value={newWatchlistDescription}
                  onChange={(e) => setNewWatchlistDescription(e.target.value)}
                  placeholder="Enter description"
                  rows={3}
                  className="w-full px-4 py-3 bg-card/50 border border-white/10 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white"
                />
              </div>

              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <p className="text-sm text-blue-400">
                  This watchlist will contain {selectedStocks.size} stock{selectedStocks.size !== 1 ? 's' : ''} from your screening results.
                </p>
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCreateWatchlistModal(false)}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createWatchlist}
                disabled={!newWatchlistName.trim()}
                className="flex-1 px-4 py-2 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 