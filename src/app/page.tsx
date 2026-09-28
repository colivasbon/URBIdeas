import type { Metadata } from "next";
import Link from "next/link";
import SocideasHeader from "@/components/platform/SocideasHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";
import { CORPORATE_URL } from "@/components/platform/product-nav-config";
import SocideasSearch from "@/components/socideas/SocideasSearch";
import Badge from "@/components/ui/Badge";

export const metadata: Metadata = {
  title: { absolute: "SOCideas | IDEAS Sostenibilidad" },
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

const FUENTES = [
  { fuente: "INE, Padrón municipal", aporta: "Población y estructura por edad y sexo" },
  { fuente: "INE, Atlas de Distribución de Renta de los Hogares", aporta: "Renta por persona y hogar, Gini, P80/P20" },
  { fuente: "AEAT, declarantes del IRPF por municipio", aporta: "Renta bruta y disponible por declaración" },
  { fuente: "INE, DIRCE", aporta: "Empresas totales y por sector" },
  { fuente: "INE, Censo Agrario 2020", aporta: "Superficie agraria, explotaciones y cabaña ganadera" },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <SocideasHeader />

      <main id="contenido" className="flex-1">
        <section className="container-ima home-top" aria-labelledby="titulo-portada">
          <div className="home-top__rule" aria-hidden="true" />
          <div className="flex flex-wrap items-center gap-3">
            <p className="type-label text-[var(--moss-ink)]">SOCideas</p>
            <Badge variant="muted">Beta interna</Badge>
          </div>
          <h1 id="titulo-portada" className="type-display mt-5 max-w-[16ch] text-[var(--text-primary)]">
            La ficha social y económica de un municipio
          </h1>
          <p className="mt-6 max-w-[42ch] text-[var(--fs-body-lg)] leading-[var(--lh-body-lg)] text-[var(--text-secondary)]">
            Busque el municipio por nombre o código INE. Cada indicador de la ficha indica su
            fuente oficial y su año.
          </p>
          <div id="buscador" className="home-finder mt-10 scroll-mt-24">
            <h2 className="type-h4 text-[var(--text-primary)]">Buscar un municipio</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Por nombre, por código INE o acotando por comunidad y provincia.
            </p>
            <div className="mt-5">
              <SocideasSearch />
            </div>
          </div>
        </section>

        <section aria-labelledby="contenido-ficha" className="border-t border-[var(--border-default)] bg-[var(--bg-canvas)]">
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
              <div className="home-index">
                {BLOQUES.map((b) => (
                  <div key={b.nombre} className="home-index__row">
                    <div>
                      <span className="home-index__name">{b.nombre}</span>
                      <span className="home-index__src">{b.fuente}</span>
                    </div>
                    <p className="home-index__desc">{b.descripcion}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="fuentes" className="border-t border-[var(--border-default)] bg-[var(--bg-canvas)]">
          <div className="container-ima section-ima">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-16">
              <div>
                <h2 id="fuentes" className="type-h2 text-[var(--text-primary)]">
                  De dónde salen los datos
                </h2>
                <p className="mt-4 max-w-[42ch] text-[var(--text-secondary)]">
                  Cada cifra conserva su fuente y su periodo de referencia para citarla en un informe.
                </p>
                <p className="mt-6 text-sm">
                  <a href={CORPORATE_URL} target="_blank" rel="noopener noreferrer" className="link link-external">
                    Ideas Medioambientales
                  </a>
                </p>
              </div>
              <div className="data-table-wrap rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-surface)]">
                <table className="data-table">
                  <caption className="sr-only">Fuentes oficiales de SOCideas</caption>
                  <thead>
                    <tr>
                      <th scope="col">Fuente</th>
                      <th scope="col">Qué aporta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {FUENTES.map((f) => (
                      <tr key={f.fuente}>
                        <td className="font-medium">{f.fuente}</td>
                        <td className="meta">{f.aporta}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PlatformFooter />
    </div>
  );
}
