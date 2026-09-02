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
    'hover:bg-[var(--color-primary-light)] hover:shadow-[var(--shadow-glow-primary)]',
    'active:bg-[var(--color-primary-dark)] active:scale-[0.98]',
    'focus-visible:ring-[var(--color-primary)]',
  ].join(' '),
  secondary: [
    'bg-[var(--color-secondary)] text-white',
    'hover:bg-[var(--color-secondary-light)] hover:shadow-[var(--shadow-glow-secondary)]',
    'active:bg-[var(--color-secondary-dark)] active:scale-[0.98]',
    'focus-visible:ring-[var(--color-secondary)]',
  ].join(' '),
  accent: [
    'bg-[var(--color-accent)] text-[var(--color-dark-bg)]',
    'hover:bg-[var(--color-accent-light)] hover:shadow-[var(--shadow-glow-accent)]',
    'active:bg-[var(--color-accent-dark)] active:scale-[0.98]',
    'focus-visible:ring-[var(--color-accent)]',
  ].join(' '),
  danger: [
    'bg-[var(--color-error)] text-white',
    'hover:bg-[var(--color-error-light)] hover:shadow-[0_0_20px_rgba(220,38,38,0.4)]',
    'active:bg-[var(--color-error-dark)] active:scale-[0.98]',
    'focus-visible:ring-[var(--color-error)]',
  ].join(' '),
  ghost: [
    'bg-transparent text-[var(--color-text-secondary)]',
    'hover:bg-[var(--color-input-bg)] hover:text-[var(--color-text-primary)]',
    'active:bg-[var(--color-border-subtle)] active:scale-[0.98]',
    'focus-visible:ring-[var(--color-text-muted)]',
  ].join(' '),
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-6 py-2.5 text-base gap-2.5',
}

export function Button({ variant = 'primary', size = 'md', loading, className = '', children, disabled, ...props }: ButtonProps) {
  return (
    <button
      className={[
        'inline-flex items-center justify-center font-medium rounded-[var(--border-radius)]',
        'transition-all duration-[var(--duration-normal)] ease-[var(--ease-out)]',
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
