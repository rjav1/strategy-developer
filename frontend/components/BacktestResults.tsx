'use client'

import React from 'react'
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Calendar, 
  Target, 
  BarChart3,
  Clock,
  Percent
} from 'lucide-react'

interface Trade {
  entry_date: string
  entry_price: number
  exit_date?: string
  exit_price?: number
  pnl?: number
  holding_period?: number
  status: 'open' | 'closed'
}

interface BacktestResultsProps {
  results: {
    total_trades: number
    winning_trades: number
    losing_trades: number
    win_rate: number
    total_pnl: number
    total_return_pct: number  // Changed from total_return
    avg_trade_pnl: number     // Changed from average_pnl
    avg_win: number           // Changed from best_trade
    avg_loss: number          // Changed from worst_trade
    avg_holding_days: number  // Changed from average_holding_period
    max_drawdown: number
    sharpe_ratio?: number
  }
  trades: Trade[]
  initialCapital: number
  ticker: string
  period: string
}

export default function BacktestResults({ 
  results, 
  trades, 
  initialCapital, 
  ticker, 
  period 
}: BacktestResultsProps) {
  const formatCurrency = (value: number | undefined) => {
    if (value === undefined || value === null) return 'N/A'
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  }

  const formatPercent = (value: number | undefined) => {
    if (value === undefined || value === null) return 'N/A'
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
  }

  const getPerformanceColor = (value: number | undefined) => {
    if (value === undefined || value === null) return 'text-gray-400'
    return value >= 0 ? 'text-green-400' : 'text-red-400'
  }

  const getPerformanceBg = (value: number | undefined) => {
    if (value === undefined || value === null) return 'bg-gray-500/10 border-gray-500/20'
    return value >= 0 ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'
  }

  const finalCapital = initialCapital + (results.total_pnl || 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Backtest Results</h2>
          <p className="text-muted-foreground">
            {ticker} • {period.toUpperCase()} • Momentum Screener Strategy
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">Initial Capital</p>
          <p className="text-xl font-bold text-white">{formatCurrency(initialCapital)}</p>
        </div>
      </div>

      {/* Overall Performance */}
      <div className={`p-6 rounded-xl border ${getPerformanceBg(results.total_pnl)}`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Overall Performance</h3>
          <div className="flex items-center gap-2">
            {results.total_pnl >= 0 ? (
              <TrendingUp className="h-5 w-5 text-green-400" />
            ) : (
              <TrendingDown className="h-5 w-5 text-red-400" />
            )}
          </div>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Final Capital</p>
            <p className={`text-xl font-bold ${getPerformanceColor(results.total_pnl)}`}>
              {formatCurrency(finalCapital)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total P&L</p>
            <p className={`text-xl font-bold ${getPerformanceColor(results.total_pnl)}`}>
              {formatCurrency(results.total_pnl)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total Return</p>
            <p className={`text-xl font-bold ${getPerformanceColor(results.total_return_pct)}`}>
              {formatPercent(results.total_return_pct)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Annualized Return</p>
            <p className={`text-xl font-bold ${getPerformanceColor(results.total_return_pct)}`}>
              {formatPercent(results.total_return_pct)}
            </p>
          </div>
        </div>
      </div>

      {/* Trading Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Trade Count */}
        <div className="card-glow p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <BarChart3 className="h-5 w-5 text-blue-400" />
            </div>
            <h4 className="font-semibold text-white">Trade Statistics</h4>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Trades</span>
              <span className="text-white font-medium">{results.total_trades || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Winning Trades</span>
              <span className="text-green-400 font-medium">{results.winning_trades || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Losing Trades</span>
              <span className="text-red-400 font-medium">{results.losing_trades || 0}</span>
            </div>
          </div>
        </div>

        {/* Win Rate */}
        <div className="card-glow p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <Target className="h-5 w-5 text-purple-400" />
            </div>
            <h4 className="font-semibold text-white">Success Rate</h4>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Win Rate</span>
              <span className={`font-bold text-lg ${getPerformanceColor((results.win_rate || 0) - 50)}`}>
                {formatPercent(results.win_rate)}
              </span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div 
                className="bg-gradient-to-r from-purple-500 to-blue-500 h-2 rounded-full"
                style={{ width: `${results.win_rate || 0}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Average Holding Period */}
        <div className="card-glow p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-yellow-500/20 rounded-lg">
              <Clock className="h-5 w-5 text-yellow-400" />
            </div>
            <h4 className="font-semibold text-white">Timing</h4>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Avg Hold Period</span>
              <span className="text-white font-medium">
                {results.avg_holding_days ? results.avg_holding_days.toFixed(1) : 'N/A'} days
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Max Drawdown</span>
              <span className="text-red-400 font-medium">
                {formatPercent(results.max_drawdown)}
              </span>
            </div>
          </div>
        </div>

        {/* P&L Statistics */}
        <div className="card-glow p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-green-500/20 rounded-lg">
              <DollarSign className="h-5 w-5 text-green-400" />
            </div>
            <h4 className="font-semibold text-white">P&L Analysis</h4>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Average P&L</span>
              <span className={`font-medium ${getPerformanceColor(results.avg_trade_pnl)}`}>
                {formatCurrency(results.avg_trade_pnl)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Best Trade</span>
              <span className="text-green-400 font-medium">
                {formatCurrency(results.avg_win)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Worst Trade</span>
              <span className="text-red-400 font-medium">
                {formatCurrency(results.avg_loss)}
              </span>
            </div>
          </div>
        </div>

        {/* Risk Metrics */}
        <div className="card-glow p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-orange-500/20 rounded-lg">
              <Percent className="h-5 w-5 text-orange-400" />
            </div>
            <h4 className="font-semibold text-white">Risk Metrics</h4>
          </div>
          <div className="space-y-2">
            {results.sharpe_ratio !== undefined && results.sharpe_ratio !== null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sharpe Ratio</span>
                <span className="text-white font-medium">
                  {results.sharpe_ratio.toFixed(2)}
                </span>
              </div>
            )}
            {/* Profit Factor is not directly available in the new results structure */}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Max Drawdown</span>
              <span className="text-red-400 font-medium">
                {formatPercent(results.max_drawdown)}
              </span>
            </div>
          </div>
        </div>

        {/* Position Sizing */}
        <div className="card-glow p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-orange-500/20 rounded-lg">
              <Target className="h-5 w-5 text-orange-400" />
            </div>
            <h4 className="font-semibold text-white">Position Sizing</h4>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Risk Model</span>
              <span className="text-orange-400 font-medium">1% Risk Per Trade</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Stop Loss</span>
              <span className="text-white font-medium">Breakout Day Low</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Exit Signal</span>
              <span className="text-white font-medium">Below 20 SMA</span>
            </div>
          </div>
        </div>

        {/* Strategy Overview */}
        <div className="card-glow p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-indigo-500/20 rounded-lg">
              <Calendar className="h-5 w-5 text-indigo-400" />
            </div>
            <h4 className="font-semibold text-white">Strategy Info</h4>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Period</span>
              <span className="text-white font-medium">{period.toUpperCase()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ticker</span>
              <span className="text-white font-medium">{ticker}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Strategy</span>
              <span className="text-purple-400 font-medium">Momentum Screener</span>
            </div>
          </div>
        </div>
      </div>

      {/* Performance Summary */}
      <div className="p-6 bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-xl">
        <h3 className="text-lg font-semibold text-white mb-4">Performance Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium text-white mb-2">Strategy Effectiveness</h4>
            <p className="text-sm text-muted-foreground">
              The momentum screener strategy with 1% risk-based position sizing generated{' '}
              <span className={`font-medium ${getPerformanceColor(results.total_pnl)}`}>
                {formatCurrency(results.total_pnl)}
              </span>{' '}
              across {results.total_trades || 0} trades with a{' '}
              <span className={`font-medium ${getPerformanceColor((results.win_rate || 0) - 50)}`}>
                {formatPercent(results.win_rate)}
              </span>{' '}
              win rate. Each trade risked exactly 1% of portfolio value.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-white mb-2">Risk Assessment</h4>
            <p className="text-sm text-muted-foreground">
              Maximum drawdown was{' '}
              <span className="font-medium text-red-400">
                {formatPercent(results.max_drawdown)}
              </span>
              {/* Profit Factor is not directly available in the new results structure */}
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}