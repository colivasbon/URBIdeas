import type { Metadata } from "next";
import Link from "next/link";
import PlatformHeader, { CORPORATE_URL } from "@/components/platform/PlatformHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";
import MapSheet from "@/components/platform/MapSheet";
import Badge from "@/components/ui/Badge";

export const metadata: Metadata = {
  title: "IDEAS Sostenibilidad | Ideas Medioambientales",
  description:
    "Plataforma del Área de Sostenibilidad de Ideas Medioambientales para el análisis territorial, la consulta municipal y el apoyo técnico a proyectos.",
};

type Entrada = { nombre: string; descripcion: string; href?: string };

const URBIDEAS: Entrada[] = [
  {
    nombre: "Mapa y dictamen",
    href: "/urbideas/mapa",
    descripcion: "Dibuje un ámbito, cruce sus afecciones y descargue el expediente con el dictamen.",
  },
  {
    nombre: "Municipios",
    href: "/urbideas/municipios",
    descripcion: "Planeamiento urbanístico de cualquier municipio de España.",
  },
  {
    nombre: "Legislación",
    href: "/urbideas/legislacion",
    descripcion: "Normativa urbanística estatal, autonómica y municipal.",
  },
  {
    nombre: "API",
    href: "/urbideas/api-docs",
    descripcion: "Los mismos datos, para consulta programática desde sus herramientas.",
  },
];

const SOCIDEAS: Entrada[] = [
  {
    nombre: "Demografía",
    descripcion: "Población, evolución anual y estructura por edad y sexo, con comparativa provincial y autonómica.",
  },
  {
    nombre: "Economía",
    descripcion: "Renta de los hogares y por declaración, desigualdad, tejido empresarial y estructura agraria.",
  },
  {
    nombre: "Secciones censales",
    descripcion: "Indicadores por sección censal sobre la geometría oficial del INE.",
  },
  {
    nombre: "Descargas",
    descripcion: "Tablas de cada bloque con fuente y periodo, listas para anexar a un informe.",
  },
];

const FUENTES = [
  { fuente: "INE, Padrón municipal", aporta: "Población y estructura por edad y sexo", modulo: "SOCideas" },
  { fuente: "INE, Atlas de Distribución de Renta de los Hogares", aporta: "Renta por persona y hogar, Gini, P80/P20", modulo: "SOCideas" },
  { fuente: "AEAT, declarantes del IRPF por municipio", aporta: "Renta bruta y disponible por declaración", modulo: "SOCideas" },
  { fuente: "INE, DIRCE", aporta: "Empresas totales y por sector", modulo: "SOCideas" },
  { fuente: "INE, Censo Agrario 2020", aporta: "Superficie agraria, explotaciones y cabaña ganadera", modulo: "SOCideas" },
  { fuente: "Boletines oficiales estatal y autonómicos", aporta: "Normativa urbanística y planeamiento publicado", modulo: "URBideas" },
  { fuente: "Servicios WMS de las administraciones", aporta: "Capas de afecciones para el cruce de ámbitos", modulo: "URBideas" },
];

function IndiceModulo({ entradas }: { entradas: Entrada[] }) {
  return (
    <dl className="module-index mt-6">
      {entradas.map((e) => (
        <div key={e.nombre} className="module-index__row">
          <dt>
            {e.href ? (
              <Link href={e.href} className="module-index__name">
                {e.nombre}
              </Link>
            ) : (
              <span className="module-index__name">{e.nombre}</span>
            )}
          </dt>
          <dd className="module-index__desc">{e.descripcion}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function PlatformHome() {
  return (
    <div className="flex min-h-screen flex-col">
      <PlatformHeader />

      <main id="contenido" className="flex-1">
        {/* Hoja de portada: sin animación de entrada (no penalizar LCP) */}
        <section className="container-ima pt-6 pb-12 sm:pt-10 sm:pb-16">
          <MapSheet>
            <div className="max-w-[44rem]">
              <p className="type-label text-[var(--moss-ink)]">
                Área de Sostenibilidad de Ideas Medioambientales
              </p>
              <h1 className="type-display mt-4 max-w-[18ch] text-[var(--text-primary)]">
                Diagnóstico territorial de cualquier municipio de España
              </h1>
              <p className="mt-6 max-w-[34rem] text-[var(--fs-body-lg)] leading-[var(--lh-body-lg)] text-[var(--text-secondary)]">
                Demografía y economía con fuente y año en SOCideas. Cada dato remite a su fuente oficial.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/socideas#buscador" className="btn btn-primary btn-lg">
                  Buscar un municipio
                </Link>
              </div>
            </div>
          </MapSheet>
        </section>

        {/* Contenido por módulo */}
        <section aria-labelledby="modulos" className="border-t border-[var(--border-subtle)]">
          <div className="container-ima section-ima">
            <h2 id="modulos" className="type-h2 max-w-[24ch] text-[var(--text-primary)]">
              Qué puede consultar
            </h2>
            <div className="mt-10 max-w-2xl">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="type-h3">
                  <Link href="/socideas" className="text-[var(--text-primary)]">
                    SOCideas
                  </Link>
                </h3>
                <Badge variant="muted">Beta interna</Badge>
              </div>
              <p className="mt-2 text-[var(--text-secondary)]">
                Ficha municipal demográfica y económica. Se abre buscando el municipio.
              </p>
              <IndiceModulo entradas={SOCIDEAS} />
            </div>
            <p className="mt-12 max-w-[60ch] text-sm text-[var(--text-muted)]">
              Las asistencias técnicas de sostenibilidad (caracterización territorial, comunicación,
              participación y seguimiento de proyectos) se incorporarán como tercer módulo.
            </p>
          </div>
        </section>

        {/* Fuentes */}
        <section aria-labelledby="fuentes" className="border-t border-[var(--border-subtle)] bg-[var(--bg-surface-sunken)]">
          <div className="container-ima section-ima">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
              <div>
                <h2 id="fuentes" className="type-h2 text-[var(--text-primary)]">
                  De dónde salen los datos
                </h2>
                <p className="mt-4 max-w-[46ch] text-[var(--text-secondary)]">
                  Los datos se sincronizan de forma controlada desde fuentes oficiales; la
                  plataforma no consulta a la fuente en cada visita. Cada cifra conserva su fuente
                  y su periodo de referencia para citarla en un informe.
                </p>
                <p className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                  <Link href="/socideas/como-funciona" className="link">
                    Metodología de SOCideas
                  </Link>
                  <a href={CORPORATE_URL} target="_blank" rel="noopener noreferrer" className="link link-external">
                    Ideas Medioambientales
                  </a>
                </p>
              </div>
              <div className="data-table-wrap rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                <table className="data-table">
                  <caption className="sr-only">Fuentes oficiales por módulo</caption>
                  <thead>
                    <tr>
                      <th scope="col">Fuente</th>
                      <th scope="col">Qué aporta</th>
                      <th scope="col">Módulo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {FUENTES.map((f) => (
                      <tr key={f.fuente}>
                        <td className="font-medium">{f.fuente}</td>
                        <td className="meta">{f.aporta}</td>
                        <td className="meta whitespace-nowrap">{f.modulo}</td>
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
