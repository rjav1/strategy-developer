'use client'

import { useState } from 'react'
import { Upload, FileText, CheckCircle, AlertCircle, Trash2 } from 'lucide-react'

interface UploadedFile {
  id: string
  name: string
  size: string
  type: string
  status: 'uploading' | 'success' | 'error'
  progress: number
}

export default function DataUpload() {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([
    {
      id: '1',
      name: 'AAPL_historical_data.csv',
      size: '2.4 MB',
      type: 'CSV',
      status: 'success',
      progress: 100
    },
    {
      id: '2',
      name: 'SPY_daily_data.xlsx',
      size: '1.8 MB',
      type: 'Excel',
      status: 'success',
      progress: 100
    }
  ])

  const [dragActive, setDragActive] = useState(false)

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files)
    }
  }

  const handleFiles = (files: FileList) => {
    Array.from(files).forEach((file) => {
      const newFile: UploadedFile = {
        id: Date.now().toString(),
        name: file.name,
        size: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
        type: file.name.split('.').pop()?.toUpperCase() || 'Unknown',
        status: 'uploading',
        progress: 0
      }
      
      setUploadedFiles(prev => [...prev, newFile])
      
      // Simulate upload progress
      const interval = setInterval(() => {
        setUploadedFiles(prev => prev.map(f => 
          f.id === newFile.id 
            ? { ...f, progress: Math.min(f.progress + 10, 100) }
            : f
        ))
      }, 100)
      
      setTimeout(() => {
        clearInterval(interval)
        setUploadedFiles(prev => prev.map(f => 
          f.id === newFile.id 
            ? { ...f, status: 'success' as const }
            : f
        ))
      }, 2000)
    })
  }

  const removeFile = (id: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== id))
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Data Upload</h1>
        <p className="text-muted-foreground">Upload historical market data for backtesting</p>
      </div>

      {/* Upload Area */}
      <div className="card-glow p-8">
        <div
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 ${
            dragActive 
              ? 'border-purple-500 bg-purple-500/10' 
              : 'border-white/20 hover:border-purple-500/50'
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <Upload className="h-12 w-12 text-purple-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">Drop files here</h3>
          <p className="text-muted-foreground mb-4">
            or click to browse CSV, Excel, or JSON files
          </p>
          <button className="px-6 py-3 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 rounded-xl font-medium transition-all duration-200 shadow-lg hover:shadow-purple-500/25">
            Choose Files
          </button>
        </div>
      </div>

      {/* File List */}
      <div className="card-glow p-6">
        <h3 className="text-xl font-semibold text-white mb-4">Uploaded Files</h3>
        <div className="space-y-3">
          {uploadedFiles.map((file) => (
            <div key={file.id} className="flex items-center justify-between p-4 bg-card/30 rounded-lg">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-blue-400" />
                <div>
                  <p className="text-white font-medium">{file.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {file.size} • {file.type}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                {file.status === 'uploading' && (
                  <div className="flex items-center gap-2">
                    <div className="w-20 bg-gray-700 rounded-full h-2">
                      <div 
                        className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${file.progress}%` }}
                      ></div>
                    </div>
                    <span className="text-sm text-muted-foreground">{file.progress}%</span>
                  </div>
                )}
                
                {file.status === 'success' && (
                  <CheckCircle className="h-5 w-5 text-green-400" />
                )}
                
                {file.status === 'error' && (
                  <AlertCircle className="h-5 w-5 text-red-400" />
                )}
                
                <button
                  onClick={() => removeFile(file.id)}
                  className="p-1 hover:bg-red-500/20 rounded-lg transition-colors"
                >
                  <Trash2 className="h-4 w-4 text-red-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Data Preview */}
      <div className="card-glow p-6">
        <h3 className="text-xl font-semibold text-white mb-4">Data Preview</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left p-3 text-muted-foreground">Date</th>
                <th className="text-left p-3 text-muted-foreground">Open</th>
                <th className="text-left p-3 text-muted-foreground">High</th>
                <th className="text-left p-3 text-muted-foreground">Low</th>
                <th className="text-left p-3 text-muted-foreground">Close</th>
                <th className="text-left p-3 text-muted-foreground">Volume</th>
              </tr>
            </thead>
            <tbody>
              {[
                { date: '2024-01-15', open: 185.20, high: 187.50, low: 184.80, close: 186.90, volume: '45.2M' },
                { date: '2024-01-16', open: 186.90, high: 188.30, low: 185.40, close: 187.20, volume: '42.1M' },
                { date: '2024-01-17', open: 187.20, high: 189.10, low: 186.50, close: 188.50, volume: '48.7M' },
                { date: '2024-01-18', open: 188.50, high: 190.20, low: 187.80, close: 189.80, volume: '51.3M' },
                { date: '2024-01-19', open: 189.80, high: 191.40, low: 188.90, close: 190.60, volume: '46.8M' },
              ].map((row, i) => (
                <tr key={i} className="border-b border-white/5 hover:bg-card/30">
                  <td className="p-3 text-white">{row.date}</td>
                  <td className="p-3 text-white">${row.open}</td>
                  <td className="p-3 text-green-400">${row.high}</td>
                  <td className="p-3 text-red-400">${row.low}</td>
                  <td className="p-3 text-white">${row.close}</td>
                  <td className="p-3 text-muted-foreground">{row.volume}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
} 