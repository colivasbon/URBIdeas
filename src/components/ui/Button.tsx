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
    'hover:bg-[var(--color-primary-light)] hover:shadow-lg',
    'active:bg-[var(--color-primary-dark)] active:scale-[0.98]',
    'focus-visible:ring-[var(--color-primary)]',
  ].join(' '),
  secondary: [
    'bg-[var(--color-secondary)] text-white',
    'hover:bg-[var(--color-secondary-light)] hover:shadow-lg',
    'active:bg-[var(--color-secondary-dark)] active:scale-[0.98]',
    'focus-visible:ring-[var(--color-secondary)]',
  ].join(' '),
  accent: [
    'bg-[var(--color-accent)] text-[var(--color-dark-bg)]',
    'hover:bg-[var(--color-accent-light)] hover:shadow-lg',
    'active:bg-[var(--color-accent-dark)] active:scale-[0.98]',
    'focus-visible:ring-[var(--color-accent)]',
  ].join(' '),
  danger: [
    'bg-[var(--color-error)] text-white',
    'hover:bg-[var(--color-error-light)] hover:shadow-lg',
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
  sm: 'px-3 py-1.5 text-xs gap-1.5 min-h-[32px]',
  md: 'px-4 py-2 text-sm gap-2 min-h-[40px]',
  lg: 'px-6 py-3 text-base gap-2.5 min-h-[48px]',
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
