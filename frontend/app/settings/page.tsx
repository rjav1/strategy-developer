'use client'

import { useState } from 'react'
import { Settings as SettingsIcon, Save, Palette, Database, Bell, Shield } from 'lucide-react'

export default function Settings() {
  const [settings, setSettings] = useState({
    theme: 'dark',
    autoSave: true,
    notifications: true,
    dataCache: true,
    riskManagement: {
      maxPositionSize: 0.05,
      stopLoss: 0.02,
      takeProfit: 0.06
    }
  })

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Settings</h1>
        <p className="text-muted-foreground">Configure your application preferences</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* General Settings */}
        <div className="card-glow p-6">
          <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <SettingsIcon className="h-5 w-5 text-purple-400" />
            General
          </h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">
                Theme
              </label>
              <select 
                value={settings.theme}
                onChange={(e) => setSettings({...settings, theme: e.target.value})}
                className="w-full px-4 py-3 bg-card/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white"
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
                <option value="auto">Auto</option>
              </select>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-white">Auto Save</label>
                <p className="text-xs text-muted-foreground">Automatically save changes</p>
              </div>
              <button
                onClick={() => setSettings({...settings, autoSave: !settings.autoSave})}
                className={`w-12 h-6 rounded-full transition-colors ${
                  settings.autoSave ? 'bg-purple-500' : 'bg-gray-600'
                }`}
              >
                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                  settings.autoSave ? 'translate-x-6' : 'translate-x-1'
                }`}></div>
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-white">Notifications</label>
                <p className="text-xs text-muted-foreground">Show system notifications</p>
              </div>
              <button
                onClick={() => setSettings({...settings, notifications: !settings.notifications})}
                className={`w-12 h-6 rounded-full transition-colors ${
                  settings.notifications ? 'bg-purple-500' : 'bg-gray-600'
                }`}
              >
                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                  settings.notifications ? 'translate-x-6' : 'translate-x-1'
                }`}></div>
              </button>
            </div>
          </div>
        </div>

        {/* Risk Management */}
        <div className="card-glow p-6">
          <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <Shield className="h-5 w-5 text-red-400" />
            Risk Management
          </h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">
                Max Position Size (%)
              </label>
              <input
                type="number"
                value={settings.riskManagement.maxPositionSize * 100}
                onChange={(e) => setSettings({
                  ...settings, 
                  riskManagement: {
                    ...settings.riskManagement,
                    maxPositionSize: parseFloat(e.target.value) / 100
                  }
                })}
                className="w-full px-4 py-3 bg-card/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">
                Stop Loss (%)
              </label>
              <input
                type="number"
                value={settings.riskManagement.stopLoss * 100}
                onChange={(e) => setSettings({
                  ...settings, 
                  riskManagement: {
                    ...settings.riskManagement,
                    stopLoss: parseFloat(e.target.value) / 100
                  }
                })}
                className="w-full px-4 py-3 bg-card/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-2">
                Take Profit (%)
              </label>
              <input
                type="number"
                value={settings.riskManagement.takeProfit * 100}
                onChange={(e) => setSettings({
                  ...settings, 
                  riskManagement: {
                    ...settings.riskManagement,
                    takeProfit: parseFloat(e.target.value) / 100
                  }
                })}
                className="w-full px-4 py-3 bg-card/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white"
              />
            </div>
          </div>
        </div>

        {/* Data Settings */}
        <div className="card-glow p-6">
          <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <Database className="h-5 w-5 text-blue-400" />
            Data
          </h3>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-white">Cache Data</label>
                <p className="text-xs text-muted-foreground">Store data locally for faster access</p>
              </div>
              <button
                onClick={() => setSettings({...settings, dataCache: !settings.dataCache})}
                className={`w-12 h-6 rounded-full transition-colors ${
                  settings.dataCache ? 'bg-purple-500' : 'bg-gray-600'
                }`}
              >
                <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
                  settings.dataCache ? 'translate-x-6' : 'translate-x-1'
                }`}></div>
              </button>
            </div>

            <button className="w-full px-4 py-3 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl font-medium transition-colors">
              Clear Cache
            </button>
          </div>
        </div>

        {/* About */}
        <div className="card-glow p-6">
          <h3 className="text-xl font-semibold text-white mb-4">About</h3>
          
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Version</span>
              <span className="text-white">1.0.0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Build</span>
              <span className="text-white">2024.01.15</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">License</span>
              <span className="text-white">MIT</span>
            </div>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-center">
        <button className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 rounded-xl font-medium transition-all duration-200 shadow-lg hover:shadow-purple-500/25">
          <Save className="h-5 w-5" />
          Save Settings
        </button>
      </div>
    </div>
  )
} 