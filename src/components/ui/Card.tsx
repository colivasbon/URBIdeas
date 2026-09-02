import React from 'react'

interface CardProps {
  children: React.ReactNode
  className?: string
  padding?: boolean
  hover?: boolean
}

export function Card({ children, className = '', padding = true, hover = false }: CardProps) {
  return (
    <div
      className={[
        'bg-[var(--color-card-bg)]',
        'border border-[var(--color-border-subtle)]',
        'rounded-[var(--border-radius-lg)]',
        padding ? 'p-5 sm:p-6' : '',
        hover ? [
          'transition-all duration-200 ease-out',
          'hover:border-[var(--color-border)]',
        ].join(' ') : '',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`border-b border-[var(--color-border-subtle)] pb-4 mb-4 ${className}`}>
      {children}
    </div>
  )
}

export function CardTitle({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <h3 className={`text-base font-semibold text-[var(--color-text-primary)] tracking-tight ${className}`}>
      {children}
    </h3>
  )
}
