'use client'

import { useState, useEffect } from 'react'
import { Search, Filter, Plus, Play, Edit, Trash2, Loader2, TrendingUp, Shield, BarChart3, Info, Star, CheckCircle, XCircle, Target, Zap, Eye, Download } from 'lucide-react'
import StockChart from '../../components/StockChart'

interface ScreenResult {
  symbol: string
  value: number
  name?: string
  confidence_score?: number
  pattern_strength?: string
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
  criterion1_large_move: {
    met: boolean
    percentage_move: number
    threshold: number
    description: string
  }
  criterion2_consolidation: {
    met: boolean
    consolidation_days: number
    range_percentage: number
    description: string
  }
  criterion3_narrow_range: {
    met: boolean
    avg_range: number
    atr: number
    description: string
  }
  criterion4_moving_averages: {
    met: boolean
    above_sma10: boolean
    above_sma20: boolean
    above_sma50: boolean
    ma_trending_up: boolean
    description: string
  }
  criterion5_volume_breakout: {
    met: boolean
    volume_ratio: number
    recent_volume: number
    avg_volume: number
    description: string
  }
  criterion6_close_at_hod: {
    met: boolean
    distance_from_hod_pct: number
    close_price: number
    high_of_day: number
    description: string
  }
  criterion7_not_extended: {
    met: boolean
    distance_from_sma20: number
    description: string
  }
  criterion8_linear_moves: {
    met: boolean
    correlation: number
    description: string
  }
  criterion9_avoid_barcode: {
    met: boolean
    returns_std: number
    avg_return: number
    description: string
  }
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
}

export default function Screeners() {
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<ScreenResult[]>([])
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
  const [minCriteria, setMinCriteria] = useState(6)
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
  const [enabledCriteria, setEnabledCriteria] = useState([1,2,3,4,5,6,7,8,9])
  const [fallbackEnabled, setFallbackEnabled] = useState(true)
  const [showAdvancedControls, setShowAdvancedControls] = useState(false)

  const runScreener = async (type: 'momentum' | 'volatility') => {
    setLoading(true)
    setError('')
    setScreenerType(type)
    setResults([])
    
    try {
      let endpoint = type === 'momentum' ? '/screen/high_momentum' : '/screen/low_volatility'
      let queryParams = new URLSearchParams({
        period: period,
        top_n: topN.toString()
      })

      if (type === 'momentum') {
        queryParams.append('min_criteria', minCriteria.toString())
        queryParams.append('min_percentage_move', minPercentageMove.toString())
        queryParams.append('max_consolidation_range', maxConsolidationRange.toString())
        queryParams.append('narrow_range_multiplier', narrowRangeMultiplier.toString())
        queryParams.append('volume_spike_threshold', volumeSpikeThreshold.toString())
        queryParams.append('hod_distance_threshold', hodDistanceThreshold.toString())
        queryParams.append('sma_distance_threshold', smaDistanceThreshold.toString())
        queryParams.append('correlation_threshold', correlationThreshold.toString())
        queryParams.append('volatility_threshold', volatilityThreshold.toString())
        queryParams.append('require_all_sma', requireAllSma.toString())
        queryParams.append('require_both_ma_trending', requireBothMaTrending.toString())
        queryParams.append('fallback_enabled', fallbackEnabled.toString())
        if (enabledCriteria.length < 9) {
          queryParams.append('enabled_criteria', enabledCriteria.join(','))
        }
      }

      if (customSymbols.trim()) {
        queryParams.append('symbols', customSymbols.trim())
      }

      const response = await fetch(`http://localhost:8000${endpoint}?${queryParams}`)
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      
      const data = await response.json()
      setResults(data)
      
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
      negativeCount: type === 'momentum' ? data.filter(item => item.value < 0).length : 0,
      strongPatterns: type === 'momentum' ? data.filter(item => item.pattern_strength === 'Strong').length : 0,
      moderatePatterns: type === 'momentum' ? data.filter(item => item.pattern_strength === 'Moderate').length : 0,
      weakPatterns: type === 'momentum' ? data.filter(item => item.pattern_strength === 'Weak').length : 0
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
      setMomentumAnalysis(data)
      
    } catch (err) {
      setError(`Failed to analyze momentum pattern: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setAnalyzingSymbol('')
    }
  }

  const formatValue = (value: number, type: 'momentum' | 'volatility') => {
    if (type === 'momentum') {
      return `${value.toFixed(1)}%`
    } else {
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
      return `Screened ${totalStocks} stocks using 5 Star Trading Setup criteria. Average confidence: ${averageValue.toFixed(1)}%. 
      Pattern strength distribution: ${strongPatterns} Strong, ${moderatePatterns} Moderate, ${weakPatterns} Weak patterns found. 
      Top performer: ${topPerformer.symbol} (${topPerformer.value.toFixed(1)}% confidence, ${topPerformer.pattern_strength} pattern).`
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
            <label className="block text-sm font-medium text-muted-foreground mb-2">Min Criteria (out of 9)</label>
            <input 
              type="number" 
              value={minCriteria} 
              onChange={(e) => setMinCriteria(parseInt(e.target.value) || 6)}
              min="1" max="9" 
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
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: 1, name: "Large Move (30%+)" },
                  { id: 2, name: "Consolidation" },
                  { id: 3, name: "Narrow Range" },
                  { id: 4, name: "Above MAs" },
                  { id: 5, name: "Volume Spike" },
                  { id: 6, name: "Close at HOD" },
                  { id: 7, name: "Not Extended" },
                  { id: 8, name: "Linear Moves" },
                  { id: 9, name: "Avoid Barcode" }
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  Min Move % <span className="text-xs">(Criterion 1)</span>
                </label>
                <input 
                  type="number" 
                  value={minPercentageMove} 
                  onChange={(e) => setMinPercentageMove(parseFloat(e.target.value) || 30)}
                  min="10" max="100" step="5"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  Max Consolidation % <span className="text-xs">(Criterion 2)</span>
                </label>
                <input 
                  type="number" 
                  value={maxConsolidationRange} 
                  onChange={(e) => setMaxConsolidationRange(parseFloat(e.target.value) || 10)}
                  min="5" max="25" step="2.5"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  Narrow Range Multiplier <span className="text-xs">(Criterion 3)</span>
                </label>
                <input 
                  type="number" 
                  value={narrowRangeMultiplier} 
                  onChange={(e) => setNarrowRangeMultiplier(parseFloat(e.target.value) || 0.7)}
                  min="0.3" max="1.5" step="0.1"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  Volume Spike Threshold <span className="text-xs">(Criterion 5)</span>
                </label>
                <input 
                  type="number" 
                  value={volumeSpikeThreshold} 
                  onChange={(e) => setVolumeSpikeThreshold(parseFloat(e.target.value) || 1.5)}
                  min="1.0" max="5.0" step="0.1"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  HOD Distance % <span className="text-xs">(Criterion 6)</span>
                </label>
                <input 
                  type="number" 
                  value={hodDistanceThreshold * 100} 
                  onChange={(e) => setHodDistanceThreshold((parseFloat(e.target.value) || 5) / 100)}
                  min="1" max="15" step="1"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  SMA Distance % <span className="text-xs">(Criterion 7)</span>
                </label>
                <input 
                  type="number" 
                  value={smaDistanceThreshold} 
                  onChange={(e) => setSmaDistanceThreshold(parseFloat(e.target.value) || 15)}
                  min="5" max="50" step="5"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  Correlation Threshold <span className="text-xs">(Criterion 8)</span>
                </label>
                <input 
                  type="number" 
                  value={correlationThreshold} 
                  onChange={(e) => setCorrelationThreshold(parseFloat(e.target.value) || 0.7)}
                  min="0.3" max="1.0" step="0.1"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  Volatility Threshold <span className="text-xs">(Criterion 9)</span>
                </label>
                <input 
                  type="number" 
                  value={volatilityThreshold} 
                  onChange={(e) => setVolatilityThreshold(parseFloat(e.target.value) || 0.05)}
                  min="0.01" max="0.2" step="0.01"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                />
              </div>
            </div>

            {/* Boolean Options */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <label className="flex items-center gap-3 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={requireAllSma}
                  onChange={(e) => setRequireAllSma(e.target.checked)}
                  className="rounded bg-gray-800 border-gray-600 text-purple-500"
                />
                Require Above ALL SMAs (10, 20, 50)
              </label>
              <label className="flex items-center gap-3 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={requireBothMaTrending}
                  onChange={(e) => setRequireBothMaTrending(e.target.checked)}
                  className="rounded bg-gray-800 border-gray-600 text-purple-500"
                />
                Require BOTH MAs Trending Up
              </label>
              <label className="flex items-center gap-3 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={fallbackEnabled}
                  onChange={(e) => setFallbackEnabled(e.target.checked)}
                  className="rounded bg-gray-800 border-gray-600 text-purple-500"
                />
                Enable Fallback (Less Strict)
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
      {results.length > 0 && (
        <div className="card-glow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">
              {screenerType === 'momentum' ? '5 Star Momentum Patterns' : 'Low Volatility'} Results
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
                    {screenerType === 'momentum' ? 'Confidence' : 'Volatility'}
                  </th>
                  {screenerType === 'momentum' && (
                    <th className="text-left p-3 text-muted-foreground font-medium">Pattern</th>
                  )}
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
                        ? result.value >= 90 ? 'text-green-400' : result.value >= 70 ? 'text-yellow-400' : 'text-orange-400'
                        : 'text-blue-400'
                    }`}>
                      {formatValue(result.value, screenerType!)}
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
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Momentum Analysis Modal */}
      {showMomentumModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl w-full max-w-6xl max-h-[95vh] overflow-y-auto">
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
                      <p className="text-2xl font-bold text-white">{momentumAnalysis.total_criteria_met}/9</p>
                    </div>
                  </div>

                  {/* Annotated Chart */}
                  {momentumAnalysis.chart_image_base64 && (
                    <div className="card-glow p-6">
                      <h3 className="text-lg font-semibold text-white mb-4">Annotated Technical Analysis Chart</h3>
                      <div className="bg-white rounded-lg p-4">
                        <img 
                          src={momentumAnalysis.chart_image_base64} 
                          alt={`${momentumAnalysis.symbol} Momentum Analysis Chart`}
                          className="w-full h-auto"
                        />
                      </div>
                      <div className="mt-4 text-sm text-muted-foreground">
                        <p>• Chart automatically annotates key momentum pattern elements</p>
                        <p>• Moving averages, consolidation zones, breakout points, and volume spikes are highlighted</p>
                      </div>
                    </div>
                  )}

                  {/* Criteria Breakdown */}
                  {momentumAnalysis.criteria_details && (
                    <div className="card-glow p-6">
                      <h3 className="text-lg font-semibold text-white mb-4">5 Star Trading Setup Criteria Analysis</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {Object.entries(momentumAnalysis.criteria_details).map(([key, criterion], index) => (
                          <div key={key} className={`p-4 rounded-lg border ${
                            criterion.met ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'
                          }`}>
                            <div className="flex items-center gap-2 mb-2">
                              {criterion.met ? (
                                <CheckCircle className="h-5 w-5 text-green-400" />
                              ) : (
                                <XCircle className="h-5 w-5 text-red-400" />
                              )}
                              <h4 className="font-medium text-white">Criterion {index + 1}</h4>
                            </div>
                            <p className="text-sm text-muted-foreground">{criterion.description}</p>
                          </div>
                        ))}
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
            Advanced momentum screening using the complete 5 Star Trading Setup checklist with 9 technical criteria
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
            Screens comprehensive stock universe for lowest volatility stocks with advanced risk metrics
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
          
          <p className="text-muted-foreground mb-4 text-sm">Screens for undervalued stocks (Coming Soon)</p>
          
          <div className="flex gap-2">
            <button className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg transition-colors opacity-50 cursor-not-allowed">
              <Play className="h-4 w-4" />
              Coming Soon
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