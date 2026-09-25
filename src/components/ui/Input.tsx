"use client"
import React from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  icon?: React.ReactNode
  error?: string
}

export function Input({ label, icon, error, className = '', id, ...props }: InputProps) {
  const generatedId = React.useId()
  const inputId = id ?? generatedId
  const errorId = `${inputId}-error`

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="field-label">
          {label}
        </label>
      )}
      <div className="group relative">
        {icon && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] transition-colors duration-150 group-focus-within:text-[var(--musgo)]"
          >
            {icon}
          </span>
        )}
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={[
            'input',
            'placeholder:text-[var(--text-muted)]',
            icon ? 'pl-10' : '',
            error ? 'border-[var(--rupestre)]' : '',
            className,
          ].join(' ')}
          {...props}
        />
      </div>
      {error && (
        <p id={errorId} className="text-xs text-[var(--rupestre-700)]" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
