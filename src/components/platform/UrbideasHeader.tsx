"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import ThemeToggle from "@/components/ui/ThemeToggle";

const moduleLinks = [
  { href: "/urbideas", label: "Inicio", exact: true },
  { href: "/urbideas/municipios", label: "Municipios", exact: false },
  { href: "/urbideas/mapa", label: "Mapa", exact: false },
  { href: "/urbideas/legislacion", label: "Legislación", exact: false },
  { href: "/urbideas/api-docs", label: "API", exact: false },
];

const COMPACT_AFTER_PX = 48;

export default function UrbideasHeader() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [compact, setCompact] = useState(false);

  // Modo compacto al deslizar hacia abajo: la barra pierde altura y
  // el descriptor de marca se oculta para liberar pantalla.
  useEffect(() => {
    const onScroll = () => {
      setCompact(window.scrollY > COMPACT_AFTER_PX);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  // El menú móvil se cierra vía onClick en cada enlace y con Escape
  // (sin efecto sobre pathname para evitar set-state-in-effect).
  useEffect(() => {
    if (!menuOpen) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  const linkClasses = (active: boolean) =>
    [
      "relative px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 ease-out",
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]",
      active
        ? "text-[var(--color-text-primary)] bg-[var(--color-input-bg)]"
        : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-input-bg)]/50",
    ].join(" ");

  const backLinkClasses =
    "inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]";

  return (
    <header className="sticky top-0 z-50 w-full">
      {/* Barra única del módulo: marca + retorno a plataforma + navegación */}
      <div className="border-b-2 border-b-[var(--color-secondary)] bg-[var(--color-dark-bg)]/90 backdrop-blur-xl supports-[backdrop-filter]:bg-[var(--color-dark-bg)]/70">
        <div
          className={[
            "mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 transition-all duration-300",
            compact ? "h-12" : "h-14 sm:h-16",
          ].join(" ")}
        >
          <Link
            href="/urbideas"
            className="flex items-center gap-2.5 shrink-0 group rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]"
            aria-label="URBideas — inicio del módulo"
          >
            <span
              aria-hidden="true"
              className={[
                "flex items-center justify-center rounded-lg bg-[var(--color-secondary)] font-black text-white shrink-0 transition-all duration-300 group-hover:scale-105",
                compact ? "h-7 w-7 text-xs" : "h-9 w-9 text-sm",
              ].join(" ")}
            >
              U
            </span>
            <span className="leading-tight">
              <span
                className={[
                  "block font-extrabold tracking-tight text-[var(--color-text-primary)] transition-all duration-300",
                  compact ? "text-base" : "text-lg",
                ].join(" ")}
              >
                URBideas
              </span>
              {!compact && (
                <span className="block text-[10px] font-medium text-[var(--color-text-muted)]">
                  Análisis territorial · IDEAS Sostenibilidad
                </span>
              )}
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1" aria-label="Navegación del módulo URBideas">
            {moduleLinks.map((link) => {
              const active = isActive(link.href, link.exact);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={linkClasses(active)}
                >
                  {link.label}
                  {active && (
                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-4 bg-[var(--color-secondary)] rounded-full" />
                  )}
                </Link>
              );
            })}
            <span className="mx-1 h-5 w-px bg-[var(--color-border-subtle)]" aria-hidden="true" />
            <Link href="/" className={backLinkClasses} aria-label="Volver a IDEAS Sostenibilidad">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              IDEAS Sostenibilidad
            </Link>
            <span className="ml-1 pl-2 border-l border-[var(--color-border-subtle)]">
              <ThemeToggle />
            </span>
          </nav>

          <div className="flex items-center gap-2 md:hidden">
            <ThemeToggle />
            <button
              type="button"
              className="flex items-center justify-center w-10 h-10 rounded-lg text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-input-bg)] hover:text-[var(--color-text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label={menuOpen ? "Cerrar menú de URBideas" : "Abrir menú de URBideas"}
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

      {/* Menú móvil: panel anclado a la barra (top-full) + fondo fijo */}
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-[var(--color-overlay)] backdrop-blur-sm md:hidden"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <nav
            className="absolute top-full inset-x-0 z-50 bg-[var(--color-dark-bg)] border-b-2 border-b-[var(--color-secondary)] shadow-lg animate-slide-in-down md:hidden"
            aria-label="Navegación del módulo URBideas"
          >
            <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
              <Link
                href="/"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-input-bg)]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]"
              >
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
                IDEAS Sostenibilidad
              </Link>
              {moduleLinks.map((link) => {
                const active = isActive(link.href, link.exact);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={[
                      "flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all duration-200",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]",
                      active
                        ? "text-[var(--color-text-primary)] bg-[var(--color-input-bg)]"
                        : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-input-bg)]/50",
                    ].join(" ")}
                  >
                    {active && <span className="w-1 h-5 bg-[var(--color-secondary)] rounded-full shrink-0" />}
                    {link.label}
                  </Link>
                );
              })}
            </div>
          </nav>
        </>
      )}
    </header>
  );
}
