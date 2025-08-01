'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, Eye, TrendingUp, TrendingDown, MoreVertical, X, Bookmark, RefreshCw, AlertCircle } from 'lucide-react'
import { useWatchlist } from '../providers/WatchlistProvider'

interface StockData {
  symbol: string
  name: string
  current_price: number
  daily_change: number
  daily_change_percent: number
}

interface WatchlistDetailProps {
  watchlistId: string
  onClose: () => void
}

const WatchlistDetail: React.FC<WatchlistDetailProps> = ({ watchlistId, onClose }) => {
  const { watchlists, removeFromWatchlist, addToWatchlist } = useWatchlist()
  const [stockData, setStockData] = useState<Record<string, StockData>>({})
  const [loading, setLoading] = useState(false)
  const [newSymbol, setNewSymbol] = useState('')
  const [addingSymbol, setAddingSymbol] = useState(false)

  const watchlist = watchlists.find(wl => wl.id === watchlistId)

  useEffect(() => {
    if (watchlist && watchlist.symbols.length > 0) {
      fetchStockData()
    }
  }, [watchlist])

  const fetchStockData = async () => {
    if (!watchlist || watchlist.symbols.length === 0) return

    setLoading(true)
    const newStockData: Record<string, StockData> = {}

    try {
      const promises = watchlist.symbols.map(async (symbol) => {
        try {
          const response = await fetch(`http://localhost:8000/ticker/${symbol}?range=1d`)
          if (response.ok) {
            const data = await response.json()
            newStockData[symbol] = {
              symbol: data.symbol,
              name: data.name || symbol,
              current_price: data.current_price || 0,
              daily_change: data.daily_change || 0,
              daily_change_percent: data.daily_change_percent || 0,
            }
          }
        } catch (error) {
          console.error(`Error fetching data for ${symbol}:`, error)
          newStockData[symbol] = {
            symbol,
            name: symbol,
            current_price: 0,
            daily_change: 0,
            daily_change_percent: 0,
          }
        }
      })

      await Promise.all(promises)
      setStockData(newStockData)
    } catch (error) {
      console.error('Error fetching stock data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveSymbol = async (symbol: string) => {
    await removeFromWatchlist(symbol, watchlistId)
  }

  const handleAddSymbol = async () => {
    if (!newSymbol.trim()) return
    
    const symbol = newSymbol.trim().toUpperCase()
    
    // Check if symbol already exists in watchlist
    if (watchlist?.symbols.includes(symbol)) {
      alert('Symbol already exists in this watchlist')
      return
    }
    
    setAddingSymbol(true)
    try {
      await addToWatchlist(symbol, watchlistId)
      setNewSymbol('')
      // Refresh stock data to include the new symbol
      setTimeout(() => {
        fetchStockData()
      }, 500)
    } catch (error) {
      console.error('Error adding symbol:', error)
      alert('Failed to add symbol')
    } finally {
      setAddingSymbol(false)
    }
  }

  if (!watchlist) return null

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9000] p-4">
      <div className="bg-gray-900 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div>
            <h2 className="text-2xl font-bold text-white">{watchlist.name}</h2>
            <p className="text-gray-400 text-sm mt-1">
              {watchlist.symbols.length} symbol{watchlist.symbols.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchStockData}
              disabled={loading}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
              title="Refresh prices"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* Add Symbol Section */}
          <div className="mb-6 p-4 bg-gray-800 rounded-lg">
            <h3 className="text-sm font-medium text-gray-300 mb-3">Add New Symbol</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={newSymbol}
                onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
                onKeyPress={(e) => e.key === 'Enter' && handleAddSymbol()}
                placeholder="Enter stock symbol (e.g., AAPL)"
                className="flex-1 px-3 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none text-sm font-mono"
                disabled={addingSymbol}
              />
              <button
                onClick={handleAddSymbol}
                disabled={addingSymbol || !newSymbol.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm"
              >
                {addingSymbol ? 'Adding...' : 'Add'}
              </button>
            </div>
          </div>

          {watchlist.symbols.length === 0 ? (
            <div className="text-center py-12">
              <Bookmark className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-400 mb-2">No symbols yet</h3>
              <p className="text-gray-500">Add symbols from the screener or manually</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {watchlist.symbols.map((symbol) => {
                const stock = stockData[symbol]
                const isPositive = stock?.daily_change_percent >= 0

                return (
                  <div
                    key={symbol}
                    className="flex items-center justify-between p-4 bg-gray-800 rounded-lg hover:bg-gray-750 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-4">
                        <div>
                          <h4 className="font-mono font-semibold text-blue-400 text-lg">
                            {symbol}
                          </h4>
                          <p className="text-gray-400 text-sm">
                            {loading ? (
                              <div className="w-32 h-4 bg-gray-700 rounded animate-pulse"></div>
                            ) : (
                              stock?.name || symbol
                            )}
                          </p>
                        </div>
                        
                        <div className="flex items-center gap-6 ml-auto">
                          <div className="text-right">
                            <div className="font-semibold text-white text-lg">
                              {loading ? (
                                <div className="w-20 h-5 bg-gray-700 rounded animate-pulse"></div>
                              ) : (
                                `$${stock?.current_price?.toFixed(2) || '0.00'}`
                              )}
                            </div>
                            {loading ? (
                              <div className="w-16 h-4 bg-gray-700 rounded animate-pulse mt-1"></div>
                            ) : stock ? (
                              <div className={`flex items-center gap-1 text-sm ${
                                isPositive ? 'text-green-400' : 'text-red-400'
                              }`}>
                                {isPositive ? (
                                  <TrendingUp className="w-4 h-4" />
                                ) : (
                                  <TrendingDown className="w-4 h-4" />
                                )}
                                <span>
                                  {isPositive ? '+' : ''}
                                  {stock.daily_change?.toFixed(2)} ({isPositive ? '+' : ''}
                                  {stock.daily_change_percent?.toFixed(2)}%)
                                </span>
                              </div>
                            ) : null}
                          </div>
                          
                          <button
                            onClick={() => handleRemoveSymbol(symbol)}
                            className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded-lg transition-colors"
                            title="Remove from watchlist"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Watchlists() {
  const { 
    watchlists, 
    isLoading, 
    error, 
    createWatchlist, 
    deleteWatchlist,
    refreshWatchlists 
  } = useWatchlist()

  const [selectedWatchlistId, setSelectedWatchlistId] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newWatchlistName, setNewWatchlistName] = useState('')
  const [newWatchlistDescription, setNewWatchlistDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const handleCreateWatchlist = async () => {
    if (!newWatchlistName.trim()) return

    setCreating(true)
    setCreateError('')

    try {
      const newWatchlist = await createWatchlist(newWatchlistName.trim(), newWatchlistDescription.trim())
      if (newWatchlist) {
        setNewWatchlistName('')
        setNewWatchlistDescription('')
        setShowCreateModal(false)
      } else {
        setCreateError('Failed to create watchlist')
      }
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Failed to create watchlist')
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteWatchlist = async (id: string) => {
    if (confirm('Are you sure you want to delete this watchlist?')) {
      await deleteWatchlist(id)
    }
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Watchlists</h1>
            <p className="text-gray-400">
              Create and manage your stock watchlists
            </p>
          </div>
          <button
            onClick={refreshWatchlists}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-900 border border-red-700 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-400" />
              <span className="text-red-400 font-medium">Error</span>
            </div>
            <p className="text-red-300 mt-2">{error}</p>
          </div>
        )}

        {/* Watchlists Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Create New Watchlist Card */}
          <div
            onClick={() => setShowCreateModal(true)}
            className="group relative p-6 bg-gradient-to-br from-blue-900/20 to-purple-900/20 border-2 border-dashed border-blue-500/30 rounded-xl hover:border-blue-500/50 transition-all cursor-pointer hover:scale-105"
          >
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-blue-500/30 transition-colors">
                <Plus className="w-8 h-8 text-blue-400" />
              </div>
              <h3 className="text-lg font-semibold text-blue-400 mb-2">Create New Watchlist</h3>
              <p className="text-gray-500 text-sm">Start tracking your favorite stocks</p>
            </div>
          </div>

          {/* Existing Watchlists */}
          {watchlists.map((watchlist) => (
            <div
              key={watchlist.id}
              className="group relative p-6 bg-gray-900 rounded-xl border border-gray-700 hover:border-gray-600 transition-all hover:scale-105 hover:shadow-xl"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-blue-400 transition-colors">
                    {watchlist.name}
                  </h3>
                  <p className="text-gray-400 text-sm">
                    {watchlist.description || 'No description'}
                  </p>
                </div>
                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteWatchlist(watchlist.id)
                    }}
                    className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                    title="Delete watchlist"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Preview of symbols */}
              <div className="mb-4">
                {watchlist.symbols.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {watchlist.symbols.slice(0, 3).map((symbol) => (
                      <span
                        key={symbol}
                        className="px-2 py-1 bg-gray-800 text-gray-300 text-xs font-mono rounded"
                      >
                        {symbol}
                      </span>
                    ))}
                    {watchlist.symbols.length > 3 && (
                      <span className="px-2 py-1 bg-gray-700 text-gray-400 text-xs rounded">
                        +{watchlist.symbols.length - 3} more
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm italic">No symbols yet</p>
                )}
              </div>

              {/* View Button */}
              <button
                onClick={() => setSelectedWatchlistId(watchlist.id)}
                className="w-full flex items-center justify-center gap-2 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-lg transition-colors"
              >
                <Eye className="w-4 h-4" />
                View Details
              </button>

              {/* Updated timestamp */}
              <p className="text-xs text-gray-500 mt-3 text-center">
                Updated {new Date(watchlist.updated_at).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>

        {/* Empty State */}
        {!isLoading && watchlists.length === 0 && (
          <div className="text-center py-12">
            <Bookmark className="w-20 h-20 text-gray-600 mx-auto mb-6" />
            <h3 className="text-2xl font-semibold text-gray-400 mb-4">No watchlists yet</h3>
            <p className="text-gray-500">Add stocks to watchlists from the screener or use the "+" card above to create your first watchlist</p>
          </div>
        )}

        {/* Create Watchlist Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9000] p-4">
            <div className="bg-gray-900 rounded-xl max-w-md w-full p-6 shadow-2xl">
              <h2 className="text-xl font-bold text-white mb-4">Create New Watchlist</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Watchlist Name
                  </label>
                  <input
                    type="text"
                    value={newWatchlistName}
                    onChange={(e) => setNewWatchlistName(e.target.value)}
                    placeholder="Enter watchlist name"
                    className="w-full p-3 bg-gray-800 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                    disabled={creating}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Description (Optional)
                  </label>
                  <input
                    type="text"
                    value={newWatchlistDescription}
                    onChange={(e) => setNewWatchlistDescription(e.target.value)}
                    placeholder="Enter description"
                    className="w-full p-3 bg-gray-800 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                    disabled={creating}
                  />
                </div>
                
                {createError && (
                  <p className="text-red-400 text-sm">{createError}</p>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowCreateModal(false)
                    setNewWatchlistName('')
                    setNewWatchlistDescription('')
                    setCreateError('')
                  }}
                  className="flex-1 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
                  disabled={creating}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateWatchlist}
                  disabled={creating || !newWatchlistName.trim()}
                  className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Watchlist Detail Modal */}
        {selectedWatchlistId && (
          <WatchlistDetail
            watchlistId={selectedWatchlistId}
            onClose={() => setSelectedWatchlistId(null)}
          />
        )}
      </div>
    </div>
  )
}