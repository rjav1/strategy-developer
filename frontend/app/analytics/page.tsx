'use client'

import { useState, useEffect } from 'react'
import { Search, Target, Star, CheckCircle, XCircle, TrendingUp, BarChart3, Download, Loader2, Info } from 'lucide-react'
import { useSearchParams } from 'next/navigation'

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
  move_boundaries?: {
    start_candle: number
    end_candle: number
    move_details: {
      start_date: string
      end_date: string
      start_price: number
      end_price: number
      total_move_pct: number
      move_duration: number
      start_volume_ratio: number
      end_volume_ratio: number
      avg_volume_ratio: number
      required_move: number
      adr_20: number
    }
  } | null
}

export default function Analytics() {
  const [symbol, setSymbol] = useState('')
  const [period, setPeriod] = useState('1y')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [analysisResult, setAnalysisResult] = useState<MomentumAnalysisResult | null>(null)
  const searchParams = useSearchParams()

  // Handle URL parameters
  useEffect(() => {
    const urlSymbol = searchParams.get('symbol')
    if (urlSymbol) {
      setSymbol(urlSymbol.toUpperCase())
      // Auto-run analysis if symbol is provided via URL
      setTimeout(() => {
        analyzeMomentumPattern(urlSymbol)
      }, 100)
    }
  }, [searchParams])

  const analyzeMomentumPattern = async (symbolToAnalyze?: string) => {
    const targetSymbol = symbolToAnalyze || symbol
    if (!targetSymbol.trim()) return

    setLoading(true)
    setError('')
    setAnalysisResult(null)
    
    try {
              const response = await fetch(`http://localhost:8000/analyze/momentum_pattern/${targetSymbol.toUpperCase()}?period=${period}`)
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to analyze momentum pattern')
      }
      
      const data = await response.json()
      setAnalysisResult(data)
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze momentum pattern')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    analyzeMomentumPattern()
  }

  const getPatternStrengthColor = (strength: string) => {
    switch (strength) {
      case 'Strong': return 'text-green-400'
      case 'Moderate': return 'text-yellow-400'
      case 'Weak': return 'text-orange-400'
      default: return 'text-gray-400'
    }
  }

  const downloadReport = () => {
    if (!analysisResult) return
    
    const reportData = {
      symbol: analysisResult.symbol,
      analysis_date: new Date().toISOString(),
      pattern_found: analysisResult.pattern_found,
      confidence_score: analysisResult.confidence_score,
      pattern_strength: analysisResult.pattern_strength,
      criteria_met: analysisResult.total_criteria_met,
      analysis_report: analysisResult.analysis_report,
      criteria_details: analysisResult.criteria_details
    }
    
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${analysisResult.symbol}_momentum_analysis_${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const getCriteriaName = (key: string) => {
    const names = {
      criterion1: 'Large Momentum Move (LOW to HIGH ≥3x ADR)',
      criterion2_3: 'Consolidation Pattern (incl. 80% price floor)',
      criterion4: 'Current Price Above 50-Day Moving Average',
      criterion5: 'Optimal Volatility Range (3-20% ADR)'
    }
    return names[key as keyof typeof names] || key
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">5 Star Momentum Analytics</h1>
          <p className="text-muted-foreground">Deep pattern analysis for individual stocks</p>
        </div>
        <div className="flex items-center gap-2 text-purple-400">
          <Target className="h-6 w-6" />
          <span className="font-medium">Pattern Detection Engine</span>
        </div>
      </div>

      {/* Search Form */}
      <div className="card-glow p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-muted-foreground mb-2">Stock Symbol</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-5 w-5" />
                <input
                  type="text"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  placeholder="Enter stock symbol (e.g., AAPL, TSLA, MSFT)"
                  className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-muted-foreground focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  disabled={loading}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">Analysis Period</label>
              <select 
                value={period} 
                onChange={(e) => setPeriod(e.target.value)}
                className="w-full px-3 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                disabled={loading}
              >
                <option value="6mo">6 Months</option>
                <option value="1y">1 Year</option>
                <option value="2y">2 Years</option>
                <option value="5y">5 Years</option>
              </select>
            </div>
          </div>
          <button
            type="submit"
            disabled={loading || !symbol.trim()}
            className="w-full md:w-auto flex items-center justify-center gap-2 px-8 py-3 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-medium transition-all duration-200 shadow-lg hover:shadow-purple-500/25"
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Analyzing Pattern...
              </>
            ) : (
              <>
                <Target className="h-5 w-5" />
                Analyze Pattern
              </>
            )}
          </button>
        </form>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400">
          <div className="flex items-center gap-2">
            <XCircle className="h-5 w-5" />
            {error}
          </div>
        </div>
      )}

      {/* Analysis Results */}
      {analysisResult && (
        <div className="space-y-6">
          {/* Pattern Summary */}
          <div className="card-glow p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-semibold text-white">
                {analysisResult.symbol} - Pattern Analysis Summary
              </h2>
              <button 
                onClick={downloadReport}
                className="flex items-center gap-2 px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg transition-colors"
              >
                <Download className="h-4 w-4" />
                Export Report
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="p-4 bg-gray-800/50 rounded-lg text-center">
                <div className="flex items-center justify-center mb-2">
                  {analysisResult.pattern_found ? (
                    <CheckCircle className="h-8 w-8 text-green-400" />
                  ) : (
                    <XCircle className="h-8 w-8 text-red-400" />
                  )}
                </div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Pattern Found</h3>
                <p className={`text-lg font-bold ${analysisResult.pattern_found ? 'text-green-400' : 'text-red-400'}`}>
                  {analysisResult.pattern_found ? 'YES' : 'NO'}
                </p>
              </div>
              
              <div className="p-4 bg-gray-800/50 rounded-lg text-center">
                <div className="flex items-center justify-center mb-2">
                  <BarChart3 className="h-8 w-8 text-blue-400" />
                </div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Confidence Score</h3>
                <p className="text-lg font-bold text-white">{analysisResult.confidence_score.toFixed(1)}%</p>
                <div className="w-full bg-gray-700 rounded-full h-2 mt-2">
                  <div 
                    className="bg-blue-400 h-2 rounded-full" 
                    style={{ width: `${analysisResult.confidence_score}%` }}
                  ></div>
                </div>
              </div>
              
              <div className="p-4 bg-gray-800/50 rounded-lg text-center">
                <div className="flex items-center justify-center mb-2">
                  <Star className="h-8 w-8 text-yellow-400" />
                </div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Pattern Strength</h3>
                <p className={`text-lg font-bold ${getPatternStrengthColor(analysisResult.pattern_strength)}`}>
                  {analysisResult.pattern_strength}
                </p>
              </div>
              
              <div className="p-4 bg-gray-800/50 rounded-lg text-center">
                <div className="flex items-center justify-center mb-2">
                  <TrendingUp className="h-8 w-8 text-purple-400" />
                </div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Criteria Met</h3>
                <p className="text-lg font-bold text-white">{analysisResult.total_criteria_met}/6</p>
                <div className="w-full bg-gray-700 rounded-full h-2 mt-2">
                  <div 
                    className="bg-purple-400 h-2 rounded-full" 
                    style={{ width: `${(analysisResult.total_criteria_met / 6) * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>

            {/* Quick Insights */}
            <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-blue-400 mt-0.5" />
                <div>
                  <h3 className="font-medium text-white mb-2">Quick Insights</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {analysisResult.pattern_found 
                      ? `${analysisResult.symbol} shows a ${analysisResult.pattern_strength.toLowerCase()} momentum pattern with ${analysisResult.confidence_score.toFixed(1)}% confidence. ${analysisResult.total_criteria_met} out of 6 technical criteria are satisfied, suggesting ${analysisResult.pattern_strength === 'Strong' ? 'excellent' : analysisResult.pattern_strength === 'Moderate' ? 'good' : 'limited'} momentum potential.`
                      : `${analysisResult.symbol} does not currently meet the 5 Star Trading Setup criteria. Only ${analysisResult.total_criteria_met} out of 6 criteria are satisfied. Consider waiting for better setup conditions or analyzing different time periods.`
                    }
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Annotated Chart */}
          {analysisResult.chart_image_base64 && (
            <div className="card-glow p-6">
              <h3 className="text-xl font-semibold text-white mb-4">Interactive Technical Analysis Chart</h3>
              <div className="bg-white rounded-lg p-4">
                <div 
                  dangerouslySetInnerHTML={{ __html: analysisResult.chart_image_base64 }}
                  className="w-full h-auto"
                />
              </div>
              
              {/* Move Boundaries Info */}
              {analysisResult.move_boundaries && (
                <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                  <h4 className="font-medium text-white mb-3 flex items-center gap-2">
                    <Target className="h-4 w-4 text-blue-400" />
                    Momentum Move Detected
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Move Period:</p>
                      <p className="text-white font-medium">
                        {analysisResult.move_boundaries.move_details.start_date} → {analysisResult.move_boundaries.move_details.end_date}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Price Range:</p>
                      <p className="text-white font-medium">
                        ${analysisResult.move_boundaries.move_details.start_price} → ${analysisResult.move_boundaries.move_details.end_price}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Total Move:</p>
                      <p className="text-white font-medium">
                        {analysisResult.move_boundaries.move_details.total_move_pct}% ({analysisResult.move_boundaries.move_details.move_duration} days)
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Volume Profile:</p>
                      <p className="text-white font-medium">
                        Start: {analysisResult.move_boundaries.move_details.start_volume_ratio}x avg
                      </p>
                      <p className="text-white font-medium">
                        End: {analysisResult.move_boundaries.move_details.end_volume_ratio}x avg
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 p-2 bg-blue-500/20 rounded text-xs text-blue-300">
                    <strong>Chart Indicators:</strong> The start and end of the momentum move are marked on the chart above with special indicators.
                  </div>
                </div>
              )}
              
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-muted-foreground">
                <div>
                  <h4 className="font-medium text-white mb-2">Chart Features:</h4>
                  <ul className="space-y-1">
                    <li>• Interactive candlestick chart with volume</li>
                    <li>• Moving averages (SMA10, SMA20, SMA50)</li>
                    <li>• Momentum move start/end indicators</li>
                    <li>• Zoom, pan, and hover functionality</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium text-white mb-2">Key Highlights:</h4>
                  <ul className="space-y-1">
                    <li>• Momentum move boundaries marked</li>
                    <li>• Consolidation zones identified</li>
                    <li>• Volume analysis integrated</li>
                    <li>• Real-time data interaction</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Criteria Breakdown */}
          {analysisResult.criteria_details && (
            <div className="card-glow p-6">
              <h3 className="text-xl font-semibold text-white mb-6">5 Star Trading Setup Criteria Analysis</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(analysisResult.criteria_details).map(([key, criterion], index) => (
                  <div key={key} className={`p-4 rounded-lg border transition-all hover:scale-105 ${
                    criterion.met 
                      ? 'bg-green-500/10 border-green-500/30 hover:bg-green-500/20' 
                      : 'bg-red-500/10 border-red-500/30 hover:bg-red-500/20'
                  }`}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                        criterion.met ? 'bg-green-500/20' : 'bg-red-500/20'
                      }`}>
                        {criterion.met ? (
                          <CheckCircle className="h-5 w-5 text-green-400" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-400" />
                        )}
                      </div>
                      <div>
                        <h4 className="font-medium text-white text-sm">Criterion {index + 1}</h4>
                        <p className={`text-xs ${criterion.met ? 'text-green-400' : 'text-red-400'}`}>
                          {criterion.met ? 'PASSED' : 'FAILED'}
                        </p>
                      </div>
                    </div>
                    <h5 className="font-medium text-white text-sm mb-2">{getCriteriaName(key)}</h5>
                    <p className="text-xs text-muted-foreground leading-relaxed">{criterion.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Analysis Report */}
          {analysisResult.analysis_report && (
            <div className="card-glow p-6">
              <h3 className="text-xl font-semibold text-white mb-4">Detailed Analysis Report</h3>
              <div className="bg-gray-800/50 rounded-lg p-6">
                <pre className="text-sm text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
                  {analysisResult.analysis_report}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}

      {/* No Analysis State */}
      {!loading && !analysisResult && !error && (
        <div className="text-center py-12">
          <Target className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-xl font-semibold text-white mb-2">Ready for Analysis</h3>
          <p className="text-muted-foreground">
            Enter a stock symbol above to begin comprehensive 5 Star momentum pattern analysis
          </p>
        </div>
      )}
    </div>
  )
} 