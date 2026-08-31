"use client"
import React from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  icon?: React.ReactNode
}

export function Input({ label, icon, className = '', ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-sm font-medium text-[var(--color-text-secondary)]">{label}</label>}
      <div className="relative">
        {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]">{icon}</span>}
        <input
          className={`w-full bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] ${icon ? 'pl-10' : ''} ${className}`}
          {...props}
        />
      </div>
    </div>
  )
}
