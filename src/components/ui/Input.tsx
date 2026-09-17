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
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] transition-colors duration-150 group-focus-within:text-[var(--musgo)]">
            {icon}
          </span>
        )}
        <input
          className={[
            'w-full bg-[var(--color-input-bg)] border rounded-[6px] px-3 py-2 text-sm min-h-[44px]',
            'text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)]',
            'transition-colors duration-200 ease-out',
            'hover:border-[var(--color-border)] hover:bg-[var(--color-input-bg-hover)]',
            'focus:outline-none focus:border-musgo focus:ring-2 focus:ring-musgo/25 focus:bg-[var(--color-input-bg-hover)]',
            error ? 'border-rupestre focus:border-rupestre focus:ring-rupestre/20' : 'border-[var(--color-border-subtle)]',
            icon ? 'pl-10' : '',
            className,
          ].join(' ')}
          aria-invalid={error ? true : undefined}
          {...props}
        />
      </div>
      {error && (
        <p className="text-xs text-rupestre mt-0.5" role="alert">{error}</p>
      )}
    </div>
  )
}
