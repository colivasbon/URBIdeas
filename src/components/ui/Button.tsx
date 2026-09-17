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
    'bg-musgo text-hueso',
    'hover:bg-musgo-hover',
    'active:bg-musgo-active',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--retama)]',
  ].join(' '),
  secondary: [
    'bg-conifera text-white',
    'hover:bg-conifera-hover',
    'active:bg-conifera-active',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--retama)]',
  ].join(' '),
  accent: [
    'bg-retama text-carbon',
    'hover:brightness-95',
    'active:brightness-90',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--musgo)]',
  ].join(' '),
  danger: [
    'bg-rupestre text-hueso',
    'hover:bg-rupestre-hover',
    'active:bg-rupestre-hover',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--retama)]',
  ].join(' '),
  ghost: [
    'bg-transparent text-[var(--color-text-secondary)] border border-limo',
    'hover:bg-[var(--color-input-bg-hover)] hover:text-[var(--color-text-primary)]',
    'active:bg-[var(--color-border-subtle)]',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--musgo)]',
  ].join(' '),
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs gap-1.5 min-h-[36px]',
  md: 'px-4 py-2 text-sm gap-2 min-h-[44px]',
  lg: 'px-5 py-2.5 text-sm gap-2.5 min-h-[48px]',
}

export function Button({ variant = 'primary', size = 'md', loading, className = '', children, disabled, ...props }: ButtonProps) {
  return (
    <button
      className={[
        'inline-flex items-center justify-center font-semibold rounded-[6px]',
        'transition-colors duration-200 ease-out',
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
