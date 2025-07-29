'use client'

import { useState } from 'react'
import { Play, Settings, BarChart3, Clock, Target } from 'lucide-react'

export default function BacktestEngine() {
  const [selectedStrategy, setSelectedStrategy] = useState('')
  const [selectedData, setSelectedData] = useState('')
  const [backtestMode, setBacktestMode] = useState('standard')

  const strategies = [
    { id: '1', name: 'Moving Average Crossover' },
    { id: '2', name: 'RSI Momentum Strategy' },
    { id: '3', name: 'Multi-Asset Screener' }
  ]

  const datasets = [
    { id: '1', name: 'AAPL Historical Data' },
    { id: '2', name: 'SPY Daily Data' },
    { id: '3', name: 'BTC-USD Data' }
  ]

  const modes = [
    { id: 'standard', name: 'Standard Backtest', description: 'Traditional time-series backtest' },
    { id: 'monte_carlo', name: 'Monte Carlo', description: 'Random sampling simulation' },
    { id: 'permutation', name: 'Permutation Test', description: 'Randomize signals for robustness' },
    { id: 'grid_search', name: 'Grid Search', description: 'Parameter optimization' }
  ]

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
                className="w-full px-4 py-3 bg-card/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white"
              >
                <option value="">Select a strategy</option>
                {strategies.map((strategy) => (
                  <option key={strategy.id} value={strategy.id}>{strategy.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">
                Dataset
              </label>
              <select 
                value={selectedData}
                onChange={(e) => setSelectedData(e.target.value)}
                className="w-full px-4 py-3 bg-card/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white"
              >
                <option value="">Select a dataset</option>
                {datasets.map((dataset) => (
                  <option key={dataset.id} value={dataset.id}>{dataset.name}</option>
                ))}
              </select>
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  Initial Capital
                </label>
                <input
                  type="number"
                  defaultValue={100000}
                  className="w-full px-4 py-3 bg-card/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  Commission
                </label>
                <input
                  type="number"
                  defaultValue={0.01}
                  step={0.001}
                  className="w-full px-4 py-3 bg-card/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Results Preview */}
        <div className="card-glow p-6">
          <h3 className="text-xl font-semibold text-white mb-4">Results Preview</h3>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-4 bg-card/30 rounded-lg">
                <div className="text-2xl font-bold text-green-400">+15.7%</div>
                <div className="text-sm text-muted-foreground">Total Return</div>
              </div>
              <div className="text-center p-4 bg-card/30 rounded-lg">
                <div className="text-2xl font-bold text-blue-400">1.2</div>
                <div className="text-sm text-muted-foreground">Sharpe Ratio</div>
              </div>
              <div className="text-center p-4 bg-card/30 rounded-lg">
                <div className="text-2xl font-bold text-red-400">-8.3%</div>
                <div className="text-sm text-muted-foreground">Max Drawdown</div>
              </div>
              <div className="text-center p-4 bg-card/30 rounded-lg">
                <div className="text-2xl font-bold text-purple-400">62.5%</div>
                <div className="text-sm text-muted-foreground">Win Rate</div>
              </div>
            </div>

            <div className="h-32 bg-gradient-to-br from-purple-500/10 to-blue-500/10 rounded-lg flex items-center justify-center">
              <p className="text-muted-foreground">Equity curve will appear here</p>
            </div>
          </div>
        </div>
      </div>

      {/* Run Button */}
      <div className="flex justify-center">
        <button className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 rounded-xl font-medium transition-all duration-200 shadow-lg hover:shadow-purple-500/25 text-lg">
          <Play className="h-6 w-6" />
          Run Backtest
        </button>
      </div>
    </div>
  )
} 