'use client'

import { useState } from 'react'
import { Search, Filter, Plus, Play, Edit, Trash2 } from 'lucide-react'

export default function Screeners() {
  const [screeners] = useState([
    { id: '1', name: 'High Momentum', description: 'Screens for stocks with high momentum', status: 'active' },
    { id: '2', name: 'Low Volatility', description: 'Screens for low volatility stocks', status: 'inactive' },
    { id: '3', name: 'Value Stocks', description: 'Screens for undervalued stocks', status: 'active' }
  ])

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Screeners</h1>
          <p className="text-muted-foreground">Manage your stock screeners</p>
        </div>
        <button className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 rounded-xl font-medium transition-all duration-200 shadow-lg hover:shadow-purple-500/25">
          <Plus className="h-5 w-5" />
          New Screener
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {screeners.map((screener) => (
          <div key={screener.id} className="card-glow p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <Filter className="h-6 w-6 text-blue-400" />
                <div>
                  <h3 className="text-lg font-semibold text-white">{screener.name}</h3>
                  <div className={`w-3 h-3 rounded-full ${
                    screener.status === 'active' ? 'bg-green-400' : 'bg-gray-400'
                  }`}></div>
                </div>
              </div>
            </div>
            
            <p className="text-muted-foreground mb-4 text-sm">{screener.description}</p>
            
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
    </div>
  )
} 