'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, Edit, Eye, Search, X, Save, Bookmark, TrendingUp, TrendingDown, Target, Play } from 'lucide-react'

interface Watchlist {
  id: string
  name: string
  description: string
  symbols: string[]
  createdAt: string
  updatedAt: string
}

interface StockData {
  symbol: string
  name: string
  current_price: number
  daily_change: number
  daily_change_percent: number
}

export default function Watchlists() {
  const [watchlists, setWatchlists] = useState<Watchlist[]>([])
  const [selectedWatchlist, setSelectedWatchlist] = useState<Watchlist | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showAddSymbolModal, setShowAddSymbolModal] = useState(false)
  const [newWatchlistName, setNewWatchlistName] = useState('')
  const [newWatchlistDescription, setNewWatchlistDescription] = useState('')
  const [newSymbol, setNewSymbol] = useState('')
  const [editingWatchlist, setEditingWatchlist] = useState<Watchlist | null>(null)
  const [stockData, setStockData] = useState<Record<string, StockData>>({})
  const [loading, setLoading] = useState(false)

  // Load watchlists from localStorage on component mount
  useEffect(() => {
    const savedWatchlists = localStorage.getItem('watchlists')
    if (savedWatchlists) {
      setWatchlists(JSON.parse(savedWatchlists))
    }
  }, [])

  // Save watchlists to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('watchlists', JSON.stringify(watchlists))
  }, [watchlists])

  // Fetch stock data for symbols in selected watchlist
  useEffect(() => {
    if (selectedWatchlist) {
      fetchStockDataForWatchlist(selectedWatchlist.symbols)
    }
  }, [selectedWatchlist])

  const fetchStockDataForWatchlist = async (symbols: string[]) => {
    setLoading(true)
    const newStockData: Record<string, StockData> = {}
    
    for (const symbol of symbols) {
      try {
        const response = await fetch(`http://localhost:8000/ticker/${symbol.toUpperCase()}?range=1d`)
        if (response.ok) {
          const data = await response.json()
          newStockData[symbol] = {
            symbol: data.symbol,
            name: data.name,
            current_price: data.current_price,
            daily_change: data.daily_change,
            daily_change_percent: data.daily_change_percent
          }
        }
      } catch (error) {
        console.error(`Failed to fetch data for ${symbol}:`, error)
      }
    }
    
    setStockData(newStockData)
    setLoading(false)
  }

  const createWatchlist = () => {
    if (!newWatchlistName.trim()) return

    const newWatchlist: Watchlist = {
      id: Date.now().toString(),
      name: newWatchlistName.trim(),
      description: newWatchlistDescription.trim(),
      symbols: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    setWatchlists([...watchlists, newWatchlist])
    setNewWatchlistName('')
    setNewWatchlistDescription('')
    setShowCreateModal(false)
    setSelectedWatchlist(newWatchlist)
  }

  const deleteWatchlist = (id: string) => {
    setWatchlists(watchlists.filter(w => w.id !== id))
    if (selectedWatchlist?.id === id) {
      setSelectedWatchlist(null)
    }
  }

  const addSymbolToWatchlist = (watchlistId: string, symbol: string) => {
    if (!symbol.trim()) return

    const symbolUpper = symbol.trim().toUpperCase()
    setWatchlists(watchlists.map(w => {
      if (w.id === watchlistId) {
        const updatedSymbols = w.symbols.includes(symbolUpper) 
          ? w.symbols 
          : [...w.symbols, symbolUpper]
        return {
          ...w,
          symbols: updatedSymbols,
          updatedAt: new Date().toISOString()
        }
      }
      return w
    }))

    setNewSymbol('')
    setShowAddSymbolModal(false)
  }

  const removeSymbolFromWatchlist = (watchlistId: string, symbol: string) => {
    setWatchlists(watchlists.map(w => {
      if (w.id === watchlistId) {
        return {
          ...w,
          symbols: w.symbols.filter(s => s !== symbol),
          updatedAt: new Date().toISOString()
        }
      }
      return w
    }))
  }

  const updateWatchlist = (watchlist: Watchlist) => {
    setWatchlists(watchlists.map(w => {
      if (w.id === watchlist.id) {
        return {
          ...watchlist,
          updatedAt: new Date().toISOString()
        }
      }
      return w
    }))
    setEditingWatchlist(null)
  }

  const addSymbolsFromScreener = (symbols: string[]) => {
    if (!selectedWatchlist) return

    const uniqueSymbols = Array.from(new Set([...selectedWatchlist.symbols, ...symbols]))
    setWatchlists(watchlists.map(w => {
      if (w.id === selectedWatchlist.id) {
        return {
          ...w,
          symbols: uniqueSymbols,
          updatedAt: new Date().toISOString()
        }
      }
      return w
    }))
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Watchlists</h1>
          <p className="text-muted-foreground">Manage your stock watchlists for backtesting</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Watchlist
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Watchlist List */}
        <div className="lg:col-span-1">
          <div className="card-glow p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Your Watchlists</h3>
            
            {watchlists.length === 0 ? (
              <div className="text-center py-8">
                <Bookmark className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">No watchlists yet</p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors"
                >
                  Create First Watchlist
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {watchlists.map((watchlist) => (
                  <div
                    key={watchlist.id}
                    className={`p-3 rounded-lg cursor-pointer transition-all duration-200 ${
                      selectedWatchlist?.id === watchlist.id
                        ? 'bg-purple-500 text-white'
                        : 'bg-card/50 hover:bg-card/70 text-muted-foreground hover:text-white'
                    }`}
                    onClick={() => setSelectedWatchlist(watchlist)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium">{watchlist.name}</h4>
                        <p className="text-sm opacity-75">
                          {watchlist.symbols.length} symbols
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingWatchlist(watchlist)
                          }}
                          className="p-1 hover:bg-white/10 rounded transition-colors"
                        >
                          <Edit className="h-3 w-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteWatchlist(watchlist.id)
                          }}
                          className="p-1 hover:bg-red-500/20 rounded transition-colors"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Watchlist Details */}
        <div className="lg:col-span-2">
          {selectedWatchlist ? (
            <div className="card-glow p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-white">{selectedWatchlist.name}</h2>
                  {selectedWatchlist.description && (
                    <p className="text-muted-foreground mt-1">{selectedWatchlist.description}</p>
                  )}
                  <p className="text-sm text-muted-foreground mt-2">
                    Created {new Date(selectedWatchlist.createdAt).toLocaleDateString()} • 
                    Updated {new Date(selectedWatchlist.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowAddSymbolModal(true)}
                    className="flex items-center gap-2 px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    Add Symbol
                  </button>
                  <button
                    onClick={() => {
                      // Navigate to backtest with this watchlist selected
                      window.location.href = `/backtest?watchlist=${selectedWatchlist.id}`
                    }}
                    className="flex items-center gap-2 px-3 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg transition-colors"
                  >
                    <Play className="h-4 w-4" />
                    Backtest
                  </button>
                </div>
              </div>

              {selectedWatchlist.symbols.length === 0 ? (
                <div className="text-center py-12">
                  <Target className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground mb-4">No symbols in this watchlist</p>
                  <button
                    onClick={() => setShowAddSymbolModal(true)}
                    className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
                  >
                    Add Your First Symbol
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-white">
                      Symbols ({selectedWatchlist.symbols.length})
                    </h3>
                    {loading && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                        Loading data...
                      </div>
                    )}
                  </div>
                  
                  <div className="grid gap-3">
                    {selectedWatchlist.symbols.map((symbol) => {
                      const stock = stockData[symbol]
                      return (
                        <div
                          key={symbol}
                          className="flex items-center justify-between p-3 bg-card/30 rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <div>
                              <h4 className="font-medium text-white">{symbol}</h4>
                              {stock && (
                                <p className="text-sm text-muted-foreground">{stock.name}</p>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-4">
                            {stock ? (
                              <>
                                <div className="text-right">
                                  <div className="font-medium text-white">
                                    ${stock.current_price.toFixed(2)}
                                  </div>
                                  <div className={`flex items-center gap-1 text-sm ${
                                    stock.daily_change >= 0 ? 'text-green-400' : 'text-red-400'
                                  }`}>
                                    {stock.daily_change >= 0 ? (
                                      <TrendingUp className="h-3 w-3" />
                                    ) : (
                                      <TrendingDown className="h-3 w-3" />
                                    )}
                                    {stock.daily_change >= 0 ? '+' : ''}{stock.daily_change.toFixed(2)} ({stock.daily_change_percent.toFixed(2)}%)
                                  </div>
                                </div>
                              </>
                            ) : (
                              <div className="text-sm text-muted-foreground">No data</div>
                            )}
                            
                            <button
                              onClick={() => removeSymbolFromWatchlist(selectedWatchlist.id, symbol)}
                              className="p-1 hover:bg-red-500/20 rounded transition-colors"
                            >
                              <X className="h-4 w-4 text-red-400" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="card-glow p-6">
              <div className="text-center py-12">
                <Bookmark className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">Select a Watchlist</h3>
                <p className="text-muted-foreground">
                  Choose a watchlist from the left to view its details and manage symbols
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Watchlist Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-white mb-4">Create New Watchlist</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  Name
                </label>
                <input
                  type="text"
                  value={newWatchlistName}
                  onChange={(e) => setNewWatchlistName(e.target.value)}
                  placeholder="Enter watchlist name"
                  className="w-full px-4 py-3 bg-card/50 border border-white/10 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  Description (Optional)
                </label>
                <textarea
                  value={newWatchlistDescription}
                  onChange={(e) => setNewWatchlistDescription(e.target.value)}
                  placeholder="Enter description"
                  rows={3}
                  className="w-full px-4 py-3 bg-card/50 border border-white/10 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white"
                />
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createWatchlist}
                disabled={!newWatchlistName.trim()}
                className="flex-1 px-4 py-2 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Symbol Modal */}
      {showAddSymbolModal && selectedWatchlist && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-white mb-4">
              Add Symbol to {selectedWatchlist.name}
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  Symbol
                </label>
                <input
                  type="text"
                  value={newSymbol}
                  onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
                  placeholder="Enter ticker symbol (e.g., AAPL)"
                  className="w-full px-4 py-3 bg-card/50 border border-white/10 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white"
                />
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowAddSymbolModal(false)}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => addSymbolToWatchlist(selectedWatchlist.id, newSymbol)}
                disabled={!newSymbol.trim()}
                className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Watchlist Modal */}
      {editingWatchlist && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-white mb-4">Edit Watchlist</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  Name
                </label>
                <input
                  type="text"
                  value={editingWatchlist.name}
                  onChange={(e) => setEditingWatchlist({...editingWatchlist, name: e.target.value})}
                  className="w-full px-4 py-3 bg-card/50 border border-white/10 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-2">
                  Description
                </label>
                <textarea
                  value={editingWatchlist.description}
                  onChange={(e) => setEditingWatchlist({...editingWatchlist, description: e.target.value})}
                  rows={3}
                  className="w-full px-4 py-3 bg-card/50 border border-white/10 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white"
                />
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEditingWatchlist(null)}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => updateWatchlist(editingWatchlist)}
                disabled={!editingWatchlist.name.trim()}
                className="flex-1 px-4 py-2 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 