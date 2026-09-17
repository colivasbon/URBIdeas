"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import ThemeToggle from "@/components/ui/ThemeToggle";

/* ============================================================
   ProductNavbar — base compartida de navegación de plataforma
   y módulos (URBideas / SOCideas / Asistencias).

   - Una sola lógica de contracción al scroll (listener pasivo + rAF).
   - Una sola lógica de submenús click-to-open (Escape / click-fuera /
     navegación / apertura exclusiva, aria-expanded + aria-controls).
   - Una sola lógica de menú móvil accesible (secciones expandibles,
     cierre al navegar / Escape, restauración de scroll de body).
   - Variantes visuales por módulo vía `tone`, sin duplicar markup.
   ============================================================ */

export type ProductNavSubItem = {
  label: string;
  /** Sin href → ítem no navegable (p. ej. «Próximamente»). Nunca usar "#". */
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
  product: "platform" | "urbideas" | "socideas" | "asistencias";
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

const COMPACT_AFTER_PX = 56;
const NEAR_TOP_PX = 8;

function useCompactOnScroll(): boolean {
  const [compact, setCompact] = useState(false);
  const lastY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    // Sincronización inicial diferida (rAF): evita set-state síncrono en el efecto.
    const raf = requestAnimationFrame(() => {
      lastY.current = window.scrollY;
      setCompact(window.scrollY > COMPACT_AFTER_PX);
    });

    const update = () => {
      ticking.current = false;
      const y = window.scrollY;
      const prev = lastY.current;
      lastY.current = y;
      // Sin setState por píxel: solo cambia en transiciones de estado.
      setCompact((c) => {
        if (y <= NEAR_TOP_PX) return false;
        if (y > COMPACT_AFTER_PX && y > prev + 2) return true;
        if (y < prev - 4) return false;
        return c;
      });
    };

    const onScroll = () => {
      if (!ticking.current) {
        ticking.current = true;
        requestAnimationFrame(update);
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return compact;
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

const TONE_BAR: Record<ProductTone, string> = {
  platform: "bg-conifera",
  urban: "bg-conifera",
  social: "bg-conifera",
  assistance: "bg-conifera",
};

export default function ProductNavbar({ config }: { config: ProductNavbarConfig }) {
  const pathname = usePathname();
  const compact = useCompactOnScroll();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const tone: ProductTone = config.tone ?? "platform";
  const isPlatform = config.product === "platform";

  const closeAll = useCallback(() => {
    setOpenMenu(null);
  }, []);

  // Cierre al navegar: cada página monta su propio header (sin layout
  // compartido), por lo que el estado se reinicia con la navegación; además
  // todos los enlaces cierran vía onClick. Sin efecto sobre pathname para
  // evitar set-state-in-effect y renders en cascada.

  // Escape + click fuera (solo cuando hay algo abierto).
  useEffect(() => {
    if (!openMenu && !mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const trigger = openMenu ? triggerRefs.current[openMenu] : null;
        setOpenMenu(null);
        setMobileOpen(false);
        setMobileExpanded(null);
        trigger?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [openMenu, mobileOpen]);

  // Bloqueo de scroll del body en móvil, siempre restaurado.
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  const toggleMenu = (id: string) =>
    setOpenMenu((cur) => (cur === id ? null : id));

  const linkClasses = (active: boolean) =>
    [
      "relative px-3 py-2 text-sm font-medium rounded-[6px] transition-colors duration-200 ease-out",
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--retama)]",
      active
        ? "text-hueso bg-musgo-active"
        : "text-hueso hover:bg-white/10",
    ].join(" ");

  const backLinkClasses =
    "inline-flex items-center gap-1.5 rounded-[6px] text-xs font-semibold text-hueso hover:underline hover:underline-offset-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--retama)]";

  const mobileMenuLabel = mobileOpen
    ? `Cerrar menú${isPlatform ? "" : ` de ${config.productLabel}`}`
    : (config.mobileMenuLabel ?? (isPlatform ? "Abrir menú" : `Abrir menú de ${config.productLabel}`));

  return (
    <header ref={rootRef} className="sticky top-0 z-50 w-full">
      <div aria-hidden="true" className={`h-1 w-full ${TONE_BAR[tone]}`} />
      <div className="header-glass text-hueso">
      
        <div
          className={[
            "mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 transition-all duration-300",
            compact ? "h-12" : "h-14 sm:h-16",
          ].join(" ")}
        >
          {/* Nivel plataforma + nivel producto */}
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <Link
              href="/"
              aria-label={PLATFORM_HOME_ARIA_LABEL}
              className="flex shrink-0 items-center rounded-[6px] bg-white px-1.5 py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--retama)]"
            >
              <Image
                src="/logo/Logo_Principal_-_color_-_Ideas_Medioambientales.png"
                alt="Ideas Medioambientales"
                width={28}
                height={28}
                className={`w-auto transition-all duration-300 ${compact ? "h-6" : "h-7"}`}
                priority
              />
            </Link>
            {isPlatform ? (
              <Link
                href="/"
                className="min-w-0 leading-tight rounded-[6px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--retama)]"
              >
                <span className="block truncate text-sm font-semibold text-hueso">
                  IDEAS Sostenibilidad
                </span>
                {!compact && (
                  <span className="block truncate text-[10px] font-medium uppercase tracking-widest text-hueso">
                    Área de Sostenibilidad de Ideas Medioambientales
                  </span>
                )}
              </Link>
            ) : (
              <>
                <span aria-hidden="true" className="h-6 w-px shrink-0 bg-white/25" />
                <Link
                  href={config.productHref}
                  aria-label={`${config.productLabel} — inicio del módulo`}
                  className="flex min-w-0 items-center gap-2 rounded-[6px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--retama)]"
                >
                  <span
                    aria-hidden="true"
                    className={[
                      "flex shrink-0 items-center justify-center rounded-[6px] bg-conifera font-bold text-carbon transition-all duration-300",
                      compact ? "h-7 w-7 text-xs" : "h-9 w-9 text-sm",
                    ].join(" ")}
                  >
                    {config.productMark}
                  </span>
                  <span className="min-w-0 leading-tight">
                    <span
                      className={[
                        "block truncate font-bold tracking-tight text-hueso transition-all duration-300",
                        compact ? "text-base" : "text-lg",
                      ].join(" ")}
                    >
                      {config.productLabel}
                    </span>
                    {!compact && config.productDescription && (
                      <span className="block truncate text-[10px] font-medium text-hueso">
                        {config.productDescription}
                      </span>
                    )}
                  </span>
                </Link>
              </>
            )}
          </div>

          {/* Navegación desktop: click-to-open */}
          <nav className="hidden items-center gap-1 md:flex" aria-label={isPlatform ? "Navegación de la plataforma" : `Navegación del módulo ${config.productLabel}`}>
            {config.navigation.map((item) => {
              const active = isItemActive(pathname, item);
              if (!item.items || item.items.length === 0) {
                return (
                  <Link
                    key={item.id}
                    href={item.href ?? "/"}
                    aria-current={active ? "page" : undefined}
                    className={linkClasses(active)}
                  >
                    {item.label}
                    {active && (
                      <span className="absolute bottom-0 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-retama" />
                    )}
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
                    className={`${linkClasses(active)} inline-flex items-center gap-1`}
                  >
                    {item.label}
                    <svg
                      className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2.5}
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                    {active && (
                      <span className="absolute bottom-0 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-retama" />
                    )}
                  </button>
                  {open && (
                    <div
                      id={panelId}
                      role="menu"
                      aria-label={item.label}
                      className="absolute left-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-[6px] border border-limo bg-[var(--color-card-bg)] shadow-lg animate-slide-in-down"
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
                                  className="flex items-start justify-between gap-3 rounded-[6px] px-3 py-2.5 text-sm text-[var(--color-text-muted)]"
                                >
                                  <span>
                                    <span className="block font-medium">{sub.label}</span>
                                    {sub.description && (
                                      <span className="mt-0.5 block text-xs">{sub.description}</span>
                                    )}
                                  </span>
                                  {sub.badge && (
                                    <span className="shrink-0 rounded-[6px] border border-limo bg-[var(--color-input-bg)] px-2 py-0.5 text-[11px] font-semibold">
                                      {sub.badge}
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <Link
                                  role="menuitem"
                                  href={sub.href as string}
                                  aria-current={subActive ? "page" : undefined}
                                  onClick={closeAll}
                                  className={[
                                    "flex items-start justify-between gap-3 rounded-[6px] px-3 py-2.5 text-sm transition-colors",
                                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss-ink)]",
                                    subActive
                                      ? "bg-[var(--color-input-bg)] text-[var(--color-text-primary)]"
                                      : "text-[var(--color-text-secondary)] hover:bg-[var(--color-input-bg-hover)] hover:text-[var(--color-text-primary)]",
                                  ].join(" ")}
                                >
                                  <span>
                                    <span className="block font-medium">{sub.label}</span>
                                    {sub.description && (
                                      <span className="mt-0.5 block text-xs text-[var(--color-text-muted)]">
                                        {sub.description}
                                      </span>
                                    )}
                                  </span>
                                  {sub.badge && (
                                    <span className="shrink-0 rounded-[6px] border border-limo bg-[var(--color-input-bg)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-text-muted)]">
                                      {sub.badge}
                                    </span>
                                  )}
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
            {!isPlatform && (
              <>
                <span className="mx-1 h-5 w-px bg-white/25" aria-hidden="true" />
                <Link href="/" className={backLinkClasses} aria-label="Volver a IDEAS Sostenibilidad">
                  IDEAS Sostenibilidad
                </Link>
              </>
            )}
            {isPlatform && config.corporateUrl && (
              <a
                href={config.corporateUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 rounded-[6px] px-3 py-2 text-sm font-medium text-hueso transition-colors duration-200 hover:bg-white/10"
              >
                Ideas Medioambientales
              </a>
            )}
            <span className="ml-2 border-l border-white/25 pl-2">
              <ThemeToggle />
            </span>
          </nav>

          {/* Controles móviles */}
          <div className="flex items-center gap-2 md:hidden">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileMenuLabel}
              aria-expanded={mobileOpen}
              className="flex h-11 w-11 items-center justify-center rounded-[6px] text-hueso transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--retama)]"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                {mobileOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Panel móvil */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-[var(--color-overlay)] backdrop-blur-sm md:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <nav
            className="absolute inset-x-0 top-full z-50 border-b border-[var(--musgo-active)] bg-[var(--brand-bg)] text-hueso shadow-lg animate-slide-in-down md:hidden"
            aria-label={isPlatform ? "Navegación de la plataforma" : `Navegación del módulo ${config.productLabel}`}
          >
            <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
              {!isPlatform && (
                <Link
                  href="/"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 rounded-[6px] px-4 py-3 text-sm font-semibold text-hueso hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--retama)]"
                >
                  IDEAS Sostenibilidad
                </Link>
              )}
              {config.navigation.map((item) => {
                const active = isItemActive(pathname, item);
                if (!item.items || item.items.length === 0) {
                  return (
                    <Link
                      key={item.id}
                      href={item.href ?? "/"}
                      onClick={() => setMobileOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={[
                        "flex items-center gap-3 rounded-[6px] px-4 py-3 text-sm font-medium transition-colors duration-200",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--retama)]",
                        active
                          ? "bg-musgo-active text-hueso"
                          : "text-hueso hover:bg-white/10",
                      ].join(" ")}
                    >
                      {active && <span className="h-5 w-1 shrink-0 rounded-full bg-retama" />}
                      {item.label}
                    </Link>
                  );
                }
                const expanded = mobileExpanded === item.id;
                const sectionId = `productnav-mobile-${config.product}-${item.id}`;
                return (
                  <div key={item.id} className="rounded-[6px]">
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={sectionId}
                      onClick={() => setMobileExpanded((cur) => (cur === item.id ? null : item.id))}
                      className={[
                        "flex w-full items-center gap-3 rounded-[6px] px-4 py-3 text-sm font-medium transition-colors duration-200",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--retama)]",
                        active
                          ? "bg-musgo-active text-hueso"
                          : "text-hueso hover:bg-white/10",
                      ].join(" ")}
                    >
                      {active && <span className="h-5 w-1 shrink-0 rounded-full bg-retama" />}
                      <span className="flex-1 text-left">{item.label}</span>
                      <svg
                        className={`h-4 w-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2.5}
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                      </svg>
                    </button>
                    {expanded && (
                      <ul id={sectionId} className="pb-1 pl-8 pr-2">
                        {item.items.map((sub) => {
                          const subActive = sub.href ? isHrefActive(pathname, sub.href, false) : false;
                          const disabled = sub.disabled || !sub.href;
                          return (
                            <li key={sub.label}>
                              {disabled ? (
                                <span aria-disabled="true" className="flex items-center justify-between gap-2 rounded-[6px] px-4 py-2.5 text-sm text-hueso">
                                  {sub.label}
                                  {sub.badge && (
                                    <span className="shrink-0 rounded-[6px] border border-white/40 px-2 py-0.5 text-[11px] font-semibold">
                                      {sub.badge}
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <Link
                                  href={sub.href as string}
                                  onClick={() => setMobileOpen(false)}
                                  aria-current={subActive ? "page" : undefined}
                                  className={[
                                    "flex items-center justify-between gap-2 rounded-[6px] px-4 py-2.5 text-sm transition-colors",
                                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--retama)]",
                                    subActive
                                      ? "bg-musgo-active text-hueso"
                                      : "text-hueso hover:bg-white/10",
                                  ].join(" ")}
                                >
                                  {sub.label}
                                  {sub.badge && (
                                    <span className="shrink-0 rounded-[6px] border border-white/40 px-2 py-0.5 text-[11px] font-semibold">
                                      {sub.badge}
                                    </span>
                                  )}
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
                  className="flex items-center gap-3 rounded-[6px] px-4 py-3 text-sm font-medium text-hueso hover:bg-white/10"
                >
                  Ideas Medioambientales
                </a>
              )}
            </div>
          </nav>
        </>
      )}
    </header>
  );
}
