"use client"
import React from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'accent' | 'danger' | 'ghost'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: { backgroundColor: 'var(--color-primary)', color: '#FFFFFF' },
  secondary: { backgroundColor: 'transparent', color: 'var(--color-text-primary)', borderWidth: '2px', borderStyle: 'solid', borderColor: 'var(--color-border)' },
  accent: { backgroundColor: 'var(--color-accent)', color: 'var(--color-carbon)' },
  danger: { backgroundColor: 'var(--color-error)', color: '#FFFFFF' },
  ghost: { backgroundColor: 'transparent', color: 'var(--color-text-secondary)' },
}

const variantHover: Record<ButtonVariant, string> = {
  primary: 'hover:opacity-90',
  secondary: 'hover:opacity-80',
  accent: 'hover:brightness-95',
  danger: 'hover:opacity-90',
  ghost: 'hover:opacity-80',
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs gap-1.5 min-h-[36px]',
  md: 'px-4 py-2 text-sm gap-2 min-h-[44px]',
  lg: 'px-5 py-2.5 text-sm gap-2.5 min-h-[48px]',
}

export function Button({ variant = 'primary', size = 'md', loading, className = '', children, disabled, ...props }: ButtonProps) {
  return (
    <button
      style={variantStyles[variant]}
      className={[
        'inline-flex items-center justify-center font-semibold rounded-[6px]',
        'transition-opacity duration-200 ease-out',
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none',
        'select-none cursor-pointer',
        variantHover[variant],
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
