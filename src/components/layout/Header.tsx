"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import ThemeToggle from "@/components/ui/ThemeToggle"

const navLinks = [
  { href: "/", label: "Dashboard" },
  { href: "/municipios", label: "Municipios" },
  { href: "/mapa", label: "Mapa" },
  { href: "/legislacion", label: "Legislación" },
  { href: "/api", label: "API" },
  { href: "/admin", label: "Admin" },
]

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[var(--color-border)] bg-[var(--color-dark-bg)]/95 backdrop-blur supports-[backdrop-filter]:bg-[var(--color-dark-bg)]/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3 shrink-0">
          <Image
            src="/logo/Logo_Principal_-_color_-_Ideas_Medioambientales.png"
            alt="Ideas Medioambientales"
            width={36}
            height={36}
            className="h-9 w-auto"
            priority
          />
          <span className="hidden text-sm font-semibold text-white sm:block leading-tight">
            Registro<br />Urbanístico España
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-[var(--border-radius)] px-3 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-input-bg)] hover:text-[var(--color-text-primary)]"
            >
              {link.label}
            </Link>
          ))}
          <ThemeToggle />
        </nav>

        <button
          type="button"
          className="inline-flex items-center justify-center rounded-[var(--border-radius)] p-2 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-input-bg)] hover:text-white md:hidden"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Menú de navegación"
        >
          {menuOpen ? (
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          )}
        </button>
      </div>

      {menuOpen && (
        <nav className="border-t border-[var(--color-border)] bg-[var(--color-dark-bg)] md:hidden">
          <div className="mx-auto max-w-7xl px-4 py-2 sm:px-6">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block rounded-[var(--border-radius)] px-3 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-input-bg)] hover:text-[var(--color-text-primary)]"
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <div className="px-3 py-2.5">
              <ThemeToggle />
            </div>
          </div>
        </nav>
      )}
    </header>
  )
}
