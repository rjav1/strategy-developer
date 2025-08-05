'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

// Types
interface ScreenResult {
  symbol: string
  criteria_met: Record<string, boolean>
  total_met: number
  pattern_strength: string
  confidence_score?: number  // Optional for backward compatibility
  name?: string
}

interface ScreenerContextType {
  results: ScreenResult[]
  loading: boolean
  error: string | null
  selectedStocks: Set<string>
  allSelected: boolean
  setResults: (results: ScreenResult[]) => void
  clearResults: () => void
  lastScreenerParams: any
  setLastScreenerParams: (params: any) => void
  toggleStockSelection: (symbol: string) => void
  toggleSelectAll: () => void
  selectAllStocks: () => void
  deselectAllStocks: () => void
  clearSelection: () => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

interface ScreenerProviderProps {
  children: ReactNode
}

// Create context
const ScreenerContext = createContext<ScreenerContextType | undefined>(undefined)

// Custom hook to use the screener context
export const useScreener = (): ScreenerContextType => {
  const context = useContext(ScreenerContext)
  if (!context) {
    throw new Error('useScreener must be used within a ScreenerProvider')
  }
  return context
}

// Provider component
export const ScreenerProvider: React.FC<ScreenerProviderProps> = ({ children }) => {
  const [results, setResultsState] = useState<ScreenResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastScreenerParams, setLastScreenerParams] = useState<any>(null)
  const [selectedStocks, setSelectedStocks] = useState<Set<string>>(new Set())
  const [allSelected, setAllSelected] = useState(false)

  // Load cached results from localStorage on mount
  useEffect(() => {
    try {
      const cachedResults = localStorage.getItem('screener_results')
      const cachedParams = localStorage.getItem('screener_params')
      
      if (cachedResults) {
        const parsedResults = JSON.parse(cachedResults)
        setResultsState(parsedResults)
      }
      
      if (cachedParams) {
        const parsedParams = JSON.parse(cachedParams)
        setLastScreenerParams(parsedParams)
      }
    } catch (err) {
      console.error('Error loading cached screener data:', err)
    }
  }, [])

  /**
   * Set new results and persist to localStorage
   */
  const setResults = (newResults: ScreenResult[]): void => {
    setResultsState(newResults)
    try {
      localStorage.setItem('screener_results', JSON.stringify(newResults))
    } catch (err) {
      console.error('Error saving results to localStorage:', err)
    }
  }

  /**
   * Clear all results and cached data
   */
  const clearResults = (): void => {
    setResultsState([])
    setError(null)
    try {
      localStorage.removeItem('screener_results')
      localStorage.removeItem('screener_params')
    } catch (err) {
      console.error('Error clearing cached data:', err)
    }
  }

  /**
   * Set screener parameters and persist to localStorage
   */
  const setScreenerParams = (params: any): void => {
    setLastScreenerParams(params)
    try {
      localStorage.setItem('screener_params', JSON.stringify(params))
    } catch (err) {
      console.error('Error saving screener params to localStorage:', err)
    }
  }

  /**
   * Toggle selection of a single stock
   */
  const toggleStockSelection = (symbol: string): void => {
    setSelectedStocks(prev => {
      const newSet = new Set(prev)
      if (newSet.has(symbol)) {
        newSet.delete(symbol)
      } else {
        newSet.add(symbol)
      }
      return newSet
    })
  }

  /**
   * Toggle select all/deselect all
   */
  const toggleSelectAll = (): void => {
    if (allSelected) {
      setSelectedStocks(new Set())
      setAllSelected(false)
    } else {
      const allSymbols = new Set(results.map(r => r.symbol))
      setSelectedStocks(allSymbols)
      setAllSelected(true)
    }
  }

  /**
   * Select all stocks
   */
  const selectAllStocks = (): void => {
    const allSymbols = new Set(results.map(r => r.symbol))
    setSelectedStocks(allSymbols)
    setAllSelected(true)
  }

  /**
   * Deselect all stocks
   */
  const deselectAllStocks = (): void => {
    setSelectedStocks(new Set())
    setAllSelected(false)
  }

  /**
   * Clear all selections
   */
  const clearSelection = (): void => {
    setSelectedStocks(new Set())
    setAllSelected(false)
  }

  // Update allSelected when selectedStocks changes
  useEffect(() => {
    setAllSelected(results.length > 0 && selectedStocks.size === results.length)
  }, [selectedStocks, results])

  const value: ScreenerContextType = {
    results,
    loading: isLoading,
    error,
    selectedStocks,
    allSelected,
    setResults,
    clearResults,
    lastScreenerParams,
    setLastScreenerParams: setScreenerParams,
    toggleStockSelection,
    toggleSelectAll,
    selectAllStocks,
    deselectAllStocks,
    clearSelection,
    setLoading: setIsLoading,
    setError,
  }

  return (
    <ScreenerContext.Provider value={value}>
      {children}
    </ScreenerContext.Provider>
  )
}

export default ScreenerProvider