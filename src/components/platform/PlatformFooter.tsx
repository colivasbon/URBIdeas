import Link from "next/link";
import { CORPORATE_URL } from "./product-nav-config";

export default function PlatformFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <div className="mx-auto w-full max-w-[1240px] px-4 py-8 sm:px-6 lg:px-10">
        <div className="site-footer__row">
          <p className="text-sm font-semibold text-[var(--hueso)]">
            IDEAS Sostenibilidad
            <span className="ml-2 font-normal text-[color-mix(in_srgb,var(--hueso)_82%,var(--carbon))]">
              Ideas Medioambientales, Albacete
            </span>
          </p>
          <nav className="site-footer__links" aria-label="Pie de página">
            <Link href="/">SOCideas</Link>
            <Link href="/#buscador">Buscar un municipio</Link>
            <Link href="/socideas/como-funciona">Metodología</Link>
            <a href={CORPORATE_URL} target="_blank" rel="noopener noreferrer" className="link-external">
              ideasmedioambientales.com
            </a>
          </nav>
        </div>
        <div className="mt-6 flex flex-col gap-2 border-t border-white/15 pt-5 sm:flex-row sm:items-start sm:justify-between">
          <p className="site-footer__note">
            Información orientativa procedente de fuentes oficiales (INE, AEAT y boletines oficiales).
            Para validez jurídica, acuda al texto publicado en sede electrónica.
          </p>
          <p className="site-footer__note whitespace-nowrap">&copy; {year} Ideas Medioambientales, S.L.</p>
        </div>
      </div>
    </footer>
  );
}
