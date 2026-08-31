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
        'bg-[var(--color-card-bg)] backdrop-blur-sm',
        'border border-[var(--color-border-subtle)]',
        'rounded-[var(--border-radius-lg)]',
        'shadow-[var(--shadow-sm)]',
        padding ? 'p-5 sm:p-6' : '',
        hover ? [
          'transition-all duration-[var(--duration-normal)] ease-[var(--ease-out)]',
          'hover:shadow-[var(--shadow-md)] hover:border-[var(--color-border)]',
          'hover:-translate-y-0.5',
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
    <div className={`border-b border-[var(--color-border-subtle)] pb-3 mb-4 ${className}`}>
      {children}
    </div>
  )
}

export function CardTitle({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <h3 className={`text-lg font-semibold text-[var(--color-text-primary)] tracking-tight ${className}`}>
      {children}
    </h3>
  )
}
