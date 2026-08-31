import React from 'react'

type BadgeVariant = 'primary' | 'secondary' | 'accent' | 'danger' | 'success'

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
  className?: string
}

const variantStyles: Record<BadgeVariant, string> = {
  primary: 'bg-[var(--color-primary)] text-white',
  secondary: 'bg-[var(--color-secondary)] text-white',
  accent: 'bg-[var(--color-accent)] text-[var(--color-dark-bg)]',
  danger: 'bg-red-600 text-white',
  success: 'bg-green-600 text-white',
}

export function Badge({ variant = 'primary', children, className = '' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-[var(--border-radius)] ${variantStyles[variant]} ${className}`}>
      {children}
    </span>
  )
}
