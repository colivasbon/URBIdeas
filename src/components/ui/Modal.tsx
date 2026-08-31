"use client"
import React, { useEffect } from 'react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-[var(--color-card-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)] w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto">
        {title && (
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
            <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">{title}</h2>
            <button onClick={onClose} className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] text-xl">&times;</button>
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
