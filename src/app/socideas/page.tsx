import type { Metadata } from "next";
import Link from "next/link";
import SocideasHeader from "@/components/platform/SocideasHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";
import SocideasSearch from "@/components/socideas/SocideasSearch";
import SectionHeading from "@/components/ui/SectionHeading";
import Badge from "@/components/ui/Badge";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import SectionReveal from "@/components/ui/SectionReveal";

export const metadata: Metadata = {
  title: "SOCideas",
  description:
    "Beta interna de IDEAS Sostenibilidad para la caracterización sociodemográfica municipal con fuentes oficiales trazables.",
};

const BLOQUES = [
  {
    tone: "available" as const,
    badge: "Disponible",
    title: "Demografía",
    description:
      "Población municipal, evolución anual y estructura por edad y sexo. Instituto Nacional de Estadística.",
  },
  {
    tone: "warning" as const,
    badge: "En desarrollo",
    title: "Economía",
    description:
      "Renta por declaración, renta y desigualdad, empresas y sector agrario. Cada subbloque declara cobertura y año.",
  },
  {
    tone: "pending" as const,
    badge: "En preparación",
    title: "Secciones censales",
    description:
      "Geometría oficial del INE bajo demanda. Indicadores por sección solo con fuente oficial a ese nivel.",
  },
];

const badgeVariant = {
  available: "secondary",
  warning: "accent",
  pending: "muted",
} as const;

export default function SocideasHub() {
  return (
    <div className="flex min-h-screen flex-col">
      <SocideasHeader />

      <main id="contenido" className="flex-1">
        {/* Hero funcional: el buscador es el punto de partida */}
        <section className="bg-[var(--bg-inverse)] text-[var(--text-inverse)]">
          <div className="container-ima py-12 sm:py-16">
            <Breadcrumbs
              items={[{ label: "IDEAS Sostenibilidad", href: "/" }, { label: "SOCideas" }]}
              tone="inverse"
            />
            <p className="type-overline mt-5 text-[var(--retama)]">
              SOCideas · IDEAS Sostenibilidad
            </p>
            <h1 className="type-h1 mt-3 max-w-2xl text-[var(--text-inverse)]">
              Diagnóstico municipal con fuentes oficiales
            </h1>
            <p className="measure mt-4 text-[var(--fs-body-lg)] leading-[var(--lh-body-lg)] text-[var(--text-inverse-secondary)]">
              Diagnóstico demográfico y económico de cualquier municipio español a partir de
              fuentes oficiales trazables.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Badge variant="muted">Beta interna</Badge>
              <Badge variant="secondary" dot>
                Demografía disponible
              </Badge>
              <Badge variant="accent">Economía en desarrollo</Badge>
            </div>

            <div className="mt-8 rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 text-[var(--text-primary)] shadow-[var(--shadow-2)] sm:p-7">
              <SectionHeading
                title="Buscador municipal"
                lede="Escriba el nombre del municipio o de su provincia para abrir su ficha de caracterización."
                as="h2"
              />
              <div className="mt-5">
                <SocideasSearch />
              </div>
            </div>
          </div>
        </section>

        {/* Fuentes y cobertura */}
        <SectionReveal>
          <div className="container-ima section-ima">
            <p className="type-overline text-[var(--moss-ink)]">Fuentes y cobertura</p>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              {BLOQUES.map((bloque) => (
                <div key={bloque.title} className="card p-6">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="type-h4 text-[var(--text-primary)]">{bloque.title}</h2>
                    <Badge variant={badgeVariant[bloque.tone]} dot={bloque.tone !== "pending"}>
                      {bloque.badge}
                    </Badge>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
                    {bloque.description}
                  </p>
                </div>
              ))}
            </div>
            <p className="note mt-8 max-w-3xl">
              Los datos se sincronizan de forma controlada y se almacenan con trazabilidad; no se
              consulta a las fuentes oficiales en cada visita.
            </p>
          </div>
        </SectionReveal>

        <section aria-label="Enlaces relacionados" className="border-t border-[var(--border-subtle)]">
          <div className="container-ima flex flex-wrap gap-3 py-10">
            <Link href="/socideas/como-funciona" className="btn btn-secondary">
              Cómo funciona
            </Link>
            <Link href="/" className="btn btn-ghost">
              Volver a la plataforma
            </Link>
          </div>
        </section>
      </main>

      <PlatformFooter />
    </div>
  );
}
