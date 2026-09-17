import React from 'react'

type BadgeVariant = 'primary' | 'secondary' | 'accent' | 'danger' | 'success' | 'muted' | 'crisopa'

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
  className?: string
}

const variantStyles: Record<BadgeVariant, string> = {
  primary: 'bg-musgo text-hueso border border-musgo',
  secondary: 'bg-crisopa text-carbon border border-conifera',
  accent: 'bg-retama text-carbon border border-retama',
  danger: 'bg-rupestre text-hueso border border-rupestre',
  success: 'bg-conifera-dark text-white border border-[var(--conifera-active)]',
  muted: 'bg-[var(--color-input-bg)] text-[var(--color-text-secondary)] border border-[var(--color-border)]',
  crisopa: 'bg-crisopa/16 text-[var(--color-text-primary)] border border-crisopa',
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
