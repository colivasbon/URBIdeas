import React from 'react'

type BadgeVariant = 'primary' | 'secondary' | 'accent' | 'danger' | 'success' | 'muted' | 'crisopa'

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
  className?: string
  /** Punto de estado de 6px (opcional). */
  dot?: boolean
}

/* Mapeo cerrado al sistema IMA (4.5). Un único componente en toda la app. */
const variantClass: Record<BadgeVariant, string> = {
  primary: 'badge-info',
  secondary: 'badge-available',
  accent: 'badge-warning',
  danger: 'badge-danger',
  success: 'badge-success',
  muted: 'badge-pending',
  crisopa: 'badge-available',
}

export function Badge({ variant = 'primary', children, className = '', dot = false }: BadgeProps) {
  return (
    <span className={['badge', variantClass[variant], className].join(' ')}>
      {dot && <span aria-hidden="true" className="badge-dot" />}
      {children}
    </span>
  )
}

export default Badge
