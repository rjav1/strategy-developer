'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

// Types
interface WatchlistItem {
  id: string
  name: string
  description?: string
  symbols: string[]
  created_at: string
  updated_at: string
}

interface WatchlistContextType {
  watchlists: WatchlistItem[]
  selectedWatchlistId: string | null
  isLoading: boolean
  error: string | null
  createWatchlist: (name: string, description?: string) => Promise<WatchlistItem | null>
  selectWatchlist: (id: string) => void
  addToWatchlist: (symbol: string, watchlistId?: string) => Promise<boolean>
  removeFromWatchlist: (symbol: string, watchlistId?: string) => Promise<boolean>
  refreshWatchlists: () => Promise<void>
  isInWatchlist: (symbol: string, watchlistId?: string) => boolean
  getSelectedWatchlist: () => WatchlistItem | null
  deleteWatchlist: (id: string) => Promise<boolean>
  updatePrices: (watchlistId: string) => Promise<any>
}

interface WatchlistProviderProps {
  children: ReactNode
}

interface WatchlistsResponse {
  watchlists: WatchlistItem[]
}

// Create context
const WatchlistContext = createContext<WatchlistContextType | undefined>(undefined)

// Custom hook to use the watchlist context
export const useWatchlist = (): WatchlistContextType => {
  const context = useContext(WatchlistContext)
  if (!context) {
    throw new Error('useWatchlist must be used within a WatchlistProvider')
  }
  return context
}

// Provider component
export const WatchlistProvider: React.FC<WatchlistProviderProps> = ({ children }) => {
  const [watchlists, setWatchlists] = useState<WatchlistItem[]>([])
  const [selectedWatchlistId, setSelectedWatchlistId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // API base URL
  const API_BASE_URL = 'http://localhost:8000'

  // Load selected watchlist from localStorage
  useEffect(() => {
    const savedSelectedId = localStorage.getItem('selectedWatchlistId')
    if (savedSelectedId) {
      setSelectedWatchlistId(savedSelectedId)
    }
  }, [])

  // Save selected watchlist to localStorage
  useEffect(() => {
    if (selectedWatchlistId) {
      localStorage.setItem('selectedWatchlistId', selectedWatchlistId)
    }
  }, [selectedWatchlistId])

  /**
   * Fetch all watchlists from the backend
   */
  const fetchWatchlists = async (): Promise<WatchlistItem[]> => {
    const response = await fetch(`${API_BASE_URL}/watchlists`)
    if (!response.ok) {
      throw new Error(`Failed to fetch watchlists: ${response.statusText}`)
    }
    const data: WatchlistsResponse = await response.json()
    return data.watchlists
  }

  /**
   * Create a new watchlist
   */
  const createWatchlist = async (name: string, description?: string): Promise<WatchlistItem | null> => {
    try {
      setError(null)
      const requestBody: { name: string; description?: string } = { name: name.trim() }
      if (description?.trim()) {
        requestBody.description = description.trim()
      }
      
      const response = await fetch(`${API_BASE_URL}/watchlists`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }))
        throw new Error(errorData.detail || `Failed to create watchlist: ${response.statusText}`)
      }

      const newWatchlist: WatchlistItem = await response.json()
      setWatchlists(prev => [...prev, newWatchlist])
      
      // Auto-select the newly created watchlist
      setSelectedWatchlistId(newWatchlist.id)
      
      return newWatchlist
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create watchlist'
      setError(errorMessage)
      console.error('Error creating watchlist:', err)
      return null
    }
  }

  /**
   * Select a watchlist as the current target
   */
  const selectWatchlist = (id: string): void => {
    setSelectedWatchlistId(id)
  }

  /**
   * Add a symbol to a watchlist
   */
  const addToWatchlist = async (symbol: string, watchlistId?: string): Promise<boolean> => {
    const targetId = watchlistId || selectedWatchlistId
    if (!targetId) {
      setError('No watchlist selected')
      return false
    }

    try {
      setError(null)
      const response = await fetch(`${API_BASE_URL}/watchlists/${targetId}/symbols`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ symbol: symbol.toUpperCase().trim() }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }))
        throw new Error(errorData.detail || `Failed to add to watchlist: ${response.statusText}`)
      }

      const updatedWatchlist: WatchlistItem = await response.json()
      setWatchlists(prev => prev.map(wl => wl.id === targetId ? updatedWatchlist : wl))
      return true
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add to watchlist'
      setError(errorMessage)
      console.error('Error adding to watchlist:', err)
      return false
    }
  }

  /**
   * Remove a symbol from a watchlist
   */
  const removeFromWatchlist = async (symbol: string, watchlistId?: string): Promise<boolean> => {
    const targetId = watchlistId || selectedWatchlistId
    if (!targetId) {
      setError('No watchlist selected')
      return false
    }

    try {
      setError(null)
      const response = await fetch(`${API_BASE_URL}/watchlists/${targetId}/symbols/${encodeURIComponent(symbol.toUpperCase().trim())}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }))
        throw new Error(errorData.detail || `Failed to remove from watchlist: ${response.statusText}`)
      }

      const updatedWatchlist: WatchlistItem = await response.json()
      setWatchlists(prev => prev.map(wl => wl.id === targetId ? updatedWatchlist : wl))
      return true
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to remove from watchlist'
      setError(errorMessage)
      console.error('Error removing from watchlist:', err)
      return false
    }
  }

  /**
   * Delete a watchlist
   */
  const deleteWatchlist = async (id: string): Promise<boolean> => {
    try {
      setError(null)
      const response = await fetch(`${API_BASE_URL}/watchlists/${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }))
        throw new Error(errorData.detail || `Failed to delete watchlist: ${response.statusText}`)
      }

      setWatchlists(prev => prev.filter(wl => wl.id !== id))
      
      // If the deleted watchlist was selected, clear selection
      if (selectedWatchlistId === id) {
        setSelectedWatchlistId(null)
      }
      
      return true
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete watchlist'
      setError(errorMessage)
      console.error('Error deleting watchlist:', err)
      return false
    }
  }

  /**
   * Refresh all watchlists from the backend
   */
  const refreshWatchlists = async (): Promise<void> => {
    setIsLoading(true)
    setError(null)
    try {
      const fetchedWatchlists = await fetchWatchlists()
      setWatchlists(fetchedWatchlists)
      
      // If no watchlist is selected and we have watchlists, select the first one
      if (!selectedWatchlistId && fetchedWatchlists.length > 0) {
        setSelectedWatchlistId(fetchedWatchlists[0].id)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch watchlists'
      setError(errorMessage)
      console.error('Error fetching watchlists:', err)
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * Check if a symbol is in a watchlist
   */
  const isInWatchlist = (symbol: string, watchlistId?: string): boolean => {
    const targetId = watchlistId || selectedWatchlistId
    if (!targetId) return false
    
    const watchlist = watchlists.find(wl => wl.id === targetId)
    return watchlist ? watchlist.symbols.includes(symbol.toUpperCase().trim()) : false
  }

  /**
   * Get the currently selected watchlist
   */
  const getSelectedWatchlist = (): WatchlistItem | null => {
    if (!selectedWatchlistId) return null
    return watchlists.find(wl => wl.id === selectedWatchlistId) || null
  }

  /**
   * Update prices for a specific watchlist
   */
  const updatePrices = async (watchlistId: string): Promise<any> => {
    try {
      setError(null)
      const response = await fetch(`${API_BASE_URL}/watchlists/${watchlistId}/update-prices`, {
        method: 'POST',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }))
        throw new Error(errorData.detail || `Failed to update prices: ${response.statusText}`)
      }

      const data = await response.json()
      return data
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update prices'
      setError(errorMessage)
      console.error('Error updating prices:', err)
      throw err
    }
  }

  // Load watchlists on mount
  useEffect(() => {
    refreshWatchlists()
  }, [])

  const value: WatchlistContextType = {
    watchlists,
    selectedWatchlistId,
    isLoading,
    error,
    createWatchlist,
    selectWatchlist,
    addToWatchlist,
    removeFromWatchlist,
    refreshWatchlists,
    isInWatchlist,
    getSelectedWatchlist,
    deleteWatchlist,
    updatePrices,
  }

  return (
    <WatchlistContext.Provider value={value}>
      {children}
    </WatchlistContext.Provider>
  )
}

export default WatchlistProvider