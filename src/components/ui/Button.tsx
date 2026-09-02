"use client"
import React from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'accent' | 'danger' | 'ghost'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: [
    'bg-[var(--color-primary)] text-white',
    'hover:bg-[var(--color-primary-light)]',
    'active:bg-[var(--color-primary-dark)]',
    'focus-visible:ring-[var(--color-primary)]',
  ].join(' '),
  secondary: [
    'bg-[var(--color-secondary)] text-white',
    'hover:bg-[var(--color-secondary-light)]',
    'active:bg-[var(--color-secondary-dark)]',
    'focus-visible:ring-[var(--color-secondary)]',
  ].join(' '),
  accent: [
    'bg-[var(--color-accent)] text-[var(--color-dark-bg)]',
    'hover:bg-[var(--color-accent-light)]',
    'active:bg-[var(--color-accent-dark)]',
    'focus-visible:ring-[var(--color-accent)]',
  ].join(' '),
  danger: [
    'bg-[var(--color-error)] text-white',
    'hover:bg-[var(--color-error-light)]',
    'active:bg-[var(--color-error)]',
    'focus-visible:ring-[var(--color-error)]',
  ].join(' '),
  ghost: [
    'bg-transparent text-[var(--color-text-secondary)]',
    'hover:bg-[var(--color-input-bg)] hover:text-[var(--color-text-primary)]',
    'active:bg-[var(--color-border-subtle)]',
    'focus-visible:ring-[var(--color-text-muted)]',
  ].join(' '),
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs gap-1.5 min-h-[32px]',
  md: 'px-4 py-2 text-sm gap-2 min-h-[38px]',
  lg: 'px-5 py-2.5 text-sm gap-2.5 min-h-[44px]',
}

export function Button({ variant = 'primary', size = 'md', loading, className = '', children, disabled, ...props }: ButtonProps) {
  return (
    <button
      className={[
        'inline-flex items-center justify-center font-semibold rounded-lg',
        'transition-all duration-200 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-card-bg-solid)]',
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none',
        'select-none cursor-pointer',
        variantStyles[variant],
        sizeStyles[size],
        className,
      ].join(' ')}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  )
}
