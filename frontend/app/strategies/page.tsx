'use client'

import { useState } from 'react'
import { FileText, Play, Edit, Trash2, Plus, Code } from 'lucide-react'

interface Strategy {
  id: string
  name: string
  type: 'single_asset' | 'screened_multi'
  description: string
  lastModified: string
  status: 'active' | 'inactive'
}

export default function Strategies() {
  const [strategies, setStrategies] = useState<Strategy[]>([
    {
      id: '1',
      name: 'Moving Average Crossover',
      type: 'single_asset',
      description: 'Simple moving average crossover strategy for trend following',
      lastModified: '2024-01-15',
      status: 'active'
    },
    {
      id: '2',
      name: 'RSI Momentum Strategy',
      type: 'single_asset',
      description: 'RSI-based momentum strategy with oversold/overbought signals',
      lastModified: '2024-01-10',
      status: 'active'
    },
    {
      id: '3',
      name: 'Multi-Asset Screener',
      type: 'screened_multi',
      description: 'Screens universe for high momentum stocks',
      lastModified: '2024-01-08',
      status: 'inactive'
    }
  ])

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Strategies</h1>
          <p className="text-muted-foreground">Manage your trading strategies</p>
        </div>
        <button className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 rounded-xl font-medium transition-all duration-200 shadow-lg hover:shadow-purple-500/25">
          <Plus className="h-5 w-5" />
          New Strategy
        </button>
      </div>

      {/* Strategy Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {strategies.map((strategy) => (
          <div key={strategy.id} className="card-glow p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <Code className="h-6 w-6 text-purple-400" />
                <div>
                  <h3 className="text-lg font-semibold text-white">{strategy.name}</h3>
                  <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                    strategy.type === 'single_asset' 
                      ? 'bg-blue-500/20 text-blue-400' 
                      : 'bg-green-500/20 text-green-400'
                  }`}>
                    {strategy.type === 'single_asset' ? 'Single Asset' : 'Multi Asset'}
                  </span>
                </div>
              </div>
              <div className={`w-3 h-3 rounded-full ${
                strategy.status === 'active' ? 'bg-green-400' : 'bg-gray-400'
              }`}></div>
            </div>
            
            <p className="text-muted-foreground mb-4 text-sm">{strategy.description}</p>
            
            <div className="flex items-center justify-between text-sm text-muted-foreground mb-4">
              <span>Modified: {strategy.lastModified}</span>
            </div>
            
            <div className="flex gap-2">
              <button className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg transition-colors">
                <Play className="h-4 w-4" />
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
        ))}
      </div>

      {/* Strategy Editor */}
      <div className="card-glow p-6">
        <h3 className="text-xl font-semibold text-white mb-4">Strategy Editor</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              Strategy Name
            </label>
            <input
              type="text"
              placeholder="Enter strategy name"
              className="w-full px-4 py-3 bg-card/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white placeholder-muted-foreground"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-2">
              Strategy Type
            </label>
            <select className="w-full px-4 py-3 bg-card/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white">
              <option value="single_asset">Single Asset</option>
              <option value="screened_multi">Multi Asset (Screened)</option>
            </select>
          </div>
        </div>
        
        <div className="mt-4">
          <label className="block text-sm font-medium text-muted-foreground mb-2">
            Strategy Code
          </label>
          <textarea
            rows={10}
            placeholder="def generate_signals(data):&#10;    # Your strategy logic here&#10;    return signals"
            className="w-full px-4 py-3 bg-card/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white placeholder-muted-foreground font-mono text-sm"
          />
        </div>
        
        <div className="flex gap-3 mt-4">
          <button className="px-6 py-3 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 rounded-xl font-medium transition-all duration-200 shadow-lg hover:shadow-purple-500/25">
            Save Strategy
          </button>
          <button className="px-6 py-3 bg-card/50 hover:bg-card/70 text-white rounded-xl font-medium transition-all duration-200">
            Test Strategy
          </button>
        </div>
      </div>
    </div>
  )
} 