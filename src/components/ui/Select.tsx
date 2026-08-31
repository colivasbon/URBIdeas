"use client"
import React from 'react'

interface SelectOption {
  value: string
  label: string
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[]
  placeholder?: string
  label?: string
}

export function Select({ options, placeholder, label, className = '', ...props }: SelectProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-sm font-medium text-[var(--color-text-secondary)]">{label}</label>}
      <select
        className={`bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] ${className}`}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  )
}
