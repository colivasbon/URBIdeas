import React from 'react'

type BadgeVariant = 'primary' | 'secondary' | 'accent' | 'danger' | 'success' | 'muted'

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
  className?: string
}

const variantStyles: Record<BadgeVariant, string> = {
  primary: 'bg-[var(--color-primary)]/20 text-[var(--color-primary-light)] border border-[var(--color-primary)]/30',
  secondary: 'bg-[var(--color-secondary)]/20 text-[var(--color-secondary-light)] border border-[var(--color-secondary)]/30',
  accent: 'bg-[var(--color-accent)]/15 text-[var(--color-accent)] border border-[var(--color-accent)]/25',
  danger: 'bg-red-500/15 text-red-400 border border-red-500/25',
  success: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25',
  muted: 'bg-[var(--color-input-bg)] text-[var(--color-text-secondary)] border border-[var(--color-border)]',
}

export function Badge({ variant = 'primary', children, className = '' }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full',
        variantStyles[variant],
        className,
      ].join(' ')}
    >
      {children}
    </span>
  )
}
