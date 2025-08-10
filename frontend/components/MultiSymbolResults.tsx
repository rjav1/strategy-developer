'use client'

import React, { useEffect, useRef, useState } from 'react'
import { TrendingUp, TrendingDown, DollarSign, Target, BarChart3, PieChart, Award, AlertTriangle, ChevronDown, ChevronUp, LineChart, X } from 'lucide-react'
import Smooth30DayScroller from './Smooth30DayScroller'

interface MultiSymbolResultsProps {
  results: any
  initialCapital: number
  period: string
  isRunning?: boolean
  progress?: number
  symbolsCompleted?: number
  symbolsTotal?: number
  candleProgress?: number
}

export default function MultiSymbolResults({ results, initialCapital, period, isRunning = false, progress = 0, symbolsCompleted = 0, symbolsTotal = 0, candleProgress = 0 }: MultiSymbolResultsProps) {
  const [expandedSections, setExpandedSections] = useState({
    portfolio: true,
    breakdown: false,
    individual: false
  })

  // Modal state for per-symbol chart preview
  const [modalSymbol, setModalSymbol] = useState<string | null>(null)
  const [symbolChart, setSymbolChart] = useState<any>(null)
  const [symbolLoading, setSymbolLoading] = useState(false)
  const pollingRef = useRef<any>(null)

  // Cleanup on unmount - MUST be before any conditional returns
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
    }
  }, [])



  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section as keyof typeof prev]
    }))
  }

  if (!isRunning && !results?.success) {
    return (
      <div className="card-glow p-6">
        <div className="text-center">
          <AlertTriangle className="h-16 w-16 text-red-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">Backtest Failed</h3>
          <p className="text-red-300">{results?.error || 'Multi-symbol backtest failed'}</p>
        </div>
      </div>
    )
  }

  // Coalesce results to an empty object while running or before first payload arrives
  const safe = results || {}
  const metrics = (safe && safe.results) ? safe.results : (safe.live_results?.results || {})
  // Backend returns individual_results (primary) and may attach individual_breakdown in error cases
  const individual = safe.individual_results || safe.individual_breakdown || {}
  const allSymbols = Object.keys(individual)
  const grouped = {
    profitable: [] as string[],
    unprofitable: [] as string[],
    no_trades: [] as string[],
    failed: [] as string[],
  }
  for (const s of allSymbols) {
    const r = individual[s]
    const status = r?.status || (r?.results?.total_trades ? 'completed' : 'no_trades')
    if (status === 'failed') grouped.failed.push(s)
    else if (status === 'no_trades') grouped.no_trades.push(s)
    else {
      const pnl = r?.results?.total_pnl || 0
      if (pnl >= 0) grouped.profitable.push(s)
      else grouped.unprofitable.push(s)
    }
  }
  const symbolsPassed = safe.symbols_passed || []
  const symbolsProfitable = (safe.symbols_profitable || []).filter((s: string) => {
    const r = individual[s]
    return r && (r.status === 'completed') && (r.trades || r.results?.total_trades || 0) > 0
  })
  const symbolsUnprofitable = (safe.symbols_unprofitable || []).filter((s: string) => {
    const r = individual[s]
    return r && (r.status === 'completed') && (r.trades || r.results?.total_trades || 0) > 0
  })
  const symbolsNoTrades = Object.keys(individual).filter((s) => {
    const r = individual[s]
    return r && r.status === 'no_trades'
  })
  const symbolsFailed = (safe.symbols_failed || Object.keys(individual).filter((s) => individual[s]?.status === 'failed'))

  // Convert display period to API period (e.g., "12 months" -> "12mo")
  const getApiPeriod = (p: string) => {
    if (!p) return '1y'
    const m = p.match(/(\d+)\s*months?/i)
    if (m) return `${m[1]}mo`
    return p
  }

  // Helpers
  const formatProfitFactor = (pf: number | null, isInfinite: boolean): string => {
    if (isInfinite) return '100.00'
    if (Number.isFinite(pf as number)) return (pf as number).toFixed(2)
    return '—'
  }
  const statusBadge = (status: 'completed' | 'no_trades' | 'failed') => {
    switch (status) {
      case 'completed': return { label: 'Completed', tone: 'default' as const }
      case 'no_trades': return { label: 'No trades', tone: 'muted' as const }
      case 'failed': return { label: 'Failed', tone: 'error' as const }
    }
  }

  // Open modal and fetch chart data for specific symbol
  const openSymbolChart = async (symbol: string) => {
    setModalSymbol(symbol)
    setSymbolChart(null)
    setSymbolLoading(true)

    try {
      const startResponse = await fetch('http://localhost:8000/backtest/momentum/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: symbol,
          period: getApiPeriod(period),
          initial_capital: initialCapital
        })
      })
      if (!startResponse.ok) throw new Error(`Failed to start preview for ${symbol}`)
      const { job_id } = await startResponse.json()

      // Poll for completion
      pollingRef.current = setInterval(async () => {
        try {
          const res = await fetch(`http://localhost:8000/backtest/progress/${job_id}`)
          if (res.ok) {
            const data = await res.json()
            if (data.status === 'completed' && data.results) {
              clearInterval(pollingRef.current)
              pollingRef.current = null
              setSymbolChart({
                price_data: data.results.price_data || [],
                trades: data.results.trades || [],
                momentum_periods: data.results.momentum_periods || []
              })
              setSymbolLoading(false)
            } else if (data.status === 'error') {
              clearInterval(pollingRef.current)
              pollingRef.current = null
              setSymbolLoading(false)
            }
          }
        } catch (_) {
          // swallow poll errors
        }
      }, 1500)
    } catch (_) {
      setSymbolLoading(false)
    }
  }

  // Close modal
  const closeModal = () => {
    setModalSymbol(null)
    setSymbolChart(null)
    setSymbolLoading(false)
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }





  // Portfolio Summary Cards
  const portfolioCards = [
    {
      title: 'Live Capital',
      value: `$${(metrics.portfolio_capital ?? (metrics.total_initial_capital || 0) + (metrics.total_pnl || 0)).toLocaleString?.() || (metrics.portfolio_capital ?? ((metrics.total_initial_capital || 0) + (metrics.total_pnl || 0)))}`,
      change: `Start: $${(metrics.total_initial_capital || 0).toLocaleString?.() || (metrics.total_initial_capital || 0)}`,
      icon: DollarSign,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10'
    },
    {
      title: 'Total P&L',
      value: `$${metrics.total_pnl?.toFixed(2) || '0.00'}`,
      change: `${metrics.total_return_pct?.toFixed(2) || '0.00'}%`,
      icon: DollarSign,
      color: (metrics.total_pnl || 0) >= 0 ? 'text-green-400' : 'text-red-400',
      bgColor: (metrics.total_pnl || 0) >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'
    },
    {
      title: 'Win Rate',
      value: `${metrics.win_rate?.toFixed(1) || '0.0'}%`,
      change: `${metrics.winning_trades || 0}/${metrics.total_trades || 0} trades`,
      icon: Target,
      color: (metrics.win_rate || 0) >= 50 ? 'text-green-400' : 'text-red-400',
      bgColor: (metrics.win_rate || 0) >= 50 ? 'bg-green-500/10' : 'bg-red-500/10'
    },
    {
      title: 'Symbols Tested',
      value: `${metrics.symbols_passed || 0}`,
      change: `${metrics.profitable_symbols || 0} profitable, ${metrics.unprofitable_symbols || 0} unprofitable`,
      icon: BarChart3,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10'
    },
    {
      title: 'Avg per Symbol',
      value: `${metrics.avg_return_per_symbol?.toFixed(2) || '0.00'}%`,
      change: `$${(metrics.total_pnl / (metrics.symbols_passed || 1)).toFixed(2)} profit`,
      icon: PieChart,
      color: (metrics.avg_return_per_symbol || 0) >= 0 ? 'text-green-400' : 'text-red-400',
      bgColor: (metrics.avg_return_per_symbol || 0) >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'
    }
  ]

  return (
    <div className="space-y-6">
      {/* Portfolio Overview */}
      <div className="card-glow p-6">
        {/* Embedded progress section (visible while running) */}
        {isRunning && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium text-white">Backtest in Progress</span>
              </div>
              <div className="text-sm text-gray-400">{progress?.toFixed(1)}% Complete</div>
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Symbols</span>
                  <span>{symbolsCompleted}/{symbolsTotal}</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-3">
                  <div className="bg-gradient-to-r from-blue-500 to-purple-500 h-3 rounded-full transition-all duration-500 ease-out" style={{ width: `${symbolsTotal ? (symbolsCompleted / symbolsTotal) * 100 : 0}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Candles</span>
                  <span>{candleProgress}%</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div className="bg-gradient-to-r from-green-500 to-emerald-500 h-2 rounded-full transition-all duration-300 ease-out" style={{ width: `${candleProgress}%` }} />
                </div>
              </div>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <PieChart className="h-6 w-6 text-purple-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">Portfolio Performance</h2>
              <p className="text-muted-foreground">
                Multi-Symbol Backtest • {period} • ${metrics.total_initial_capital?.toLocaleString() || '0'} Initial Capital • Live Capital: $ {(metrics.portfolio_capital ?? (metrics.total_initial_capital || 0) + (metrics.total_pnl || 0)).toLocaleString?.() || (metrics.portfolio_capital ?? ((metrics.total_initial_capital || 0) + (metrics.total_pnl || 0)))}
                {isRunning && <span className="ml-2 text-xs text-gray-400">(Live)</span>}
              </p>
            </div>
          </div>
          <button 
            onClick={() => toggleSection('portfolio')}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          >
            {expandedSections.portfolio ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
          </button>
        </div>

        {expandedSections.portfolio && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {portfolioCards.map((card, index) => (
              <div key={index} className={`p-4 rounded-xl ${card.bgColor} border border-white/5`}>
                <div className="flex items-center justify-between mb-2">
                  <card.icon className={`h-5 w-5 ${card.color}`} />
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">{card.title}</p>
                  <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
                  <p className="text-xs text-muted-foreground">{card.change}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Performance Breakdown */}
      <div className="card-glow p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <BarChart3 className="h-6 w-6 text-blue-400" />
            </div>
            <h3 className="text-xl font-semibold text-white">Performance Breakdown</h3>
          </div>
          <button 
            onClick={() => toggleSection('breakdown')}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          >
            {expandedSections.breakdown ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
          </button>
        </div>

        {expandedSections.breakdown && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Trade Statistics */}
            <div className="space-y-4">
              <h4 className="text-lg font-medium text-white">Trade Statistics</h4>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Trades</span>
                  <span className="text-white font-medium">{metrics.total_trades || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Winning Trades</span>
                  <span className="text-green-400 font-medium">{metrics.winning_trades || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Losing Trades</span>
                  <span className="text-red-400 font-medium">{metrics.losing_trades || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Avg Win</span>
                  <span className="text-green-400 font-medium">${metrics.avg_win?.toFixed(2) || '0.00'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Avg Loss</span>
                  <span className="text-red-400 font-medium">-${metrics.avg_loss?.toFixed(2) || '0.00'}</span>
                </div>
              </div>
            </div>

            {/* Symbol Statistics */}
            <div className="space-y-4">
              <h4 className="text-lg font-medium text-white">Symbol Statistics</h4>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Symbols Tested</span>
                  <span className="text-white font-medium">{(safe.symbols_tested_count) || metrics.symbols_tested || (safe.symbols_tested?.length) || Object.keys(individual).length || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Successful</span>
                  <span className="text-green-400 font-medium">{metrics.symbols_passed || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Profitable</span>
                  <span className="text-green-400 font-medium">{metrics.profitable_symbols || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Unprofitable</span>
                  <span className="text-red-400 font-medium">{metrics.unprofitable_symbols || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Failed</span>
                  <span className="text-red-400 font-medium">{metrics.symbols_failed || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Profit Rate</span>
                  <span className="text-white font-medium">
                    {metrics.symbols_passed ? ((metrics.profitable_symbols / metrics.symbols_passed) * 100).toFixed(1) : 0}%
                  </span>
                </div>
              </div>
            </div>

            {/* Best/Worst Performers */}
            <div className="space-y-4">
              <h4 className="text-lg font-medium text-white">Top Performers</h4>
              <div className="space-y-3">
                <div className="p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                  <div className="flex items-center gap-2 mb-1">
                    <Award className="h-4 w-4 text-green-400" />
                    <span className="text-sm text-green-400">Best Performer</span>
                  </div>
                  <div className="font-medium text-white">{metrics.best_symbol || 'N/A'}</div>
                  <div className="text-sm text-green-400">${metrics.best_symbol_pnl?.toFixed(2) || '0.00'}</div>
                </div>
                
                <div className="p-3 bg-red-500/10 rounded-lg border border-red-500/20">
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingDown className="h-4 w-4 text-red-400" />
                    <span className="text-sm text-red-400">Worst Performer</span>
                  </div>
                  <div className="font-medium text-white">{metrics.worst_symbol || 'N/A'}</div>
                  <div className="text-sm text-red-400">${metrics.worst_symbol_pnl?.toFixed(2) || '0.00'}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Individual Symbol Results */}
      <div className="card-glow p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/20 rounded-lg">
              <TrendingUp className="h-6 w-6 text-green-400" />
            </div>
            <h3 className="text-xl font-semibold text-white">Individual Symbol Results</h3>
          </div>
        </div>

        {/* Live grouped sections */}
        <div className="space-y-6">
          {grouped.profitable.length > 0 && (
            <div>
              <h4 className="text-lg font-medium text-green-400 mb-2">Profitable Symbols ({grouped.profitable.length})</h4>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {grouped.profitable.map((symbol) => {
                  const r = individual[symbol]
                  const m = r?.results || {}
                  return (
                    <div key={symbol} className="p-3 rounded-lg border bg-green-500/5 border-green-500/20">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-white flex items-center gap-2">{symbol}
                          <button
                            title="View chart"
                            className="p-1 rounded hover:bg-white/10 transition-colors"
                            onClick={() => openSymbolChart(symbol)}
                          >
                            <LineChart className="h-4 w-4 text-purple-400" />
                          </button>
                        </span>
                        <span className="text-green-400 text-sm">${(m.total_pnl || 0).toFixed(2)}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">Trades: {m.total_trades || 0} • Win rate: {(m.win_rate || 0).toFixed(1)}%</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {grouped.unprofitable.length > 0 && (
            <div>
              <h4 className="text-lg font-medium text-red-400 mb-2">Unprofitable Symbols ({grouped.unprofitable.length})</h4>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {grouped.unprofitable.map((symbol) => {
                  const r = individual[symbol]
                  const m = r?.results || {}
                  return (
                    <div key={symbol} className="p-3 rounded-lg border bg-red-500/5 border-red-500/20">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-white flex items-center gap-2">{symbol}
                          <button
                            title="View chart"
                            className="p-1 rounded hover:bg-white/10 transition-colors"
                            onClick={() => openSymbolChart(symbol)}
                          >
                            <LineChart className="h-4 w-4 text-purple-400" />
                          </button>
                        </span>
                        <span className="text-red-400 text-sm">${(m.total_pnl || 0).toFixed(2)}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">Trades: {m.total_trades || 0} • Win rate: {(m.win_rate || 0).toFixed(1)}%</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {grouped.no_trades.length > 0 && (
            <div>
              <h4 className="text-lg font-medium text-yellow-400 mb-2">No-trade Symbols ({grouped.no_trades.length})</h4>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {grouped.no_trades.map((symbol) => (
                  <div key={symbol} className="p-3 rounded-lg border bg-yellow-500/5 border-yellow-500/20">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-white flex items-center gap-2">{symbol}
                        <button
                          title="View chart"
                          className="p-1 rounded hover:bg-white/10 transition-colors"
                          onClick={() => openSymbolChart(symbol)}
                        >
                          <LineChart className="h-4 w-4 text-purple-400" />
                        </button>
                      </span>
                      <span className="text-yellow-300 text-xs">No trades</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {grouped.failed.length > 0 && (
            <div>
              <h4 className="text-lg font-medium text-gray-400 mb-2">Failed Symbols ({grouped.failed.length})</h4>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {grouped.failed.map((symbol) => (
                  <div key={symbol} className="p-3 rounded-lg border bg-gray-600/20 border-white/10">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-white flex items-center gap-2">{symbol}
                        <button
                          title="View chart"
                          className="p-1 rounded hover:bg-white/10 transition-colors"
                          onClick={() => openSymbolChart(symbol)}
                        >
                          <LineChart className="h-4 w-4 text-purple-400" />
                        </button>
                      </span>
                      <span className="text-gray-400 text-xs">Error</span>
                    </div>
                    <div className="text-xs text-gray-400 truncate">{individual[symbol]?.error || 'Data unavailable'}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Chart Modal */}
      {modalSymbol && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-700">
              <h3 className="text-lg font-semibold text-white">{modalSymbol} Chart Preview</h3>
              <button
                onClick={closeModal}
                className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="h-5 w-5 text-gray-400" />
              </button>
            </div>
            <div className="p-4 overflow-auto max-h-[calc(90vh-80px)]">
              {symbolLoading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="flex items-center gap-3">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-500"></div>
                    <span className="text-gray-300">Loading {modalSymbol} chart...</span>
                  </div>
                </div>
              ) : symbolChart ? (
                <Smooth30DayScroller
                  priceData={symbolChart.price_data || []}
                  trades={symbolChart.trades || []}
                  momentumPeriods={symbolChart.momentum_periods || []}
                  ticker={modalSymbol}
                />
              ) : (
                <div className="flex items-center justify-center h-64">
                  <div className="text-gray-400">Failed to load chart data</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 