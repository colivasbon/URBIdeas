"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import ThemeToggle from "@/components/ui/ThemeToggle";

/* ============================================================
   ProductNavbar — navegación de plataforma y módulos (IMA)
   - Una sola lógica de contracción al scroll (listener pasivo + rAF).
   - Submenús click-to-open (Escape / click-fuera / navegación).
   - Drawer móvil con focus trap, Escape, bloqueo de scroll y stagger.
   - Cabecera clara: 64px desktop / 56px móvil; blur + borde al scrollear.
   ============================================================ */

export type ProductNavSubItem = {
  label: string;
  /** Sin href → Ítem no navegable (p. ej. «Próximamente»). Nunca usar "#". */
  href?: string;
  description?: string;
  badge?: "Próximamente";
  disabled?: boolean;
};

export type ProductNavItem = {
  id: string;
  label: string;
  href?: string;
  /** Coincidencia exacta para el estado activo (por defecto: prefijo). */
  exact?: boolean;
  items?: ProductNavSubItem[];
};

export type ProductTone = "platform" | "urban" | "social" | "assistance";

export type ProductNavbarConfig = {
  product: "platform" | "urbideas" | "socideas";
  productLabel: string;
  /** Inicial del distintivo del módulo (p. ej. "U", "S", "A"). */
  productMark: string;
  productHref: string;
  productDescription?: string;
  navigation: ProductNavItem[];
  tone?: ProductTone;
  /** Etiqueta del menú móvil (p. ej. "Abrir menú de SOCideas"). */
  mobileMenuLabel?: string;
  /** Enlace corporativo externo existente (solo plataforma). */
  corporateUrl?: string;
};

export const PLATFORM_HOME_ARIA_LABEL = "Ir a la página principal de Ideas Sostenibilidad";

const SCROLLED_AFTER_PX = 8;
const INDICATOR_BASE = 100;

function useScrolled(): boolean {
  const [scrolled, setScrolled] = useState(false);
  const ticking = useRef(false);

  useEffect(() => {
    const update = () => {
      ticking.current = false;
      setScrolled(window.scrollY > SCROLLED_AFTER_PX);
    };
    const onScroll = () => {
      if (!ticking.current) {
        ticking.current = true;
        requestAnimationFrame(update);
      }
    };
    const raf = requestAnimationFrame(update);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return scrolled;
}

function stripHash(href: string): string {
  const i = href.indexOf("#");
  return i >= 0 ? href.slice(0, i) || "/" : href;
}

function isHrefActive(pathname: string, href: string, exact = false): boolean {
  const base = stripHash(href);
  if (base === "/") return pathname === "/";
  return exact ? pathname === base : pathname === base || pathname.startsWith(`${base}/`);
}

function isItemActive(pathname: string, item: ProductNavItem): boolean {
  if (item.href && isHrefActive(pathname, item.href, item.exact)) return true;
  return (item.items ?? []).some((s) => s.href && isHrefActive(pathname, s.href, false));
}

export default function ProductNavbar({ config }: { config: ProductNavbarConfig }) {
  const pathname = usePathname();
  const scrolled = useScrolled();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const linkRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const navRef = useRef<HTMLElement>(null);
  const mobileButtonRef = useRef<HTMLButtonElement>(null);
  const [indicator, setIndicator] = useState<{ x: number; scale: number } | null>(null);
  const isPlatform = config.product === "platform";

  const activeItem = config.navigation.find((i) => isItemActive(pathname, i));

  // Indicador deslizante: solo transform (translateX + scaleX).
  useEffect(() => {
    const el = activeItem ? linkRefs.current[activeItem.id] : null;
    const nav = navRef.current;
    if (!el || !nav) {
      setIndicator(null);
      return;
    }
    const measure = () => {
      const a = el.getBoundingClientRect();
      const n = nav.getBoundingClientRect();
      const width = Math.max(24, a.width * 0.5);
      setIndicator({ x: a.left - n.left + (a.width - width) / 2, scale: width / INDICATOR_BASE });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [activeItem, pathname]);

  const closeAll = useCallback(() => setOpenMenu(null), []);

  // Escape + click fuera.
  useEffect(() => {
    if (!openMenu && !mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const trigger = openMenu ? triggerRefs.current[openMenu] : null;
        setOpenMenu(null);
        setMobileOpen(false);
        setMobileExpanded(null);
        (trigger ?? mobileButtonRef.current)?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpenMenu(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [openMenu, mobileOpen]);

  // Bloqueo de scroll + focus trap del drawer móvil.
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = drawerRef.current?.querySelector<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    first?.focus();

    const onTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !drawerRef.current) return;
      const focusables = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null);
      if (focusables.length === 0) return;
      const firstEl = focusables[0];
      const lastEl = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener("keydown", onTab);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onTab);
    };
  }, [mobileOpen]);

  const closeMobile = () => {
    setMobileOpen(false);
    setMobileExpanded(null);
  };

  const toggleMenu = (id: string) => setOpenMenu((cur) => (cur === id ? null : id));

  const linkClasses = (active: boolean) =>
    [
      "relative inline-flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-[6px] transition-colors duration-150",
      "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
      active
        ? "text-[var(--moss-ink)] font-semibold"
        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--musgo-50)]",
    ].join(" ");

  const mobileMenuLabel = mobileOpen
    ? `Cerrar menú${isPlatform ? "" : ` de ${config.productLabel}`}`
    : (config.mobileMenuLabel ?? (isPlatform ? "Abrir menú" : `Abrir menú de ${config.productLabel}`));

  return (
    <header
      ref={rootRef}
      className={[
        "sticky top-0 z-[100] w-full transition-colors duration-200",
        scrolled
          ? "site-header--scrolled border-b border-[var(--border-subtle)]"
          : "border-b border-transparent bg-[var(--bg-canvas)]",
      ].join(" ")}
    >
      <div className="mx-auto flex h-14 w-full max-w-[1240px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-10 md:h-16">
        {/* Nivel plataforma + nivel producto */}
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
          <Link
            href="/"
            aria-label={PLATFORM_HOME_ARIA_LABEL}
            className="flex shrink-0 items-center gap-2 rounded-[6px] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          >
            <Image
              src="/logo/Logo_Principal_-_color_-_Ideas_Medioambientales.png"
              alt="Ideas Medioambientales"
              width={28}
              height={28}
              className="h-7 w-auto"
              priority
            />
          </Link>
          {isPlatform ? (
            <Link
              href="/"
              className="min-w-0 rounded-[6px] leading-tight focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            >
              <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">
                IDEAS Sostenibilidad
              </span>
              <span className="hidden truncate text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--text-muted)] sm:block">
                Ideas Medioambientales
              </span>
            </Link>
          ) : (
            <>
              <span aria-hidden="true" className="h-6 w-px shrink-0 bg-[var(--border-subtle)]" />
              <Link
                href={config.productHref}
                aria-label={`${config.productLabel} — inicio del módulo`}
                className="flex min-w-0 items-center gap-2 rounded-[6px] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
              >
                <span
                  aria-hidden="true"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-[var(--musgo)] text-xs font-bold text-[var(--hueso)]"
                >
                  {config.productMark}
                </span>
                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">
                    {config.productLabel}
                  </span>
                  {config.productDescription && (
                    <span className="hidden truncate text-[10px] font-medium text-[var(--text-muted)] sm:block">
                      {config.productDescription}
                    </span>
                  )}
                </span>
              </Link>
            </>
          )}
        </div>

        {/* Navegación desktop */}
        <nav
          ref={navRef}
          className="relative hidden items-center gap-0.5 md:flex"
          aria-label={isPlatform ? "Navegación de la plataforma" : `Navegación del módulo ${config.productLabel}`}
        >
          {config.navigation.map((item) => {
            const active = isItemActive(pathname, item);
            if (!item.items || item.items.length === 0) {
              return (
                <Link
                  key={item.id}
                  ref={(el) => {
                    linkRefs.current[item.id] = el;
                  }}
                  href={item.href ?? "/"}
                  aria-current={active ? "page" : undefined}
                  className={linkClasses(active)}
                >
                  {item.label}
                </Link>
              );
            }
            const open = openMenu === item.id;
            const panelId = `productnav-${config.product}-${item.id}`;
            return (
              <div key={item.id} className="relative">
                <button
                  ref={(el) => {
                    triggerRefs.current[item.id] = el;
                  }}
                  type="button"
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={() => toggleMenu(item.id)}
                  className={linkClasses(active)}
                >
                  {item.label}
                  <svg
                    className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
                {open && (
                  <div
                    id={panelId}
                    role="menu"
                    aria-label={item.label}
                    className="absolute left-0 top-full z-[200] mt-2 w-72 overflow-hidden rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-2)]"
                  >
                    <ul className="p-1.5">
                      {item.items.map((sub) => {
                        const subActive = sub.href ? isHrefActive(pathname, sub.href, false) : false;
                        const disabled = sub.disabled || !sub.href;
                        return (
                          <li key={sub.label} role="none">
                            {disabled ? (
                              <span
                                aria-disabled="true"
                                className="flex items-start justify-between gap-3 rounded-[6px] px-3 py-2.5 text-sm text-[var(--text-muted)]"
                              >
                                <span>
                                  <span className="block font-medium">{sub.label}</span>
                                  {sub.description && (
                                    <span className="mt-0.5 block text-xs">{sub.description}</span>
                                  )}
                                </span>
                                {sub.badge && <span className="badge badge-pending shrink-0">{sub.badge}</span>}
                              </span>
                            ) : (
                              <Link
                                role="menuitem"
                                href={sub.href as string}
                                aria-current={subActive ? "page" : undefined}
                                onClick={closeAll}
                                className={[
                                  "flex items-start justify-between gap-3 rounded-[6px] px-3 py-2.5 text-sm transition-colors",
                                  "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
                                  subActive
                                    ? "bg-[var(--status-info-bg)] font-medium text-[var(--status-info-fg)]"
                                    : "text-[var(--text-secondary)] hover:bg-[var(--musgo-50)] hover:text-[var(--text-primary)]",
                                ].join(" ")}
                              >
                                <span>
                                  <span className="block font-medium">{sub.label}</span>
                                  {sub.description && (
                                    <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                                      {sub.description}
                                    </span>
                                  )}
                                </span>
                                {sub.badge && <span className="badge badge-pending shrink-0">{sub.badge}</span>}
                              </Link>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}

          {activeItem && indicator && (
            <span
              aria-hidden="true"
              className="nav-indicator pointer-events-none absolute bottom-0 left-0 h-0.5 w-[100px] origin-left bg-[var(--conifera)]"
              style={{ transform: `translateX(${indicator.x}px) scaleX(${indicator.scale})` }}
            />
          )}

          {!isPlatform && (
            <>
              <span className="mx-1 h-5 w-px bg-[var(--border-subtle)]" aria-hidden="true" />
              <Link
                href="/"
                className="rounded-[6px] px-2 py-2 text-xs font-semibold text-[var(--text-link)] hover:underline hover:underline-offset-4 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
              >
                IDEAS Sostenibilidad
              </Link>
            </>
          )}
          {isPlatform && config.corporateUrl && (
            <a
              href={config.corporateUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="link-external ml-1 rounded-[6px] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            >
              Ideas Medioambientales
            </a>
          )}
          <span className="ml-2 border-l border-[var(--border-subtle)] pl-2">
            <ThemeToggle />
          </span>
        </nav>

        {/* Controles móviles */}
        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle />
          <button
            ref={mobileButtonRef}
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileMenuLabel}
            aria-expanded={mobileOpen}
            aria-controls="productnav-drawer"
            className="flex h-11 w-11 items-center justify-center rounded-[6px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--musgo-50)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
              {mobileOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Drawer móvil */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[300] md:hidden">
          <div
            className="absolute inset-0 bg-[var(--color-overlay)]"
            onClick={closeMobile}
            aria-hidden="true"
          />
          <div
            ref={drawerRef}
            id="productnav-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={isPlatform ? "Menú de navegación" : `Menú de ${config.productLabel}`}
            className="absolute inset-y-0 right-0 flex w-[min(20rem,88vw)] flex-col overflow-y-auto bg-[var(--bg-surface)] shadow-[var(--shadow-3)]"
          >
            <div className="flex h-14 items-center justify-between border-b border-[var(--border-subtle)] px-4 sm:px-6">
              <span className="type-overline text-[var(--text-muted)]">
                {isPlatform ? "Plataforma" : config.productLabel}
              </span>
              <button
                type="button"
                onClick={closeMobile}
                aria-label="Cerrar menú"
                className="flex h-11 w-11 items-center justify-center rounded-[6px] text-[var(--text-secondary)] hover:bg-[var(--musgo-50)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="flex-1 p-3" aria-label={isPlatform ? "Navegación de la plataforma" : `Navegación del módulo ${config.productLabel}`}>
              {!isPlatform && (
                <Link
                  href="/"
                  onClick={closeMobile}
                  className="mb-1 block rounded-[6px] px-4 py-3 text-sm font-semibold text-[var(--text-link)] hover:bg-[var(--musgo-50)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                >
                  ← IDEAS Sostenibilidad
                </Link>
              )}
              {config.navigation.map((item, index) => {
                const active = isItemActive(pathname, item);
                const stagger = { animationDelay: `${index * 30}ms` } as React.CSSProperties;
                if (!item.items || item.items.length === 0) {
                  return (
                    <Link
                      key={item.id}
                      href={item.href ?? "/"}
                      onClick={closeMobile}
                      aria-current={active ? "page" : undefined}
                      style={stagger}
                      className={[
                        "animate-slide-in-right flex items-center gap-3 rounded-[6px] px-4 py-3 text-sm font-medium transition-colors",
                        "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
                        active
                          ? "bg-[var(--status-info-bg)] font-semibold text-[var(--status-info-fg)]"
                          : "text-[var(--text-secondary)] hover:bg-[var(--musgo-50)] hover:text-[var(--text-primary)]",
                      ].join(" ")}
                    >
                      {item.label}
                    </Link>
                  );
                }
                const expanded = mobileExpanded === item.id;
                const sectionId = `productnav-mobile-${config.product}-${item.id}`;
                return (
                  <div key={item.id} className="animate-slide-in-right" style={stagger}>
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={sectionId}
                      onClick={() => setMobileExpanded((cur) => (cur === item.id ? null : item.id))}
                      className={[
                        "flex w-full items-center gap-3 rounded-[6px] px-4 py-3 text-sm font-medium transition-colors",
                        "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
                        active
                          ? "font-semibold text-[var(--moss-ink)]"
                          : "text-[var(--text-secondary)] hover:bg-[var(--musgo-50)] hover:text-[var(--text-primary)]",
                      ].join(" ")}
                    >
                      <span className="flex-1 text-left">{item.label}</span>
                      <svg
                        className={`h-4 w-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                      </svg>
                    </button>
                    {expanded && (
                      <ul id={sectionId} className="pb-1 pl-3">
                        {item.items.map((sub) => {
                          const subActive = sub.href ? isHrefActive(pathname, sub.href, false) : false;
                          const disabled = sub.disabled || !sub.href;
                          return (
                            <li key={sub.label}>
                              {disabled ? (
                                <span
                                  aria-disabled="true"
                                  className="flex items-center justify-between gap-2 rounded-[6px] px-4 py-2.5 text-sm text-[var(--text-muted)]"
                                >
                                  {sub.label}
                                  {sub.badge && <span className="badge badge-pending shrink-0">{sub.badge}</span>}
                                </span>
                              ) : (
                                <Link
                                  href={sub.href as string}
                                  onClick={closeMobile}
                                  aria-current={subActive ? "page" : undefined}
                                  className={[
                                    "flex items-center justify-between gap-2 rounded-[6px] px-4 py-2.5 text-sm transition-colors",
                                    "focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]",
                                    subActive
                                      ? "bg-[var(--status-info-bg)] font-medium text-[var(--status-info-fg)]"
                                      : "text-[var(--text-secondary)] hover:bg-[var(--musgo-50)] hover:text-[var(--text-primary)]",
                                  ].join(" ")}
                                >
                                  {sub.label}
                                  {sub.badge && <span className="badge badge-pending shrink-0">{sub.badge}</span>}
                                </Link>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
              {isPlatform && config.corporateUrl && (
                <a
                  href={config.corporateUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-external mt-1 flex items-center gap-3 rounded-[6px] px-4 py-3 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--musgo-50)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
                >
                  Ideas Medioambientales
                </a>
              )}
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}
