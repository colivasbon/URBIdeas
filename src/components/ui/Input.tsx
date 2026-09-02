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
        <label className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
          {label}
        </label>
      )}
      <div className="relative group">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] transition-colors duration-150 group-focus-within:text-[var(--color-secondary)]">
            {icon}
          </span>
        )}
        <input
          className={[
            'w-full bg-[var(--color-input-bg)] border border-[var(--color-border-subtle)]',
            'rounded-[var(--border-radius)] px-3 py-2 text-sm',
            'text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)]',
            'transition-all duration-200 ease-out',
            'hover:border-[var(--color-border)]',
            'focus:outline-none focus:border-[var(--color-secondary)] focus:ring-1 focus:ring-[var(--color-secondary)]/20',
            error ? 'border-[var(--color-error)] focus:border-[var(--color-error)] focus:ring-[var(--color-error)]/20' : '',
            icon ? 'pl-10' : '',
            className,
          ].join(' ')}
          {...props}
        />
      </div>
      {error && (
        <p className="text-xs text-[var(--color-error-light)] mt-0.5">{error}</p>
      )}
    </div>
  )
}
