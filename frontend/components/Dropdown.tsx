'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

export interface DropdownOption {
  value: string
  label: string
}

interface DropdownProps {
  options: DropdownOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

export default function Dropdown({
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  disabled = false,
  className = ''
}: DropdownProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const selectedOption = options.find(o => o.value === value)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  const baseButtonStyles = `w-full px-4 py-3 bg-card/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white flex items-center justify-between ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${className}`

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        className={baseButtonStyles}
        onClick={() => !disabled && setOpen(prev => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
     >
        <span className={`truncate ${selectedOption ? 'text-white' : 'text-muted-foreground'}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && !disabled && (
        <div className="absolute z-50 mt-2 w-full rounded-xl border border-white/10 bg-gray-900 shadow-xl overflow-hidden">
          <ul role="listbox" className="max-h-60 overflow-auto py-1">
            {options.length === 0 && (
              <li className="px-4 py-2 text-sm text-muted-foreground">No options</li>
            )}
            {options.map((opt) => (
              <li
                key={opt.value}
                role="option"
                aria-selected={opt.value === value}
                className={`px-4 py-2 text-sm transition-colors select-none ${
                  opt.value === value ? 'bg-purple-600/20 text-white' : 'text-white hover:bg-white/10'
                }`}
                onClick={() => {
                  onChange(opt.value)
                  setOpen(false)
                }}
              >
                {opt.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}


