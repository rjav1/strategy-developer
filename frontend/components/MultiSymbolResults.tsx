'use client'

import React, { useState } from 'react'
import { TrendingUp, TrendingDown, DollarSign, Target, BarChart3, PieChart, Award, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'

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
  const metrics = (safe && safe.results) ? safe.results : {}
  const individual = safe.individual_breakdown || {}
  const symbolsPassed = safe.symbols_passed || []
  const symbolsFailed = safe.symbols_failed || []

  // Portfolio Summary Cards
  const portfolioCards = [
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
      change: `${metrics.symbols_failed || 0} failed`,
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
                Multi-Symbol Backtest • {period} • ${metrics.total_initial_capital?.toLocaleString() || '0'} Initial Capital
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
                  <span className="text-white font-medium">{metrics.symbols_tested || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Successful</span>
                  <span className="text-green-400 font-medium">{metrics.symbols_passed || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Failed</span>
                  <span className="text-red-400 font-medium">{metrics.symbols_failed || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Success Rate</span>
                  <span className="text-white font-medium">
                    {metrics.symbols_tested ? ((metrics.symbols_passed / metrics.symbols_tested) * 100).toFixed(1) : 0}%
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
          <button 
            onClick={() => toggleSection('individual')}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          >
            {expandedSections.individual ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
          </button>
        </div>

        {expandedSections.individual && (
          <div className="space-y-4">
            {/* Successful Symbols */}
            {symbolsPassed.length > 0 && (
              <div>
                <h4 className="text-lg font-medium text-green-400 mb-3">Successful Symbols ({symbolsPassed.length})</h4>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {symbolsPassed.map((symbol: string) => {
                    const result = individual[symbol]
                    const symbolMetrics = result?.results || {}
                    return (
                      <div key={symbol} className="p-4 bg-green-500/5 rounded-lg border border-green-500/20">
                        <div className="flex items-center justify-between mb-3">
                          <h5 className="font-semibold text-white text-lg">{symbol}</h5>
                          <div className="text-right">
                            <div className="text-green-400 font-medium">${symbolMetrics.total_pnl?.toFixed(2) || '0.00'}</div>
                            <div className="text-sm text-muted-foreground">{symbolMetrics.total_return_pct?.toFixed(2) || '0.00'}%</div>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <div className="text-muted-foreground">Trades</div>
                            <div className="text-white font-medium">{symbolMetrics.total_trades || 0}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Win Rate</div>
                            <div className="text-white font-medium">{symbolMetrics.win_rate?.toFixed(1) || '0.0'}%</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Profit Factor</div>
                            <div className="text-white font-medium">{symbolMetrics.profit_factor?.toFixed(2) || '0.00'}</div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Failed Symbols */}
            {symbolsFailed.length > 0 && (
              <div>
                <h4 className="text-lg font-medium text-red-400 mb-3">Failed Symbols ({symbolsFailed.length})</h4>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  {symbolsFailed.map((symbol: string) => {
                    const result = individual[symbol]
                    return (
                      <div key={symbol} className="p-3 bg-red-500/5 rounded-lg border border-red-500/20">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-white">{symbol}</span>
                          <AlertTriangle className="h-4 w-4 text-red-400" />
                        </div>
                        <div className="text-sm text-red-300 mt-1">{result?.error || 'Unknown error'}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
} 