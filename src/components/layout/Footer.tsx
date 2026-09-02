import Image from "next/image"

export default function Footer() {
  return (
    <footer className="border-t border-[var(--color-border-subtle)] bg-[var(--color-dark-bg)]">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:justify-between sm:items-start">
          <div className="flex items-start gap-2.5">
            <Image
              src="/logo/Logo_Principal_-_color_-_Ideas_Medioambientales.png"
              alt="Ideas Medioambientales"
              width={24}
              height={24}
              className="h-6 w-auto opacity-60"
            />
            <div>
              <p className="text-xs font-semibold text-[var(--color-text-primary)] uppercase tracking-wider">Ideas Medioambientales</p>
              <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                Registro Urbanístico España v1.0
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:gap-10">
            <div className="flex flex-col gap-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Plataforma</p>
              <div className="flex flex-col gap-0.5">
                <a href="/municipios" className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">Municipios</a>
                <a href="/mapa" className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">Mapa</a>
                <a href="/legislacion" className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">Legislación</a>
                <a href="/api-docs" className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">API</a>
              </div>
            </div>
            <div className="max-w-xs">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">Aviso legal</p>
              <p className="text-[11px] leading-relaxed text-[var(--color-text-muted)]">
                La información mostrada procede de fuentes oficiales (BOE, boletines autonómicos,
                geoportales municipales). Su consulta es orientativa; para validez jurídica,
                acuda al texto publicado en la correspondiente sede electrónica.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-[var(--color-border-subtle)] flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-[11px] text-[var(--color-text-muted)]">
            &copy; {new Date().getFullYear()} Ideas Medioambientales. Todos los derechos reservados.
          </p>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)] animate-pulse" />
              Sistema operativo
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}
