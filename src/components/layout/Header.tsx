"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import ThemeToggle from "@/components/ui/ThemeToggle"

// Cabecera heredada: hoy solo la usa /admin. Las páginas de producto usan
// las cabeceras de src/components/platform.
const navLinks = [
  { href: "/", label: "Dashboard" },
  { href: "/municipios", label: "Municipios" },
  { href: "/mapa", label: "Mapa" },
  { href: "/legislacion", label: "Legislación" },
  { href: "/api-docs", label: "API" },
  { href: "/admin", label: "Admin" },
]

const focusRing = "focus-visible:rounded-[6px] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const pathname = usePathname()

  // Cierra el menú al cambiar de ruta (ajuste de estado durante el render).
  const [prevPathname, setPrevPathname] = useState(pathname)
  if (pathname !== prevPathname) {
    setPrevPathname(pathname)
    setMenuOpen(false)
  }

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
      <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)]">
        <div className="container-ima flex h-14 items-center justify-between sm:h-16">
          <Link href="/" className={`flex shrink-0 items-center gap-3 ${focusRing}`}>
            <Image
              src="/logo/Logo_Principal_-_color_-_Ideas_Medioambientales.png"
              alt="Ideas Medioambientales"
              width={28}
              height={28}
              className="h-7 w-auto"
              priority
            />
            <div className="hidden leading-tight sm:block">
              <span className="block text-sm font-semibold text-[var(--text-primary)]">
                Urbanismo
              </span>
              <span className="text-xs text-[var(--text-muted)]">
                Ideas Medioambientales
              </span>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {navLinks.map((link) => {
              const isActive = pathname === link.href
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={[
                    'relative inline-flex min-h-11 items-center px-3 text-sm font-medium transition-colors',
                    focusRing,
                    isActive
                      ? 'text-[var(--text-primary)]'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                  ].join(' ')}
                >
                  {link.label}
                  {isActive && (
                    <span aria-hidden="true" className="absolute inset-x-3 bottom-1 h-0.5 bg-[var(--conifera)]" />
                  )}
                </Link>
              )
            })}
            <div className="ml-2 border-l border-[var(--border-subtle)] pl-2">
              <ThemeToggle />
            </div>
          </nav>

          <div className="flex items-center gap-2 md:hidden">
            <ThemeToggle />
            <button
              type="button"
              className={`flex h-11 w-11 items-center justify-center rounded-[6px] text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] ${focusRing}`}
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
              aria-expanded={menuOpen}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
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
        <div className="fixed inset-0 top-14 z-40 sm:top-16 md:hidden">
          <div className="absolute inset-0 bg-[var(--color-overlay)]" onClick={() => setMenuOpen(false)} />
          <nav className="relative border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)] shadow-[var(--shadow-2)]">
            <div className="container-ima py-2">
              {navLinks.map((link) => {
                const isActive = pathname === link.href
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={[
                      'flex min-h-11 items-center gap-3 border-b border-[var(--border-subtle)] text-sm last:border-b-0',
                      focusRing,
                      isActive
                        ? 'font-semibold text-[var(--text-primary)]'
                        : 'font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
                    ].join(' ')}
                    onClick={() => setMenuOpen(false)}
                  >
                    {isActive && (
                      <span aria-hidden="true" className="h-5 w-0.5 shrink-0 bg-[var(--conifera)]" />
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
