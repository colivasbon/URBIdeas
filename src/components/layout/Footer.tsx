import Image from "next/image"

export default function Footer() {
  return (
    <footer className="border-t border-[var(--color-border-subtle)] bg-[var(--color-dark-bg)]">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8 sm:flex-row sm:justify-between sm:items-start">
          <div className="flex items-start gap-3">
            <Image
              src="/logo/Logo_Principal_-_color_-_Ideas_Medioambientales.png"
              alt="Ideas Medioambientales"
              width={28}
              height={28}
              className="h-7 w-auto opacity-80"
            />
            <div>
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">Ideas Medioambientales</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                Registro Urbanístico España v1.0
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:gap-10">
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Plataforma</p>
              <div className="flex flex-col gap-1">
                <a href="/municipios" className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors">Municipios</a>
                <a href="/mapa" className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors">Mapa</a>
                <a href="/legislacion" className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors">Legislación</a>
                <a href="/api-docs" className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors">API</a>
              </div>
            </div>
            <div className="max-w-xs">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">Aviso legal</p>
              <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
                La información mostrada procede de fuentes oficiales (BOE, boletines autonómicos,
                geoportales municipales). Su consulta es orientativa; para validez jurídica,
                acuda al texto publicado en la correspondiente sede electrónica.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-5 border-t border-[var(--color-border-subtle)] flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-[var(--color-text-muted)]">
            &copy; {new Date().getFullYear()} Ideas Medioambientales. Todos los derechos reservados.
          </p>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)] animate-pulse" />
              Sistema operativo
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}
