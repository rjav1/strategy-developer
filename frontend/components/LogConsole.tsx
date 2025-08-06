'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { X, Trash2, Download, Play, Pause, Settings, RefreshCw } from 'lucide-react'

interface LogEntry {
  timestamp: string
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'
  message: string
  context?: Record<string, any>
  module?: string
}

interface LogConsoleProps {
  isOpen: boolean
  onClose: () => void
  className?: string
  height?: number
  onHeightChange?: (height: number) => void
  backtestStatus?: {
    isRunning: boolean
    progress: number
    currentTicker: string
    phase: string
  }
}

const LOG_COLORS = {
  DEBUG: 'text-gray-400',
  INFO: 'text-blue-400',
  WARN: 'text-yellow-400',
  ERROR: 'text-red-400'
}

const LOG_BACKGROUNDS = {
  DEBUG: 'bg-gray-900/30',
  INFO: 'bg-blue-900/30',
  WARN: 'bg-yellow-900/30',
  ERROR: 'bg-red-900/30'
}

export default function LogConsole({ isOpen, onClose, className = '', height = 256, onHeightChange, backtestStatus }: LogConsoleProps) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [filter, setFilter] = useState<string>('')
  const [levelFilter, setLevelFilter] = useState<string>('ALL')
  const [showBacktestOnly, setShowBacktestOnly] = useState<boolean>(true)
  const [connectionAttempts, setConnectionAttempts] = useState(0)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [currentHeight, setCurrentHeight] = useState(height)
  
  const logsContainerRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const pausedLogsRef = useRef<LogEntry[]>([])
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const maxReconnectAttempts = 10

  // Update height when prop changes
  useEffect(() => {
    setCurrentHeight(height)
  }, [height])

  // Handle resize
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }

  const handleResize = useCallback((e: MouseEvent) => {
    if (!isResizing) return
    
    const newHeight = window.innerHeight - e.clientY
    const minHeight = 200
    const maxHeight = window.innerHeight * 0.8
    
    if (newHeight >= minHeight && newHeight <= maxHeight) {
      setCurrentHeight(newHeight)
      onHeightChange?.(newHeight)
    }
  }, [isResizing, onHeightChange])

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false)
  }, [])

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleResize)
      document.addEventListener('mouseup', handleResizeEnd)
      document.body.style.cursor = 'ns-resize'
      document.body.style.userSelect = 'none'
      
      return () => {
        document.removeEventListener('mousemove', handleResize)
        document.removeEventListener('mouseup', handleResizeEnd)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }
  }, [isResizing, handleResize, handleResizeEnd])

  // Test if backend is available and fetch initial logs
  const testBackendConnection = async (): Promise<boolean> => {
    try {
      const response = await fetch('http://localhost:8000/logs', { 
        method: 'GET',
        signal: AbortSignal.timeout(1000) // 1 second timeout for faster detection
      })
      
      if (response.ok) {
        // If backend is available, fetch initial logs
        const data = await response.json()
        if (data.logs && Array.isArray(data.logs)) {
          setLogs(data.logs.slice(-500)) // Keep only last 500 logs
        }
        return true
      }
      return false
    } catch (error) {
      console.log('Backend connection test failed:', error)
      return false
    }
  }

  // Fetch logs via HTTP as fallback
  const fetchLogsHttp = async () => {
    try {
      const response = await fetch('http://localhost:8000/logs?limit=500')
      if (response.ok) {
        const data = await response.json()
        if (data.logs && Array.isArray(data.logs)) {
          setLogs(data.logs)
          console.log(`📝 Fetched ${data.logs.length} logs via HTTP`)
        }
      }
    } catch (error) {
      console.error('Failed to fetch logs via HTTP:', error)
    }
  }

  // Connect to WebSocket with retry logic
  const connectWebSocket = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return
    if (connectionAttempts >= maxReconnectAttempts) {
      console.log('❌ Max WebSocket reconnection attempts reached, switching to HTTP polling')
      // Switch to HTTP polling mode when WebSocket fails
      startHttpPolling()
      return
    }

    // Clear any existing timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }

    // Test backend availability first (with reduced timeout for faster retries)
    setIsReconnecting(true)
    const backendAvailable = await testBackendConnection()
    
    if (!backendAvailable) {
      console.log('🔄 Backend not available, trying HTTP fallback...')
      await fetchLogsHttp() // Try to fetch logs via HTTP
      
      setConnectionAttempts(prev => prev + 1)
      // More aggressive retry timing for better responsiveness
      const delay = Math.min(500 * Math.pow(1.5, connectionAttempts), 5000) // Faster exponential backoff, max 5s
      
      reconnectTimeoutRef.current = setTimeout(() => {
        connectWebSocket()
      }, delay)
      setIsReconnecting(false)
      return
    }

    try {
      // Close existing connection if any
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }

      // Build WebSocket URL - always use localhost:8000 for backend
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//localhost:8000/ws/logs`
      
      console.log(`🔌 Attempting WebSocket connection to: ${wsUrl} (attempt ${connectionAttempts + 1}/${maxReconnectAttempts})`)
      wsRef.current = new WebSocket(wsUrl)

      wsRef.current.onopen = () => {
        setIsConnected(true)
        setConnectionAttempts(0) // Reset attempts on successful connection
        setIsReconnecting(false)
        console.log('✅ WebSocket connected to log streaming')
      }

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          
          if (data.type === 'log') {
            const logEntry = data.data as LogEntry
            
            if (isPaused) {
              pausedLogsRef.current.push(logEntry)
            } else {
              setLogs(prev => {
                const newLogs = [...prev, logEntry]
                // Keep only last 500 logs for performance
                return newLogs.slice(-500)
              })
            }
          } else if (data.type === 'heartbeat') {
            // Handle heartbeat to keep connection alive
            console.log('💓 WebSocket heartbeat received')
          } else if (data.type === 'connected') {
            // Handle connection confirmation
            console.log('✅ WebSocket connection confirmed:', data.message)
          }
        } catch (error) {
          console.error('Error parsing log message:', error)
        }
      }

      wsRef.current.onclose = (event) => {
        setIsConnected(false)
        setIsReconnecting(false)
        
        if (event.wasClean) {
          console.log('✅ WebSocket connection closed cleanly')
        } else {
          // Suppress duplicate disconnection messages - only log once per connection attempt
          if (connectionAttempts === 0) {
            console.log(`❌ WebSocket disconnected unexpectedly: ${event.code} ${event.reason}`)
          }
          
          // Aggressive reconnection regardless of panel state (for better responsiveness)
          if (connectionAttempts < maxReconnectAttempts) {
            setConnectionAttempts(prev => prev + 1)
            const delay = Math.min(500 * Math.pow(1.5, connectionAttempts), 3000) // Fast exponential backoff, max 3s
            
            if (connectionAttempts === 0) {
              console.log(`🔄 Attempting reconnection in ${delay}ms (attempt ${connectionAttempts + 1}/${maxReconnectAttempts})`)
            }
            reconnectTimeoutRef.current = setTimeout(() => {
              connectWebSocket()
            }, delay)
          } else {
            // Switch to HTTP polling when WebSocket fails completely
            console.log('🔄 Switching to HTTP polling mode')
            startHttpPolling()
          }
        }
      }

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error)
        setIsConnected(false)
        setIsReconnecting(false)
      }

    } catch (error) {
      console.error('Failed to create WebSocket:', error)
      setIsConnected(false)
      setIsReconnecting(false)
      setConnectionAttempts(prev => prev + 1)
      
      // Retry after delay with faster timing
      if (connectionAttempts < maxReconnectAttempts) {
        const delay = Math.min(500 * Math.pow(1.5, connectionAttempts), 3000)
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket()
        }, delay)
      } else {
        // Switch to HTTP polling when WebSocket fails completely
        console.log('🔄 Switching to HTTP polling mode')
        startHttpPolling()
      }
    }
  }, [connectionAttempts, isOpen, isPaused])

  // HTTP polling fallback when WebSocket fails
  const startHttpPolling = useCallback(() => {
    console.log('📡 Starting HTTP polling mode for logs')
    setIsConnected(false)
    setIsReconnecting(false)
    
    // Poll for new logs every 2 seconds
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch('http://localhost:8000/logs?limit=100')
        if (response.ok) {
          const data = await response.json()
          if (data.logs && Array.isArray(data.logs)) {
            setLogs(prev => {
              // Only add new logs that we haven't seen before
              const existingIds = new Set(prev.map(log => log.timestamp + log.message))
              const newLogs = data.logs.filter((log: LogEntry) => 
                !existingIds.has(log.timestamp + log.message)
              )
              if (newLogs.length > 0) {
                console.log(`📝 HTTP polling: received ${newLogs.length} new logs`)
              }
              const combined = [...prev, ...newLogs]
              return combined.slice(-500) // Keep only last 500 logs
            })
          }
        }
      } catch (error) {
        console.error('HTTP polling failed:', error)
      }
    }, 2000)

    // Store the interval ID for cleanup
    reconnectTimeoutRef.current = pollInterval as any
  }, [])

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  // Connect WebSocket immediately when component mounts, regardless of panel state
  useEffect(() => {
    // Start connection immediately for faster response
    connectWebSocket()

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [connectWebSocket])

  // Fetch initial logs when panel opens
  useEffect(() => {
    if (isOpen) {
      fetchLogsHttp()
    }
  }, [isOpen])

  // Resume logs
  const resumeLogs = useCallback(() => {
    if (pausedLogsRef.current.length > 0) {
      setLogs(prev => {
        const newLogs = [...prev, ...pausedLogsRef.current]
        pausedLogsRef.current = []
        return newLogs.slice(-500)
      })
    }
    setIsPaused(false)
  }, [])

  // Filter logs - focus on backtest-related logs
  const filteredLogs = logs.filter(log => {
    const matchesLevel = levelFilter === 'ALL' || log.level === levelFilter
    const matchesFilter = filter === '' || 
      log.message.toLowerCase().includes(filter.toLowerCase()) ||
      (log.module && log.module.toLowerCase().includes(filter.toLowerCase()))
    
    // Apply backtest filter only if enabled
    let showLog = true
    if (showBacktestOnly) {
      const isBacktestRelated = 
        log.message.toLowerCase().includes('backtest') ||
        log.message.toLowerCase().includes('momentum') ||
        log.message.toLowerCase().includes('screening') ||
        log.message.toLowerCase().includes('trade') ||
        log.message.toLowerCase().includes('pattern') ||
        log.message.toLowerCase().includes('analysis') ||
        log.message.toLowerCase().includes('processing') ||
        log.message.toLowerCase().includes('completed') ||
        log.message.toLowerCase().includes('starting') ||
        log.message.toLowerCase().includes('calculating') ||
        log.message.toLowerCase().includes('found') ||
        log.message.toLowerCase().includes('criteria') ||
        log.message.toLowerCase().includes('signal') ||
        (log.module && (
          log.module.toLowerCase().includes('backtest') ||
          log.module.toLowerCase().includes('momentum') ||
          log.module.toLowerCase().includes('strategy')
        ))
      showLog = isBacktestRelated
    }
    
    return matchesLevel && matchesFilter && showLog
  })

  // Clear logs
  const clearLogs = useCallback(async () => {
    try {
      await fetch('http://localhost:8000/logs', { method: 'DELETE' })
      setLogs([])
      pausedLogsRef.current = []
    } catch (error) {
      console.error('Failed to clear logs:', error)
    }
  }, [])

  // Export logs
  const exportLogs = useCallback(() => {
    const logData = JSON.stringify(logs, null, 2)
    const blob = new Blob([logData], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `backtest-logs-${new Date().toISOString().slice(0, 19)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [logs])

  // Format timestamp
  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    })
  }

  if (!isOpen) return null

  return (
    <div className={`fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-700 z-50 ${className}`} style={{ height: currentHeight }}>
      {/* Resize Handle */}
      <div 
        className="absolute top-0 left-0 right-0 h-1 bg-gray-600 cursor-ns-resize hover:bg-gray-500 transition-colors"
        onMouseDown={handleResizeStart}
      />
      
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-medium text-white">Live Logs</h3>
          <div className={`w-2 h-2 rounded-full ${
            isConnected ? 'bg-green-400' : 
            isReconnecting ? 'bg-yellow-400 animate-pulse' : 
            connectionAttempts >= maxReconnectAttempts ? 'bg-blue-400' :
            'bg-red-400'
          }`} />
          <span className="text-sm text-gray-400">
            {isConnected ? 'WebSocket Connected' : 
             isReconnecting ? `Reconnecting... (${connectionAttempts}/${maxReconnectAttempts})` :
             connectionAttempts >= maxReconnectAttempts ? 'HTTP Polling Mode' :
             'Disconnected'}
          </span>
          {pausedLogsRef.current.length > 0 && (
            <span className="text-sm text-yellow-400 bg-yellow-900/30 px-2 py-1 rounded">
              {pausedLogsRef.current.length} paused logs
            </span>
          )}
          {connectionAttempts >= maxReconnectAttempts && (
            <span className="text-sm text-blue-400 bg-blue-900/30 px-2 py-1 rounded">
              Fallback Mode
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Level filter */}
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="text-sm bg-gray-800 text-white border border-gray-600 rounded px-2 py-1"
          >
            <option value="ALL">All Levels</option>
            <option value="DEBUG">Debug</option>
            <option value="INFO">Info</option>
            <option value="WARN">Warn</option>
            <option value="ERROR">Error</option>
          </select>

          {/* Text filter */}
          <input
            type="text"
            placeholder="Filter logs..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="text-sm bg-gray-800 text-white border border-gray-600 rounded px-2 py-1 w-32"
          />

          {/* Controls */}
          {!isConnected && !isReconnecting && connectionAttempts < maxReconnectAttempts && (
            <button
              onClick={() => {
                setConnectionAttempts(0)
                connectWebSocket()
              }}
              className="p-1 hover:bg-gray-700 rounded text-gray-300"
              title="Retry WebSocket connection"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={() => isPaused ? resumeLogs() : setIsPaused(true)}
            className="p-1 hover:bg-gray-700 rounded text-gray-300"
            title={isPaused ? 'Resume logs' : 'Pause logs'}
          >
            {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </button>

          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`p-1 rounded text-sm px-2 py-1 ${autoScroll ? 'bg-blue-600 text-white' : 'hover:bg-gray-700 text-gray-300'}`}
            title="Toggle auto-scroll"
          >
            Auto
          </button>

          <button
            onClick={() => setShowBacktestOnly(!showBacktestOnly)}
            className={`p-1 rounded text-sm px-2 py-1 ${showBacktestOnly ? 'bg-green-600 text-white' : 'hover:bg-gray-700 text-gray-300'}`}
            title="Toggle backtest-only filter"
          >
            {showBacktestOnly ? 'Backtest' : 'All'}
          </button>

          <button
            onClick={exportLogs}
            className="p-1 hover:bg-gray-700 rounded text-gray-300"
            title="Export logs"
          >
            <Download className="w-4 h-4" />
          </button>

          <button
            onClick={clearLogs}
            className="p-1 hover:bg-gray-700 rounded text-gray-300"
            title="Clear logs"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded text-gray-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Log content */}
      <div
        ref={logsContainerRef}
        className="overflow-y-auto p-2 font-mono text-sm"
        style={{ height: `calc(${currentHeight}px - 120px)`, scrollbarWidth: 'thin' }}
      >
        {filteredLogs.length === 0 ? (
          <div className="text-gray-500 text-center py-8">
            {logs.length === 0 ? 'No logs yet...' : 'No logs match your filter'}
          </div>
        ) : (
          filteredLogs.map((log, index) => (
            <div
              key={index}
              className={`mb-2 p-3 rounded ${LOG_BACKGROUNDS[log.level]} border-l-2 border-l-current`}
            >
              <div className="flex items-start gap-2">
                <span className="text-gray-500 text-xs mt-0.5 min-w-[80px]">
                  {formatTimestamp(log.timestamp)}
                </span>
                <span className={`${LOG_COLORS[log.level]} font-medium min-w-[50px] text-xs mt-0.5`}>
                  {log.level}
                </span>
                {log.module && (
                  <span className="text-purple-400 text-xs mt-0.5 min-w-[80px]">
                    [{log.module}]
                  </span>
                )}
                <span className="text-gray-200 flex-1 break-all">
                  {log.message}
                </span>
              </div>
              {log.context && Object.keys(log.context).length > 0 && (
                <div className="mt-2 ml-[140px] text-gray-400 text-xs">
                  {Object.entries(log.context).map(([key, value]) => (
                    <span key={key} className="mr-3">
                      {key}: {JSON.stringify(value)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-gray-700 text-sm text-gray-400 flex justify-between">
        <span>{filteredLogs.length} / {logs.length} logs {showBacktestOnly ? '(backtest only)' : '(all logs)'}</span>
        <span>
          {isConnected ? 'WebSocket streaming' : 
           connectionAttempts >= maxReconnectAttempts ? 'HTTP polling' : 
           'Live streaming from backend'}
        </span>
      </div>
    </div>
  )
}