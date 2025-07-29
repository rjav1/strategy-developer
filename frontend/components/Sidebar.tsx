'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  BarChart3, 
  Upload, 
  FileText, 
  Search, 
  Play, 
  BarChart, 
  Settings,
  TrendingUp
} from 'lucide-react'

const navigation = [
  { name: 'Ticker Lookup', href: '/', icon: TrendingUp },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Data Upload', href: '/data-upload', icon: Upload },
  { name: 'Strategies', href: '/strategies', icon: FileText },
  { name: 'Screeners', href: '/screeners', icon: Search },
  { name: 'Backtest Engine', href: '/backtest', icon: Play },
  { name: 'Results', href: '/results', icon: BarChart },
  { name: 'Settings', href: '/settings', icon: Settings },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <div className="w-64 bg-card/50 backdrop-blur-xl border-r border-white/10 h-screen p-4">
      <div className="mb-8">
        <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-purple-600 bg-clip-text text-transparent">
          Trading Strategy Tester
        </h1>
      </div>
      
      <nav className="space-y-2">
        {navigation.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/25'
                  : 'text-muted-foreground hover:bg-card/70 hover:text-white'
              }`}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          )
        })}
      </nav>
      
      <div className="absolute bottom-4 left-4 right-4">
        <div className="text-center text-xs text-muted-foreground">
          <p>v1.0.0</p>
        </div>
      </div>
    </div>
  )
} 