'use client'

import { useState } from 'react'
import { BarChart3, Download, Eye, Trash2, Calendar } from 'lucide-react'

export default function Results() {
  const [results] = useState([
    {
      id: '1',
      name: 'Moving Average Crossover - AAPL',
      date: '2024-01-15',
      strategy: 'Moving Average Crossover',
      dataset: 'AAPL Historical Data',
      totalReturn: 15.7,
      sharpeRatio: 1.2,
      maxDrawdown: -8.3,
      winRate: 62.5
    },
    {
      id: '2',
      name: 'RSI Strategy - SPY',
      date: '2024-01-10',
      strategy: 'RSI Momentum Strategy',
      dataset: 'SPY Daily Data',
      totalReturn: 12.3,
      sharpeRatio: 0.9,
      maxDrawdown: -12.1,
      winRate: 58.2
    }
  ])

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Results</h1>
        <p className="text-muted-foreground">View and manage your backtest results</p>
      </div>

      <div className="space-y-4">
        {results.map((result) => (
          <div key={result.id} className="card-glow p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">{result.name}</h3>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    {result.date}
                  </span>
                  <span>{result.strategy}</span>
                  <span>{result.dataset}</span>
                </div>
              </div>
              
              <div className="flex gap-2">
                <button className="p-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg transition-colors">
                  <Eye className="h-4 w-4" />
                </button>
                <button className="p-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg transition-colors">
                  <Download className="h-4 w-4" />
                </button>
                <button className="p-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-card/30 rounded-lg">
                <div className="text-xl font-bold text-green-400">+{result.totalReturn}%</div>
                <div className="text-xs text-muted-foreground">Total Return</div>
              </div>
              <div className="text-center p-3 bg-card/30 rounded-lg">
                <div className="text-xl font-bold text-blue-400">{result.sharpeRatio}</div>
                <div className="text-xs text-muted-foreground">Sharpe Ratio</div>
              </div>
              <div className="text-center p-3 bg-card/30 rounded-lg">
                <div className="text-xl font-bold text-red-400">{result.maxDrawdown}%</div>
                <div className="text-xs text-muted-foreground">Max Drawdown</div>
              </div>
              <div className="text-center p-3 bg-card/30 rounded-lg">
                <div className="text-xl font-bold text-purple-400">{result.winRate}%</div>
                <div className="text-xs text-muted-foreground">Win Rate</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Comparison Chart */}
      <div className="card-glow p-6">
        <h3 className="text-xl font-semibold text-white mb-4">Performance Comparison</h3>
        <div className="h-64 bg-gradient-to-br from-purple-500/10 to-blue-500/10 rounded-lg flex items-center justify-center">
          <p className="text-muted-foreground">Comparison chart will appear here</p>
        </div>
      </div>
    </div>
  )
} 