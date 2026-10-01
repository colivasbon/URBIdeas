import Image from "next/image";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import type { BrandModule } from "./brand-modules";

/**
 * Grid de módulos de marca: cada tarjeta presenta el logotipo completo
 * (símbolo + denominación) como enlace al módulo, con su descripción
 * existente. El nombre de la marca viaja en el alt de la imagen, que es
 * también el único texto del enlace: no hay duplicación para lectores de
 * pantalla. El logotipo conserva sus colores y transparencias; nunca se
 * fuerza a monocromo ni se le aplican filtros.
 */
export default function ModuleBrandGrid({ modules }: { modules: BrandModule[] }) {
  return (
    <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {modules.map((m) => (
        <li key={m.id}>
          <article className="card flex h-full flex-col items-center p-6 text-center">
            <Link
              href={m.href}
              className="group block rounded-[6px] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            >
              <Image
                src={m.logo}
                alt={m.alt}
                width={m.logoWidth}
                height={m.logoHeight}
                className="mx-auto h-44 w-auto max-w-full transition-transform duration-200 group-hover:-translate-y-1 group-focus-visible:-translate-y-1 motion-reduce:transform-none"
              />
            </Link>
            {m.badge && (
              <div className="mt-4">
                <Badge variant="muted">{m.badge}</Badge>
              </div>
            )}
            <p className="mt-4 text-sm leading-relaxed text-[var(--text-secondary)]">
              {m.description}
            </p>
          </article>
        </li>
      ))}
    </ul>
  );
}
