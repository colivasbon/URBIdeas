"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import ThemeToggle from "@/components/ui/ThemeToggle";

export const CORPORATE_URL =
  process.env.NEXT_PUBLIC_CORPORATE_URL ?? "https://ideasmedioambientales.com";

const platformLinks = [
  { href: "/", label: "Inicio" },
  { href: "/urbideas", label: "URBideas" },
  { href: "/socideas", label: "SOCideas" },
  { href: "/asistencias", label: "Asistencias" },
];

export default function PlatformHeader() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // El menú móvil se cierra vía onClick en cada enlace (sin efecto sobre pathname
  // para evitar set-state-in-effect y renders en cascada).

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-50 w-full">
      <div className="border-b border-[var(--color-border-subtle)] bg-[var(--color-dark-bg)]/80 backdrop-blur-xl supports-[backdrop-filter]:bg-[var(--color-dark-bg)]/60">
        <div className="mx-auto flex h-14 sm:h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3 shrink-0 group" aria-label="IDEAS Sostenibilidad — inicio">
            <Image
              src="/logo/Logo_Principal_-_color_-_Ideas_Medioambientales.png"
              alt="Ideas Medioambientales"
              width={28}
              height={28}
              className="h-7 w-auto transition-transform duration-200 group-hover:scale-105"
              priority
            />
            <span className="leading-tight">
              <span className="block text-sm font-semibold text-[var(--color-text-primary)]">
                IDEAS Sostenibilidad
              </span>
              <span className="block text-[10px] font-medium text-[var(--color-text-muted)] uppercase tracking-widest">
                Área de Sostenibilidad de Ideas Medioambientales
              </span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1" aria-label="Navegación de la plataforma">
            {platformLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive(link.href) ? "page" : undefined}
                className={[
                  "relative px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 ease-out",
                  isActive(link.href)
                    ? "text-[var(--color-text-primary)] bg-[var(--color-input-bg)]"
                    : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-input-bg)]/50",
                ].join(" ")}
              >
                {link.label}
                {isActive(link.href) && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-4 bg-[var(--color-secondary)] rounded-full" />
                )}
              </Link>
            ))}
            <a
              href={CORPORATE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-1 px-3 py-2 text-sm font-medium rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-input-bg)]/50 transition-all duration-200"
            >
              Ideas Medioambientales
              <span aria-hidden="true"> ↗</span>
            </a>
            <span className="ml-2 pl-2 border-l border-[var(--color-border-subtle)]">
              <ThemeToggle />
            </span>
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
        <div className="fixed inset-0 top-14 sm:top-16 z-40 md:hidden">
          <div className="absolute inset-0 bg-[var(--color-overlay)] backdrop-blur-sm" onClick={() => setMenuOpen(false)} />
          <nav className="relative bg-[var(--color-dark-bg)] border-b border-[var(--color-border-subtle)] shadow-lg animate-slide-in-down" aria-label="Navegación de la plataforma">
            <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
              {platformLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  aria-current={isActive(link.href) ? "page" : undefined}
                  className={[
                    "flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all duration-200",
                    isActive(link.href)
                      ? "text-[var(--color-text-primary)] bg-[var(--color-input-bg)]"
                      : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-input-bg)]/50",
                  ].join(" ")}
                >
                  {isActive(link.href) && <span className="w-1 h-5 bg-[var(--color-secondary)] rounded-full shrink-0" />}
                  {link.label}
                </Link>
              ))}
              <a
                href={CORPORATE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-input-bg)]/50"
              >
                Ideas Medioambientales <span aria-hidden="true">↗</span>
              </a>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
