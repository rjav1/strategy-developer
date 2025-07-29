'use client'

import React from 'react'

const LoadingSkeleton: React.FC = () => {
  return (
    <div className="animate-fade-in space-y-6">
      {/* Header Skeleton */}
      <div className="ticker-header">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-3">
            <div className="loading-skeleton h-8 w-24 rounded-lg"></div>
            <div className="loading-skeleton h-6 w-48 rounded-lg"></div>
          </div>
          <div className="flex flex-col md:items-end space-y-2">
            <div className="loading-skeleton h-10 w-32 rounded-lg"></div>
            <div className="loading-skeleton h-6 w-28 rounded-lg"></div>
          </div>
        </div>
      </div>

      {/* Range Selector Skeleton */}
      <div className="flex flex-wrap justify-center gap-2">
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={index}
            className="loading-skeleton h-10 w-12 rounded-xl"
          ></div>
        ))}
      </div>

      {/* Chart Skeleton */}
      <div className="card-glow p-6 rounded-2xl">
        <div className="w-full h-[400px] relative overflow-hidden">
          <div className="loading-skeleton w-full h-full rounded-lg relative">
            {/* Fake chart lines */}
            <div className="absolute inset-0 flex items-end justify-between px-4 pb-4">
              {Array.from({ length: 12 }).map((_, index) => (
                <div
                  key={index}
                  className="bg-gradient-to-t from-purple-600/20 to-purple-400/40 rounded-t-sm"
                  style={{
                    height: `${Math.random() * 60 + 20}%`,
                    width: '6px',
                    animationDelay: `${index * 100}ms`,
                  }}
                ></div>
              ))}
            </div>
          </div>
          
          {/* Fake chart title */}
          <div className="text-center mt-4">
            <div className="loading-skeleton h-5 w-48 mx-auto rounded"></div>
          </div>
        </div>
      </div>

      {/* Metrics Skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="metric-card">
            <div className="loading-skeleton h-4 w-16 mb-2 rounded"></div>
            <div className="loading-skeleton h-6 w-20 rounded"></div>
          </div>
        ))}
      </div>

      {/* Loading text */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 text-muted-foreground">
          <div className="animate-spin h-4 w-4 border-2 border-purple-500 border-t-transparent rounded-full"></div>
          <span>Loading ticker data...</span>
        </div>
      </div>
    </div>
  )
}

export default LoadingSkeleton 