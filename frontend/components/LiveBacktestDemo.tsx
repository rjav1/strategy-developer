'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import SmoothBacktestChart from './SmoothBacktestChart'

// Demo data generator for testing the live backtest visualization
const generateDemoCandle = (index: number, basePrice: number = 100) => {
  const time = new Date()
  time.setMinutes(time.getMinutes() + index * 5) // 5-minute intervals
  
  const volatility = 0.02
  const trend = Math.sin(index * 0.1) * 0.001
  const randomWalk = (Math.random() - 0.5) * volatility
  
  const price = basePrice * (1 + trend + randomWalk)
  const spread = price * 0.005
  
  return {
    date: time.toISOString(),
    open: price - spread/2,
    high: price + spread,
    low: price - spread,
    close: price,
    price: price,
    volume: Math.floor(Math.random() * 10000) + 1000,
    trading_state: ['NOT_IN_TRADE', 'MOMENTUM_DETECTED', 'CONSOLIDATION', 'IN_POSITION'][Math.floor(Math.random() * 4)] as any,
    sma_20: price * 0.98,
    momentum_strength: Math.random() * 100,
    atr: price * 0.02
  }
}

export default function LiveBacktestDemo() {
  const [isRunning, setIsRunning] = useState(false)
  const [priceData, setPriceData] = useState<any[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const streamCallbackRef = useRef<((data: any) => void) | null>(null)

  // Register streaming callback from chart component
  const registerStreamCallback = (callback: (data: any) => void) => {
    streamCallbackRef.current = callback
  }

  // Start demo backtest
  const startDemo = () => {
    setIsRunning(true)
    setCurrentIndex(0)
    setPriceData([])
    
    // Generate candles at regular intervals (simulating real-time data)
    intervalRef.current = setInterval(() => {
      setCurrentIndex(prev => {
        const newIndex = prev + 1
        const newCandle = generateDemoCandle(newIndex, 100 + Math.sin(newIndex * 0.05) * 10)
        
        // Stream to chart if callback is registered
        if (streamCallbackRef.current) {
          streamCallbackRef.current(newCandle)
        }
        
        setPriceData(prevData => [...prevData, newCandle])
        
        // Stop after 200 candles
        if (newIndex >= 200) {
          setIsRunning(false)
          if (intervalRef.current) {
            clearInterval(intervalRef.current)
          }
        }
        
        return newIndex
      })
    }, 50) // New candle every 50ms for smooth demo
  }

  // Stop demo
  const stopDemo = () => {
    setIsRunning(false)
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }
  }

  // Reset demo
  const resetDemo = () => {
    stopDemo()
    setCurrentIndex(0)
    setPriceData([])
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [])

  return (
    <div className="w-full space-y-6">
      {/* Demo Controls */}
      <div className="bg-card/30 rounded-xl p-6">
        <h2 className="text-2xl font-bold text-white mb-4">Live Backtest Demo</h2>
        <p className="text-muted-foreground mb-4">
          Test the ultra-smooth live visualization with simulated real-time data streaming.
        </p>
        
        <div className="flex items-center gap-4">
          <button
            onClick={isRunning ? stopDemo : startDemo}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors ${
              isRunning 
                ? 'bg-red-500 hover:bg-red-600 text-white' 
                : 'bg-green-500 hover:bg-green-600 text-white'
            }`}
          >
            {isRunning ? (
              <>
                <Pause className="h-5 w-5" />
                Stop Demo
              </>
            ) : (
              <>
                <Play className="h-5 w-5" />
                Start Demo
              </>
            )}
          </button>
          
          <button
            onClick={resetDemo}
            className="flex items-center gap-2 px-4 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </button>
          
          <div className="flex items-center gap-4 ml-auto">
            <div className="text-sm text-muted-foreground">
              Candles Generated: <span className="text-white font-bold">{priceData.length}</span>
            </div>
            {isRunning && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span className="text-green-400 text-sm">STREAMING</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Live Chart */}
      <SmoothBacktestChart
        ticker="DEMO"
        isStreaming={isRunning}
        onStreamData={registerStreamCallback}
        autoStart={isRunning}
      />
    </div>
  )
}