"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import ThemeToggle from "@/components/ui/ThemeToggle"

const navLinks = [
  { href: "/", label: "Dashboard" },
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
      <div className="border-b border-[var(--color-border-subtle)] bg-[var(--color-dark-bg)]/80 backdrop-blur-xl supports-[backdrop-filter]:bg-[var(--color-dark-bg)]/60">
        <div className="mx-auto flex h-14 sm:h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3 shrink-0 group">
            <Image
              src="/logo/Logo_Principal_-_color_-_Ideas_Medioambientales.png"
              alt="Ideas Medioambientales"
              width={28}
              height={28}
              className="h-7 w-auto transition-transform duration-200 group-hover:scale-105"
              priority
            />
            <div className="hidden sm:block leading-tight">
              <span className="text-sm font-semibold text-[var(--color-text-primary)] block">
                Urbanismo
              </span>
              <span className="text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-widest">
                Ideas Medioambientales
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const isActive = pathname === link.href
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={[
                    'relative px-3 py-2 text-sm font-medium rounded-lg',
                    'transition-all duration-200 ease-out',
                    isActive
                      ? 'text-[var(--color-text-primary)] bg-[var(--color-input-bg)]'
                      : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-input-bg)]/50',
                  ].join(' ')}
                >
                  {link.label}
                  {isActive && (
                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-4 bg-[var(--color-secondary)] rounded-full" />
                  )}
                </Link>
              )
            })}
            <div className="ml-2 pl-2 border-l border-[var(--color-border-subtle)]">
              <ThemeToggle />
            </div>
          </nav>

          <div className="flex items-center gap-2 md:hidden">
            <ThemeToggle />
            <button
              type="button"
              className="flex items-center justify-center w-10 h-10 rounded-lg text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-input-bg)] hover:text-[var(--color-text-primary)]"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
              aria-expanded={menuOpen}
            >
              <svg className="h-5 w-5 transition-transform duration-200" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
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
        <div className="fixed inset-0 top-14 sm:top-16 z-40 md:hidden">
          <div className="absolute inset-0 bg-[var(--color-overlay)] backdrop-blur-sm" onClick={() => setMenuOpen(false)} />
          <nav className="relative bg-[var(--color-dark-bg)] border-b border-[var(--color-border-subtle)] shadow-lg animate-slide-in-down">
            <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
              {navLinks.map((link) => {
                const isActive = pathname === link.href
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={[
                      'flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium',
                      'transition-all duration-200',
                      isActive
                        ? 'text-[var(--color-text-primary)] bg-[var(--color-input-bg)]'
                        : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-input-bg)]/50',
                    ].join(' ')}
                    onClick={() => setMenuOpen(false)}
                  >
                    {isActive && (
                      <span className="w-1 h-5 bg-[var(--color-secondary)] rounded-full shrink-0" />
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
