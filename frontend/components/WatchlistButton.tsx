'use client'

import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Check, X } from 'lucide-react'
import { useWatchlist } from '../app/providers/WatchlistProvider'

interface WatchlistButtonProps {
  symbol: string
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

interface WatchlistSelectorModalProps {
  symbol: string
  isOpen: boolean
  onClose: () => void
}

const WatchlistSelectorModal: React.FC<WatchlistSelectorModalProps> = ({ symbol, isOpen, onClose }) => {
  const { 
    watchlists, 
    createWatchlist, 
    addToWatchlist, 
    removeFromWatchlist, 
    isInWatchlist,
    selectWatchlist 
  } = useWatchlist()
  
  const [newWatchlistName, setNewWatchlistName] = useState('')
  const [newWatchlistDescription, setNewWatchlistDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const handleCreateAndAdd = async () => {
    if (!newWatchlistName.trim()) return

    setCreating(true)
    setCreateError('')

    try {
      const newWatchlist = await createWatchlist(newWatchlistName.trim(), newWatchlistDescription.trim())
      if (newWatchlist) {
        await addToWatchlist(symbol, newWatchlist.id)
        setNewWatchlistName('')
        setNewWatchlistDescription('')
        onClose()
      } else {
        setCreateError('Failed to create watchlist')
      }
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Failed to create watchlist')
    } finally {
      setCreating(false)
    }
  }

  const handleToggleSymbol = async (watchlistId: string) => {
    const inWatchlist = isInWatchlist(symbol, watchlistId)
    
    if (inWatchlist) {
      await removeFromWatchlist(symbol, watchlistId)
    } else {
      await addToWatchlist(symbol, watchlistId)
      selectWatchlist(watchlistId) // Set as selected for future additions
    }
  }

  if (!isOpen) return null

  const modalContent = (
    <div 
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-[99999] p-4" 
      style={{ 
        zIndex: 99999,
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0
      }}
    >
      <div 
        className="bg-gray-900 rounded-xl max-w-md w-full max-h-[85vh] overflow-hidden shadow-2xl relative"
        style={{ zIndex: 100000 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">
            Add {symbol} to Watchlist
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(85vh-120px)]">
          {/* Create New Watchlist */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-white mb-4">Create New Watchlist</h3>
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
              
              <button
                onClick={handleCreateAndAdd}
                disabled={creating || !newWatchlistName.trim()}
                className="w-full p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium"
              >
                <Plus className="w-4 h-4 inline mr-2" />
                {creating ? 'Creating...' : 'Create & Add'}
              </button>
            </div>
          </div>

          {/* Existing Watchlists */}
          {watchlists.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-white mb-4">Select Watchlist</h3>
              <div className="space-y-3">
                {watchlists.map((watchlist) => {
                  const inWatchlist = isInWatchlist(symbol, watchlist.id)
                  
                  return (
                    <button
                      key={watchlist.id}
                      onClick={() => handleToggleSymbol(watchlist.id)}
                      className={`w-full flex items-center justify-between p-4 rounded-lg border transition-all hover:scale-[1.02] ${
                        inWatchlist
                          ? 'bg-green-500/10 border-green-500/30 text-green-400 shadow-lg shadow-green-500/10'
                          : 'bg-gray-800/50 border-gray-700 text-gray-300 hover:border-gray-600 hover:bg-gray-800'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all ${
                          inWatchlist 
                            ? 'bg-green-500 border-green-500 shadow-lg shadow-green-500/25' 
                            : 'border-gray-500 hover:border-gray-400'
                        }`}>
                          {inWatchlist && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <div className="text-left">
                          <p className="font-semibold text-base">{watchlist.name}</p>
                          <p className="text-sm opacity-75 mt-1">
                            {watchlist.description || `${watchlist.symbols.length} symbol${watchlist.symbols.length !== 1 ? 's' : ''}`}
                          </p>
                        </div>
                      </div>
                      <div className={`text-sm font-medium px-3 py-1 rounded-full transition-colors ${
                        inWatchlist 
                          ? 'bg-green-500/20 text-green-400' 
                          : 'bg-blue-500/20 text-blue-400'
                      }`}>
                        {inWatchlist ? 'Remove' : 'Add'}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {watchlists.length === 0 && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-xl mx-auto mb-4 flex items-center justify-center border border-blue-500/20">
                <Plus className="w-8 h-8 text-blue-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-300 mb-2">No watchlists yet</h3>
              <p className="text-gray-500 text-sm">Create your first watchlist above to get started</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  return typeof window !== 'undefined' ? createPortal(modalContent, document.body) : null
}

/**
 * Unified watchlist button component that handles adding/removing symbols
 * with a modal for watchlist selection
 */
const WatchlistButton: React.FC<WatchlistButtonProps> = ({ 
  symbol, 
  className = '', 
  size = 'md' 
}) => {
  const { 
    watchlists, 
    selectedWatchlistId, 
    addToWatchlist, 
    removeFromWatchlist, 
    isInWatchlist,
    getSelectedWatchlist 
  } = useWatchlist()
  
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(false)

  // Get the currently selected watchlist or the first available one
  const targetWatchlist = getSelectedWatchlist() || (watchlists.length > 0 ? watchlists[0] : null)
  const isInCurrentWatchlist = targetWatchlist ? isInWatchlist(symbol, targetWatchlist.id) : false

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm', 
    lg: 'px-5 py-2.5 text-base'
  }

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
  }

  const handleQuickAction = async () => {
    // Always show modal for watchlist selection
    setShowModal(true)
  }

  const handleLongPress = () => {
    // Show modal for watchlist selection
    setShowModal(true)
  }

  return (
    <>
      <button
        onClick={handleQuickAction}
        disabled={loading}
        className={`
          ${sizeClasses[size]} 
          rounded-lg text-sm font-medium transition-all duration-200 disabled:opacity-50 border
          ${isInCurrentWatchlist
            ? 'bg-gradient-to-r from-green-500/20 to-emerald-500/20 hover:from-green-500/30 hover:to-emerald-500/30 text-green-400 border-green-500/30 hover:border-green-400/50'
            : 'bg-gradient-to-r from-orange-500/20 to-red-500/20 hover:from-orange-500/30 hover:to-red-500/30 text-orange-400 border-orange-500/30 hover:border-orange-400/50'
          }
          ${className}
        `}
        title={
          targetWatchlist 
            ? (isInCurrentWatchlist 
                ? `Remove from ${targetWatchlist.name}` 
                : `Add to ${targetWatchlist.name}`)
            : 'Add to watchlist'
        }
      >
        {isInCurrentWatchlist ? 'Remove' : 'Watch'}
      </button>

      <WatchlistSelectorModal
        symbol={symbol}
        isOpen={showModal}
        onClose={() => setShowModal(false)}
      />
    </>
  )
}

export default WatchlistButton