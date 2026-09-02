"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import ThemeToggle from "@/components/ui/ThemeToggle"

const navLinks = [
  { href: "/", label: "Inicio" },
  { href: "/municipios", label: "Municipios" },
  { href: "/mapa", label: "Mapa" },
  { href: "/legislacion", label: "Legislación" },
  { href: "/api-docs", label: "API" },
  { href: "/admin", label: "Admin" },
]

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  return (
    <header className="sticky top-0 z-50 w-full">
      <div className="border-b border-[var(--color-border-subtle)] bg-[var(--color-dark-bg)]/95 backdrop-blur-sm">
        <div className="mx-auto flex h-12 sm:h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
            <Image
              src="/logo/Logo_Principal_-_color_-_Ideas_Medioambientales.png"
              alt="Ideas Medioambientales"
              width={24}
              height={24}
              className="h-6 w-auto transition-opacity duration-200 group-hover:opacity-80"
              priority
            />
            <span className="hidden text-xs font-semibold tracking-wide text-[var(--color-text-primary)] sm:block uppercase">
              Registro Urbanístico
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-0.5">
            {navLinks.map((link) => {
              const isActive = pathname === link.href
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={[
                    'relative px-3 py-1.5 text-[13px] font-medium',
                    'transition-colors duration-150',
                    isActive
                      ? 'text-[var(--color-text-primary)]'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]',
                  ].join(' ')}
                >
                  {link.label}
                  {isActive && (
                    <span className="absolute bottom-0 left-3 right-3 h-px bg-[var(--color-secondary)]" />
                  )}
                </Link>
              )
            })}
            <div className="ml-3 pl-3 border-l border-[var(--color-border-subtle)]">
              <ThemeToggle />
            </div>
          </nav>

          <div className="flex items-center gap-1 md:hidden">
            <ThemeToggle />
            <button
              type="button"
              className="flex items-center justify-center w-9 h-9 rounded-[var(--border-radius)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-input-bg)] hover:text-[var(--color-text-primary)]"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
              aria-expanded={menuOpen}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                {menuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {menuOpen && (
        <div className="fixed inset-0 top-12 sm:top-14 z-40 md:hidden">
          <div className="absolute inset-0 bg-[var(--color-overlay)]" onClick={() => setMenuOpen(false)} />
          <nav className="relative bg-[var(--color-dark-bg)] border-b border-[var(--color-border-subtle)] animate-slide-in-down">
            <div className="mx-auto max-w-7xl px-4 py-2 sm:px-6">
              {navLinks.map((link) => {
                const isActive = pathname === link.href
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={[
                      'flex items-center gap-3 rounded-[var(--border-radius)] px-3 py-2.5 text-sm font-medium',
                      'transition-colors duration-150',
                      isActive
                        ? 'text-[var(--color-text-primary)] bg-[var(--color-input-bg)]'
                        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-input-bg)]/50',
                    ].join(' ')}
                    onClick={() => setMenuOpen(false)}
                  >
                    {isActive && (
                      <span className="w-0.5 h-4 bg-[var(--color-secondary)] rounded-full shrink-0" />
                    )}
                    {link.label}
                  </Link>
                )
              })}
            </div>
          </nav>
        </div>
      )}
    </header>
  )
}
