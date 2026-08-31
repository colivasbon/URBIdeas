import Image from "next/image"

export default function Footer() {
  return (
    <footer className="border-t border-[var(--color-border)] bg-[var(--color-dark-bg)] transition-colors duration-200">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/logo/Logo_Principal_-_color_-_Ideas_Medioambientales.png"
              alt="Ideas Medioambientales"
              width={28}
              height={28}
              className="h-7 w-auto"
            />
            <div>
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">Ideas Medioambientales</p>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Registro Urbanístico España v1.0
              </p>
            </div>
          </div>

          <p className="max-w-md text-center text-xs leading-relaxed text-[var(--color-text-secondary)] sm:text-right">
            La información mostrada procede de fuentes oficiales (BOE, boletines autonomicos,
            geoportales municipales). Su consulta es orientativa; para validez jurídica,
            acuda al texto publicado en la correspondiente sede electrónica.
          </p>
        </div>

        <div className="mt-6 border-t border-[var(--color-border)] pt-4 text-center">
          <p className="text-xs text-[var(--color-text-secondary)]">
            &copy; {new Date().getFullYear()} Ideas Medioambientales. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </footer>
  )
}
