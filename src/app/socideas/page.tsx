import type { Metadata } from "next";
import Link from "next/link";
import SocideasHeader from "@/components/platform/SocideasHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";
import MapSheet from "@/components/platform/MapSheet";
import SocideasSearch from "@/components/socideas/SocideasSearch";
import Badge from "@/components/ui/Badge";
import Breadcrumbs from "@/components/ui/Breadcrumbs";

export const metadata: Metadata = {
  title: "SOCideas",
  description:
    "Beta interna de IDEAS Sostenibilidad para la caracterización sociodemográfica municipal con fuentes oficiales trazables.",
};

const BLOQUES = [
  {
    nombre: "Demografía",
    descripcion: "Población, evolución anual y estructura por edad y sexo, con comparativa provincial, autonómica y estatal.",
    fuente: "INE",
  },
  {
    nombre: "Economía",
    descripcion: "Renta de los hogares y por declaración, desigualdad, tejido empresarial y estructura agraria.",
    fuente: "INE, AEAT",
  },
  {
    nombre: "Secciones censales",
    descripcion: "Atlas por sección censal sobre la geometría oficial, solo con indicadores publicados a ese nivel.",
    fuente: "INE",
  },
  {
    nombre: "Descargas",
    descripcion: "Tablas de cada bloque con fuente y periodo, en formato listo para anexar.",
    fuente: "Todas",
  },
];

export default function SocideasHub() {
  return (
    <div className="flex min-h-screen flex-col">
      <SocideasHeader />

      <main id="contenido" className="flex-1">
        <section className="container-ima pt-6 pb-12 sm:pt-10 sm:pb-16">
          <Breadcrumbs
            items={[{ label: "IDEAS Sostenibilidad", href: "/" }, { label: "SOCideas" }]}
            className="mb-6"
          />
          <MapSheet relief={false}>
            <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <p className="type-label text-[var(--moss-ink)]">SOCideas</p>
                  <Badge variant="muted">Beta interna</Badge>
                </div>
                <h1 className="type-h1 mt-4 max-w-[16ch] text-[var(--text-primary)]">
                  La ficha social y económica de un municipio
                </h1>
                <p className="mt-5 max-w-[40ch] text-[var(--fs-body-lg)] leading-[var(--lh-body-lg)] text-[var(--text-secondary)]">
                  Busque el municipio por nombre o código INE. Cada indicador de la ficha indica su
                  fuente oficial y su año.
                </p>
              </div>
              <div
                id="buscador"
                className="scroll-mt-24 rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 sm:p-6"
              >
                <h2 className="type-h4 text-[var(--text-primary)]">Buscar un municipio</h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Por nombre, por código INE o acotando por comunidad y provincia.
                </p>
                <div className="mt-5">
                  <SocideasSearch />
                </div>
              </div>
            </div>
          </MapSheet>
        </section>

        <section aria-labelledby="contenido-ficha" className="border-t border-[var(--border-subtle)]">
          <div className="container-ima section-ima">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-16">
              <div>
                <h2 id="contenido-ficha" className="type-h2 text-[var(--text-primary)]">
                  Qué contiene la ficha
                </h2>
                <p className="mt-4 max-w-[40ch] text-[var(--text-secondary)]">
                  Los datos se sincronizan de forma controlada y se guardan con su trazabilidad; no se
                  consulta a la fuente en cada visita.
                </p>
                <p className="mt-6">
                  <Link href="/socideas/como-funciona" className="link text-sm">
                    Metodología, fuentes y cobertura
                  </Link>
                </p>
              </div>
              <dl className="module-index">
                {BLOQUES.map((b) => (
                  <div key={b.nombre} className="module-index__row">
                    <dt>
                      <span className="module-index__name">{b.nombre}</span>
                      <span className="mt-1 block text-xs text-[var(--text-muted)]">{b.fuente}</span>
                    </dt>
                    <dd className="module-index__desc">{b.descripcion}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>
      </main>

      <PlatformFooter />
    </div>
  );
}
