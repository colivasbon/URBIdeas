import React from 'react'

type BadgeVariant = 'primary' | 'secondary' | 'accent' | 'danger' | 'success' | 'muted'

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
  className?: string
}

const variantStyles: Record<BadgeVariant, string> = {
  primary: 'bg-[var(--musgo)] text-[var(--hueso)] border border-[var(--musgo)]',
  secondary: 'bg-[var(--crisopa)] text-[var(--carbon)] border border-[var(--conifera)]',
  accent: 'bg-[var(--retama)] text-[var(--carbon)] border border-[var(--retama)]',
  danger: 'bg-[var(--rupestre)] text-[var(--hueso)] border border-[var(--rupestre)]',
  success: 'bg-[var(--conifera)] text-[var(--carbon)] border border-[var(--conifera-active)]',
  muted: 'bg-[var(--color-input-bg)] text-[var(--color-text-secondary)] border border-[var(--color-border)]',
}

export function Badge({ variant = 'primary', children, className = '' }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-[6px]',
        variantStyles[variant],
        className,
      ].join(' ')}
    >
      {children}
    </span>
  )
}
