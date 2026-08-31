"use client"
import React from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  icon?: React.ReactNode
  error?: string
}

export function Input({ label, icon, error, className = '', ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-sm font-medium text-[var(--color-text-secondary)]">
          {label}
        </label>
      )}
      <div className="relative group">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] transition-colors duration-[var(--duration-fast)] group-focus-within:text-[var(--color-secondary)]">
            {icon}
          </span>
        )}
        <input
          className={[
            'w-full bg-[var(--color-input-bg)] border rounded-[var(--border-radius)] px-3 py-2 text-sm',
            'text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)]',
            'transition-all duration-[var(--duration-normal)] ease-[var(--ease-out)]',
            'hover:border-[var(--color-border)] hover:bg-[var(--color-input-bg-hover)]',
            'focus:outline-none focus:border-[var(--color-secondary)] focus:ring-2 focus:ring-[var(--color-secondary)]/20 focus:bg-[var(--color-input-bg-hover)]',
            error ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : 'border-[var(--color-border-subtle)]',
            icon ? 'pl-10' : '',
            className,
          ].join(' ')}
          {...props}
        />
      </div>
      {error && (
        <p className="text-xs text-red-400 mt-0.5">{error}</p>
      )}
    </div>
  )
}
