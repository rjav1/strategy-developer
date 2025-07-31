'use client'

import { useState, useEffect } from 'react'
import { Play, Settings, BarChart3, Clock, Target, Bookmark, Plus, X } from 'lucide-react'

export default function BacktestEngine() {
  const [selectedStrategy, setSelectedStrategy] = useState('')
  const [selectedData, setSelectedData] = useState('')
  const [backtestMode, setBacktestMode] = useState('standard')
  const [watchlists, setWatchlists] = useState<any[]>([])
  const [selectedWatchlist, setSelectedWatchlist] = useState<string>('')
  const [customSymbols, setCustomSymbols] = useState('')
  const [dataSource, setDataSource] = useState<'watchlist' | 'custom'>('watchlist')
  const [showCustomSymbols, setShowCustomSymbols] = useState(false)
  const [strategies, setStrategies] = useState<any[]>([])
  const [loadingStrategies, setLoadingStrategies] = useState(false)

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

  // Load watchlists from localStorage
  useEffect(() => {
    const savedWatchlists = localStorage.getItem('watchlists')
    if (savedWatchlists) {
      setWatchlists(JSON.parse(savedWatchlists))
    }
  }, [])

  // Load strategies from backend
  useEffect(() => {
    const fetchStrategies = async () => {
      setLoadingStrategies(true)
      try {
        const response = await fetch('http://localhost:8000/strategies')
        if (response.ok) {
          const strategiesData = await response.json()
          setStrategies(strategiesData)
        }
      } catch (error) {
        console.error('Failed to fetch strategies:', error)
      } finally {
        setLoadingStrategies(false)
      }
    }

    fetchStrategies()
  }, [])

  const getSelectedSymbols = () => {
    if (dataSource === 'watchlist' && selectedWatchlist) {
      const watchlist = watchlists.find(w => w.id === selectedWatchlist)
      return watchlist ? watchlist.symbols : []
    } else if (dataSource === 'custom' && customSymbols) {
      return customSymbols.split(',').map(s => s.trim().toUpperCase()).filter(s => s)
    }
    return []
  }

  const selectedSymbols = getSelectedSymbols()

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
                disabled={loadingStrategies}
                className="w-full px-4 py-3 bg-card/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white disabled:opacity-50"
              >
                <option value="">
                  {loadingStrategies ? 'Loading strategies...' : 'Select a strategy'}
                </option>
                {strategies.map((strategy) => (
                  <option key={strategy.id} value={strategy.id}>
                    {strategy.name}
                    {strategy.type === 'builtin' && ' (Built-in)'}
                  </option>
                ))}
              </select>
              {strategies.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {strategies.length} strategy{strategies.length !== 1 ? 'ies' : 'y'} available
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">
                Data Source
              </label>
              <div className="space-y-3">
                <div className="flex gap-3">
                  <button
                    onClick={() => setDataSource('watchlist')}
                    className={`flex-1 p-3 rounded-lg text-left transition-all duration-200 ${
                      dataSource === 'watchlist'
                        ? 'bg-purple-500 text-white'
                        : 'bg-card/50 text-muted-foreground hover:bg-card/70 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Bookmark className="h-4 w-4" />
                      <div>
                        <div className="font-medium text-sm">Watchlist</div>
                        <div className="text-xs opacity-75">Use stocks from watchlist</div>
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => setDataSource('custom')}
                    className={`flex-1 p-3 rounded-lg text-left transition-all duration-200 ${
                      dataSource === 'custom'
                        ? 'bg-purple-500 text-white'
                        : 'bg-card/50 text-muted-foreground hover:bg-card/70 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Plus className="h-4 w-4" />
                      <div>
                        <div className="font-medium text-sm">Custom</div>
                        <div className="text-xs opacity-75">Enter symbols manually</div>
                      </div>
                    </div>
                  </button>
                </div>

                {dataSource === 'watchlist' && (
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-2">
                      Select Watchlist
                    </label>
                    {watchlists.length === 0 ? (
                      <div className="p-4 bg-gray-800/50 rounded-lg text-center">
                        <Bookmark className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                        <p className="text-muted-foreground text-sm mb-3">No watchlists found</p>
                        <button
                          onClick={() => window.location.href = '/watchlists'}
                          className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors text-sm"
                        >
                          Create Watchlist
                        </button>
                      </div>
                    ) : (
                      <select 
                        value={selectedWatchlist}
                        onChange={(e) => setSelectedWatchlist(e.target.value)}
                        className="w-full px-4 py-3 bg-card/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white"
                      >
                        <option value="">Select a watchlist</option>
                        {watchlists.map((watchlist) => (
                          <option key={watchlist.id} value={watchlist.id}>
                            {watchlist.name} ({watchlist.symbols.length} symbols)
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                {dataSource === 'custom' && (
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-2">
                      Custom Symbols
                    </label>
                    <textarea
                      value={customSymbols}
                      onChange={(e) => setCustomSymbols(e.target.value)}
                      placeholder="Enter symbols separated by commas (e.g., AAPL, MSFT, GOOGL)"
                      rows={3}
                      className="w-full px-4 py-3 bg-card/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white"
                    />
                  </div>
                )}
              </div>
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

        {/* Selected Symbols Preview */}
        <div className="card-glow p-6">
          <h3 className="text-xl font-semibold text-white mb-4">Selected Symbols</h3>
          
          <div className="space-y-4">
            {selectedSymbols.length === 0 ? (
              <div className="text-center py-8">
                <Target className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-2">No symbols selected</p>
                <p className="text-sm text-muted-foreground">
                  {dataSource === 'watchlist' 
                    ? 'Select a watchlist to see symbols'
                    : 'Enter custom symbols to see them here'
                  }
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {selectedSymbols.length} symbol{selectedSymbols.length !== 1 ? 's' : ''} selected
                  </span>
                  <span className="text-sm text-purple-400">
                    {dataSource === 'watchlist' ? 'From Watchlist' : 'Custom Symbols'}
                  </span>
                </div>
                
                <div className="max-h-48 overflow-y-auto">
                  <div className="grid grid-cols-3 gap-2">
                    {selectedSymbols.map((symbol: string, index: number) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-2 bg-gray-800/50 rounded-lg"
                      >
                        <span className="text-sm font-mono text-white">{symbol}</span>
                        <button
                          onClick={() => {
                            if (dataSource === 'custom') {
                              const symbols = customSymbols.split(',').map(s => s.trim().toUpperCase()).filter(s => s && s !== symbol)
                              setCustomSymbols(symbols.join(', '))
                            }
                          }}
                          className="text-gray-400 hover:text-red-400 transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Target className="h-5 w-5 text-blue-400 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-white mb-1">Ready to Backtest</h4>
                      <p className="text-sm text-muted-foreground">
                        Your strategy will be tested on {selectedSymbols.length} symbol{selectedSymbols.length !== 1 ? 's' : ''}. 
                        {dataSource === 'watchlist' && selectedWatchlist && (
                          <> The watchlist "{watchlists.find(w => w.id === selectedWatchlist)?.name}" will be used.</>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Run Button */}
      <div className="flex justify-center">
        <button 
          disabled={selectedSymbols.length === 0 || !selectedStrategy}
          className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-xl font-medium transition-all duration-200 shadow-lg hover:shadow-purple-500/25 text-lg"
        >
          <Play className="h-6 w-6" />
          Run Backtest
        </button>
      </div>
    </div>
  )
} 