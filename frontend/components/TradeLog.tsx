'use client'

import React, { useState } from 'react'
import { 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  DollarSign,
  Clock,
  Filter,
  ChevronDown,
  ChevronUp
} from 'lucide-react'

interface Trade {
  entry_date: string
  entry_price: number
  exit_date?: string
  exit_price?: number
  pnl?: number
  holding_period?: number
  status: 'open' | 'closed'
  exit_reason?: string
}

interface TradeLogProps {
  trades: Trade[]
  ticker: string
}

export default function TradeLog({ trades, ticker }: TradeLogProps) {
  const [sortBy, setSortBy] = useState<'date' | 'pnl' | 'holding_period'>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [filterStatus, setFilterStatus] = useState<'all' | 'open' | 'closed'>('all')

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: '2-digit'
    })
  }

  const getPerformanceColor = (value: number) => {
    return value >= 0 ? 'text-green-400' : 'text-red-400'
  }

  const getPerformanceBg = (value: number) => {
    return value >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'
  }

  // Filter and sort trades
  const filteredTrades = trades.filter(trade => {
    if (filterStatus === 'all') return true
    return trade.status === filterStatus
  })

  const sortedTrades = [...filteredTrades].sort((a, b) => {
    let valueA: any, valueB: any
    
    switch (sortBy) {
      case 'date':
        valueA = new Date(a.entry_date).getTime()
        valueB = new Date(b.entry_date).getTime()
        break
      case 'pnl':
        valueA = a.pnl || 0
        valueB = b.pnl || 0
        break
      case 'holding_period':
        valueA = a.holding_period || 0
        valueB = b.holding_period || 0
        break
      default:
        return 0
    }
    
    if (sortOrder === 'asc') {
      return valueA - valueB
    } else {
      return valueB - valueA
    }
  })

  const handleSort = (field: 'date' | 'pnl' | 'holding_period') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('desc')
    }
  }

  const SortButton = ({ field, children }: { field: 'date' | 'pnl' | 'holding_period', children: React.ReactNode }) => (
    <button
      onClick={() => handleSort(field)}
      className="flex items-center gap-1 text-muted-foreground hover:text-white transition-colors"
    >
      {children}
      {sortBy === field && (
        sortOrder === 'asc' ? 
        <ChevronUp className="h-3 w-3" /> : 
        <ChevronDown className="h-3 w-3" />
      )}
    </button>
  )

  const openTrades = trades.filter(t => t.status === 'open').length
  const closedTrades = trades.filter(t => t.status === 'closed').length
  const totalPnL = trades.reduce((sum, trade) => sum + (trade.pnl || 0), 0)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold text-white">Trade Log</h3>
          <p className="text-muted-foreground">
            {ticker} • {trades.length} total trades
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm">
            <span className="text-muted-foreground">Open: </span>
            <span className="text-blue-400 font-medium">{openTrades}</span>
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Closed: </span>
            <span className="text-white font-medium">{closedTrades}</span>
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Total P&L: </span>
            <span className={`font-bold ${getPerformanceColor(totalPnL)}`}>
              {formatCurrency(totalPnL)}
            </span>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as 'all' | 'open' | 'closed')}
            className="px-3 py-1 bg-card/50 border border-white/10 rounded-lg text-white text-sm"
          >
            <option value="all">All Trades</option>
            <option value="open">Open Trades</option>
            <option value="closed">Closed Trades</option>
          </select>
        </div>
        <div className="text-sm text-muted-foreground">
          Showing {sortedTrades.length} of {trades.length} trades
        </div>
      </div>

      {/* Trade Table */}
      <div className="card-glow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-card/30 border-b border-white/10">
              <tr>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">
                  Status
                </th>
                <th className="text-left p-4 text-sm font-medium">
                  <SortButton field="date">Entry Date</SortButton>
                </th>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">
                  Entry Price
                </th>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">
                  Exit Date
                </th>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">
                  Exit Price
                </th>
                <th className="text-left p-4 text-sm font-medium">
                  <SortButton field="holding_period">Hold Period</SortButton>
                </th>
                <th className="text-right p-4 text-sm font-medium">
                  <SortButton field="pnl">P&L</SortButton>
                </th>
                <th className="text-left p-4 text-sm font-medium text-muted-foreground">
                  Exit Reason
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {sortedTrades.map((trade, index) => (
                <tr 
                  key={index}
                  className={`hover:bg-white/5 transition-colors ${
                    trade.pnl ? getPerformanceBg(trade.pnl) : ''
                  }`}
                >
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      {trade.status === 'open' ? (
                        <div className="flex items-center gap-2 text-blue-400">
                          <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                          <span className="text-xs font-medium uppercase">Open</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-gray-400">
                          <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                          <span className="text-xs font-medium uppercase">Closed</span>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3 w-3 text-muted-foreground" />
                      <span className="text-white text-sm">
                        {formatDate(trade.entry_date)}
                      </span>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-3 w-3 text-green-400" />
                      <span className="text-white text-sm font-mono">
                        {formatCurrency(trade.entry_price)}
                      </span>
                    </div>
                  </td>
                  <td className="p-4">
                    {trade.exit_date ? (
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3 w-3 text-muted-foreground" />
                        <span className="text-white text-sm">
                          {formatDate(trade.exit_date)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </td>
                  <td className="p-4">
                    {trade.exit_price ? (
                      <div className="flex items-center gap-2">
                        <TrendingDown className="h-3 w-3 text-red-400" />
                        <span className="text-white text-sm font-mono">
                          {formatCurrency(trade.exit_price)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </td>
                  <td className="p-4">
                    {trade.holding_period ? (
                      <div className="flex items-center gap-2">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="text-white text-sm">
                          {trade.holding_period} days
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    {trade.pnl !== undefined ? (
                      <div className="flex items-center justify-end gap-2">
                        <DollarSign className={`h-3 w-3 ${getPerformanceColor(trade.pnl)}`} />
                        <span className={`text-sm font-bold ${getPerformanceColor(trade.pnl)}`}>
                          {trade.pnl >= 0 ? '+' : ''}{formatCurrency(trade.pnl)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </td>
                  <td className="p-4">
                    {trade.exit_reason ? (
                      <span className="text-xs px-2 py-1 bg-gray-700 rounded text-gray-300">
                        {trade.exit_reason}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {sortedTrades.length === 0 && (
          <div className="p-8 text-center">
            <div className="text-muted-foreground mb-2">No trades found</div>
            <div className="text-sm text-muted-foreground">
              {filterStatus !== 'all' 
                ? `No ${filterStatus} trades to display`
                : 'Run a backtest to see trade history'
              }
            </div>
          </div>
        )}
      </div>

      {/* Trade Summary */}
      {trades.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card-glow p-4">
            <h4 className="font-medium text-white mb-2">Best Trade</h4>
            <div className="text-2xl font-bold text-green-400">
              {formatCurrency(Math.max(...trades.map(t => t.pnl || 0)))}
            </div>
          </div>
          <div className="card-glow p-4">
            <h4 className="font-medium text-white mb-2">Worst Trade</h4>
            <div className="text-2xl font-bold text-red-400">
              {formatCurrency(Math.min(...trades.map(t => t.pnl || 0)))}
            </div>
          </div>
          <div className="card-glow p-4">
            <h4 className="font-medium text-white mb-2">Average Trade</h4>
            <div className={`text-2xl font-bold ${getPerformanceColor(totalPnL / trades.length)}`}>
              {formatCurrency(totalPnL / trades.length)}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}