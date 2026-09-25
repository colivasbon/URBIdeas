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
        'rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-1)]',
        padding ? 'p-5 sm:p-6' : '',
        hover ? 'card-interactive' : '',
        className,
      ].join(' ')}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`mb-4 border-b border-[var(--border-subtle)] pb-4 ${className}`}>
      {children}
    </div>
  )
}

export function CardTitle({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <h3 className={`type-h4 text-[var(--text-primary)] ${className}`}>
      {children}
    </h3>
  )
}
