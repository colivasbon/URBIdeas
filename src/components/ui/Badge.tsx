import React from 'react'

type BadgeVariant = 'primary' | 'secondary' | 'accent' | 'danger' | 'success' | 'muted'

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
  className?: string
}

const variantStyles: Record<BadgeVariant, string> = {
  primary: 'bg-[var(--color-primary)]/15 text-[var(--color-primary-light)]',
  secondary: 'bg-[var(--color-secondary)]/15 text-[var(--color-secondary-light)]',
  accent: 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]',
  danger: 'bg-[var(--color-error)]/15 text-[var(--color-error-light)]',
  success: 'bg-[var(--color-success)]/15 text-[var(--color-success-light)]',
  muted: 'bg-[var(--color-input-bg)] text-[var(--color-text-secondary)]',
}

export function Badge({ variant = 'primary', children, className = '' }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-[var(--border-radius)]',
        variantStyles[variant],
        className,
      ].join(' ')}
    >
      {children}
    </span>
  )
}
