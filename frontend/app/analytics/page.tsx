'use client'

import { useState } from 'react'
import { BarChart3, TrendingUp, TrendingDown, DollarSign, Activity } from 'lucide-react'

export default function Analytics() {
  const [selectedPeriod, setSelectedPeriod] = useState('1m')

  const periods = ['1d', '1w', '1m', '3m', '6m', '1y']

  const mockMetrics = {
    totalReturn: 15.7,
    sharpeRatio: 1.2,
    maxDrawdown: -8.3,
    winRate: 62.5,
    totalTrades: 156,
    avgTrade: 0.45
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Analytics Dashboard</h1>
          <p className="text-muted-foreground">Performance metrics and insights</p>
        </div>
        <div className="flex gap-2">
          {periods.map((period) => (
            <button
              key={period}
              onClick={() => setSelectedPeriod(period)}
              className={`px-4 py-2 rounded-xl font-medium transition-all duration-200 ${
                selectedPeriod === period
                  ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/25'
                  : 'bg-card/50 text-muted-foreground hover:bg-card/70 hover:text-white'
              }`}
            >
              {period.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="card-glow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Total Return</h3>
            <TrendingUp className="h-6 w-6 text-green-400" />
          </div>
          <p className="text-3xl font-bold text-green-400">+{mockMetrics.totalReturn}%</p>
          <p className="text-sm text-muted-foreground mt-2">vs benchmark +12.3%</p>
        </div>

        <div className="card-glow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Sharpe Ratio</h3>
            <Activity className="h-6 w-6 text-blue-400" />
          </div>
          <p className="text-3xl font-bold text-blue-400">{mockMetrics.sharpeRatio}</p>
          <p className="text-sm text-muted-foreground mt-2">Risk-adjusted return</p>
        </div>

        <div className="card-glow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Max Drawdown</h3>
            <TrendingDown className="h-6 w-6 text-red-400" />
          </div>
          <p className="text-3xl font-bold text-red-400">{mockMetrics.maxDrawdown}%</p>
          <p className="text-sm text-muted-foreground mt-2">Peak to trough decline</p>
        </div>

        <div className="card-glow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Win Rate</h3>
            <BarChart3 className="h-6 w-6 text-purple-400" />
          </div>
          <p className="text-3xl font-bold text-purple-400">{mockMetrics.winRate}%</p>
          <p className="text-sm text-muted-foreground mt-2">Profitable trades</p>
        </div>

        <div className="card-glow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Total Trades</h3>
            <Activity className="h-6 w-6 text-yellow-400" />
          </div>
          <p className="text-3xl font-bold text-yellow-400">{mockMetrics.totalTrades}</p>
          <p className="text-sm text-muted-foreground mt-2">Executed positions</p>
        </div>

        <div className="card-glow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Avg Trade</h3>
            <DollarSign className="h-6 w-6 text-green-400" />
          </div>
          <p className="text-3xl font-bold text-green-400">+{mockMetrics.avgTrade}%</p>
          <p className="text-sm text-muted-foreground mt-2">Average trade return</p>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card-glow p-6">
          <h3 className="text-xl font-semibold text-white mb-4">Equity Curve</h3>
          <div className="h-64 bg-gradient-to-br from-purple-500/10 to-blue-500/10 rounded-lg flex items-center justify-center">
            <p className="text-muted-foreground">Chart placeholder</p>
          </div>
        </div>

        <div className="card-glow p-6">
          <h3 className="text-xl font-semibold text-white mb-4">Drawdown Analysis</h3>
          <div className="h-64 bg-gradient-to-br from-red-500/10 to-orange-500/10 rounded-lg flex items-center justify-center">
            <p className="text-muted-foreground">Chart placeholder</p>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card-glow p-6">
        <h3 className="text-xl font-semibold text-white mb-4">Recent Activity</h3>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center justify-between p-3 bg-card/30 rounded-lg">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${i % 2 === 0 ? 'bg-green-400' : 'bg-red-400'}`}></div>
                <div>
                  <p className="text-white font-medium">Trade #{1000 + i}</p>
                  <p className="text-sm text-muted-foreground">AAPL +2.3%</p>
                </div>
              </div>
              <div className="text-right">
                <p className={`font-medium ${i % 2 === 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {i % 2 === 0 ? '+' : '-'}${(Math.random() * 100).toFixed(2)}
                </p>
                <p className="text-sm text-muted-foreground">2 hours ago</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
} 