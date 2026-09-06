import type { Metadata } from "next";
import Link from "next/link";
import SocideasHeader from "@/components/platform/SocideasHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";
import EditorialParallaxHero from "@/components/ui/EditorialParallaxHero";
import TerritorialBackground from "@/components/ui/TerritorialBackground";
import PageShell from "@/components/ui/PageShell";
import SectionEyebrow from "@/components/ui/SectionEyebrow";
import SourcePill from "@/components/ui/SourcePill";

export const metadata: Metadata = {
  title: "Cómo funciona SOCideas",
  description:
    "Metodología, fuentes oficiales y arquitectura de consulta municipal de SOCideas: qué consulta el usuario, de dónde vienen los datos y cuáles son sus límites.",
};

const INDICE = [
  { id: "vision-general", label: "Visión general" },
  { id: "que-consulta-el-usuario", label: "Qué consulta el usuario" },
  { id: "arquitectura", label: "Arquitectura" },
  { id: "datos-y-fuentes", label: "Datos y fuentes" },
  { id: "flujo-de-datos", label: "Flujo de datos" },
  { id: "actualizacion-calidad", label: "Actualización y calidad" },
  { id: "cobertura-limitaciones", label: "Cobertura y limitaciones" },
  { id: "rendimiento", label: "Rendimiento" },
  { id: "privacidad-seguridad", label: "Privacidad y seguridad" },
  { id: "alcance-futuro", label: "Alcance futuro" },
];

function Callout({
  kind,
  title,
  children,
}: {
  kind: "principio" | "limitacion" | "trazabilidad";
  title: string;
  children: React.ReactNode;
}) {
  const bar =
    kind === "principio"
      ? "border-l-[var(--color-success)]"
      : kind === "limitacion"
        ? "border-l-[var(--color-warning)]"
        : "border-l-[var(--color-secondary)]";
  const tag =
    kind === "principio" ? "Principio" : kind === "limitacion" ? "Limitación" : "Trazabilidad";
  return (
    <div className={`premium-card my-5 border-l-4 ${bar} p-4 sm:p-5`} role="note" aria-label={`${tag}: ${title}`}>
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">{tag}</p>
      <p className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{title}</p>
      <div className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">{children}</div>
    </div>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-2xl">
      {children}
    </h2>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--color-text-secondary)] sm:text-base">{children}</p>;
}

export default function ComoFuncionaSocideas() {
  return (
    <div className="flex min-h-screen flex-col">
      <SocideasHeader />

      <main className="flex-1">
        <EditorialParallaxHero decor={<TerritorialBackground variant="grid" />}>
          <div className="mx-auto max-w-7xl px-4 pt-10 sm:px-6 sm:pt-14 lg:px-8 pb-10">
            <PageShell
              eyebrow="SOCideas · Datos y metodología"
              title="Cómo funciona SOCideas"
              lede="Metodología, fuentes oficiales y arquitectura de consulta municipal."
              meta={
                <SourcePill title="Demografía disponible con trazabilidad INE; economía en desarrollo por subbloques">
                  Demografía disponible · INE · Economía en desarrollo
                </SourcePill>
              }
            />
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/socideas"
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[var(--color-primary)] rounded-xl hover:bg-[var(--color-primary-light)] transition-all duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]"
              >
                Ir al buscador municipal
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </Link>
            </div>
          </div>
        </EditorialParallaxHero>

        <div className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-[240px_1fr] lg:gap-10">
            {/* Índice */}
            <nav aria-label="Índice de la página" className="lg:sticky lg:top-20 lg:self-start">
              <div className="premium-card p-4 lg:mt-8">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">Índice</p>
                <ol className="mt-2 flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
                  {INDICE.map((s, i) => (
                    <li key={s.id} className="shrink-0 lg:shrink">
                      <a
                        href={`#${s.id}`}
                        className="block whitespace-nowrap rounded-lg px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-input-bg)] hover:text-[var(--color-text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)] lg:whitespace-normal"
                      >
                        <span aria-hidden="true" className="mr-2 text-xs font-bold tabular-nums text-[var(--color-secondary)]/70">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        {s.label}
                      </a>
                    </li>
                  ))}
                </ol>
              </div>
            </nav>

            <article className="mt-8 min-w-0 lg:mt-8">
              {/* 1 */}
              <section id="vision-general" aria-labelledby="h-vision-general" className="scroll-mt-24">
                <SectionEyebrow>Visión general</SectionEyebrow>
                <h2 id="h-vision-general" className="editorial-display mt-2 text-2xl text-[var(--color-text-primary)] sm:text-3xl">
                  Una ficha por municipio, con fuente y periodo
                </h2>
                <P>
                  SOCideas permite consultar una ficha demográfica y económica por municipio a partir de
                  fuentes oficiales. Su propósito es apoyar la caracterización territorial y el análisis
                  técnico: cada indicador se presenta con su fuente, su periodo de referencia y su estado
                  de disponibilidad.
                </P>
                <P>
                  La ficha distingue siempre entre dato disponible, dato provisional, dato pendiente y dato
                  sin cobertura. Una ausencia de dato no equivale a cero: cuando un valor no puede publicarse
                  —por umbral de población, secreto estadístico o falta de cobertura—, se muestra como no
                  disponible con su nota metodológica.
                </P>
                <Callout kind="principio" title="Ausencia explícita, nunca cero inventado">
                  <p>
                    Los valores bajo secreto estadístico o fuera de cobertura se conservan como ausencia
                    con trazabilidad. Ningún proceso sustituye un valor no disponible por cero.
                  </p>
                </Callout>
              </section>

              {/* 2 */}
              <section id="que-consulta-el-usuario" aria-labelledby="h-que-consulta" className="mt-12 scroll-mt-24 border-t border-[var(--color-border-subtle)] pt-8">
                <SectionEyebrow>Uso</SectionEyebrow>
                <H2><span id="h-que-consulta">Qué consulta el usuario</span></H2>
                <P>
                  El punto de partida es el buscador municipal: selección de comunidad autónoma, provincia
                  y municipio, o búsqueda directa por nombre. Desde el resultado se accede a la ficha del
                  municipio, organizada en categorías.
                </P>
                <ul className="mt-4 max-w-3xl list-disc space-y-2 pl-5 text-sm leading-relaxed text-[var(--color-text-secondary)] sm:text-base">
                  <li>
                    <strong className="text-[var(--color-text-primary)]">Demografía</strong> (disponible):
                    población municipal, evolución anual y estructura por edad y sexo, con comparativas de
                    provincia, comunidad autónoma y conjunto nacional.
                  </li>
                  <li>
                    <strong className="text-[var(--color-text-primary)]">Economía</strong> (en desarrollo):
                    renta, desigualdad, tejido empresarial y sector agrario. Cada subbloque declara su
                    cobertura y su año de referencia; los subbloques sin cobertura se muestran como
                    pendientes, no como vacíos.
                  </li>
                  <li>
                    <strong className="text-[var(--color-text-primary)]">Secciones censales</strong> (en
                    preparación): divisiones estadísticas internas del municipio. La geometría oficial se
                    carga únicamente bajo demanda, y los indicadores por sección solo se incorporan cuando
                    existe una fuente oficial que los publique a ese nivel.
                  </li>
                </ul>
                <P>
                  Una vez cargada la información municipal, los filtros de la ficha —año de referencia,
                  ventana de evolución, año de pirámide y ámbitos de comparación— se aplican localmente
                  sobre los datos ya disponibles, sin nuevas consultas a las fuentes oficiales.
                </P>
              </section>

              {/* 3 */}
              <section id="arquitectura" aria-labelledby="h-arquitectura" className="mt-12 scroll-mt-24 border-t border-[var(--color-border-subtle)] pt-8">
                <SectionEyebrow>Arquitectura</SectionEyebrow>
                <H2><span id="h-arquitectura">De la fuente oficial a la ficha</span></H2>
                <P>
                  La arquitectura separa tres responsabilidades: la aplicación web que presenta la
                  navegación, la búsqueda y las fichas; el catálogo territorial y la trazabilidad que
                  respaldan la selección de municipios y la referencia de cada dato; y los documentos
                  municipales estructurados que contienen el bloque principal de indicadores.
                </P>
                <figure className="premium-card mt-5 max-w-3xl p-4 sm:p-5" aria-labelledby="fig-arquitectura">
                  <figcaption id="fig-arquitectura" className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                    Diagrama de arquitectura
                  </figcaption>
                  <p className="sr-only">
                    El usuario consulta la aplicación web; la aplicación se apoya en el catálogo
                    territorial y la trazabilidad; estos se alimentan de documentos municipales
                    estructurados; y estos, de las fuentes oficiales, que se descargan, validan y
                    normalizan antes de publicarse.
                  </p>
                  <ol aria-hidden="false" className="mt-3 space-y-1 text-sm font-medium text-[var(--color-text-primary)]">
                    {[
                      "Usuario: busca y consulta fichas municipales",
                      "Aplicación web: navegación, búsqueda y fichas",
                      "Catálogo territorial y trazabilidad: municipios, fuentes, periodos y estados",
                      "Datos municipales estructurados: bloque principal de indicadores",
                      "Fuentes oficiales: descarga, validación y normalización previas a la publicación",
                    ].map((paso, i, arr) => (
                      <li key={paso}>
                        <span className="flex items-center gap-3 rounded-lg bg-[var(--color-input-bg)] px-3 py-2.5">
                          <span aria-hidden="true" className="text-xs font-bold tabular-nums text-[var(--color-secondary)]">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          {paso}
                        </span>
                        {i < arr.length - 1 && (
                          <span aria-hidden="true" className="block py-0.5 text-center text-[var(--color-text-muted)]">↓</span>
                        )}
                      </li>
                    ))}
                  </ol>
                </figure>
                <ul className="mt-4 max-w-3xl list-disc space-y-2 pl-5 text-sm leading-relaxed text-[var(--color-text-secondary)] sm:text-base">
                  <li>La aplicación y el renderizado se sirven sobre una arquitectura web moderna (Next.js).</li>
                  <li>Los documentos municipales de gran volumen se almacenan como objetos para consulta repetida.</li>
                  <li>El catálogo territorial y la trazabilidad residen en una base de datos relacional.</li>
                  <li>Las fuentes oficiales se descargan, validan y normalizan antes de publicarse.</li>
                  <li>Las operaciones de actualización están protegidas y no existen como función pública de consulta.</li>
                </ul>
                <Callout kind="trazabilidad" title="Cada indicador conserva su referencia">
                  <p>
                    Fuente, bloque, periodo de referencia y estado (consolidado o provisional) viajan con
                    el dato desde su incorporación hasta su visualización en la ficha.
                  </p>
                </Callout>
              </section>

              {/* 4 */}
              <section id="datos-y-fuentes" aria-labelledby="h-datos" className="mt-12 scroll-mt-24 border-t border-[var(--color-border-subtle)] pt-8">
                <SectionEyebrow>Datos y fuentes</SectionEyebrow>
                <h2 id="fuentes" className="text-xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-2xl">
                  <span id="h-datos">Fuentes oficiales, cobertura y estado</span>
                </h2>
                <P>
                  Cada fuente se incorpora solo tras verificar su cobertura municipal real. La tabla resume
                  el estado a fecha de redacción: lo disponible, lo que está en preparación técnica y lo
                  que permanece pendiente o sin cobertura.
                </P>
                <div className="mt-5 overflow-x-auto rounded-xl border border-[var(--color-border-subtle)]">
                  <table className="ideas-table min-w-[880px] bg-[var(--color-card-bg)] p-4">
                    <caption className="sr-only">Fuentes oficiales de SOCideas con cobertura, periodo y estado</caption>
                    <thead>
                      <tr>
                        <th scope="col">Bloque</th>
                        <th scope="col">Indicadores</th>
                        <th scope="col">Fuente oficial</th>
                        <th scope="col">Periodicidad</th>
                        <th scope="col">Cobertura</th>
                        <th scope="col">Periodo disponible</th>
                        <th scope="col">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Demografía</td>
                        <td>Población, evolución anual, estructura por edad y sexo</td>
                        <td>INE</td>
                        <td>Anual</td>
                        <td>Todos los municipios; comparativas de provincia, comunidad y Estado</td>
                        <td>Serie anual disponible por municipio</td>
                        <td>Disponible</td>
                      </tr>
                      <tr>
                        <td>Renta de los hogares</td>
                        <td>Renta neta y bruta media por persona y hogar; Gini; P80/P20</td>
                        <td>INE · Atlas de Distribución de Renta de los Hogares</td>
                        <td>Anual</td>
                        <td>Rentas medias en todos los municipios; desigualdad solo en municipios de 100 o más residentes</td>
                        <td>2023 (serie 2015–2023)</td>
                        <td>En preparación</td>
                      </tr>
                      <tr>
                        <td>Renta por declaración</td>
                        <td>Número de declaraciones; renta bruta y disponible media por declaración</td>
                        <td>AEAT · Estadística de declarantes del IRPF por municipios</td>
                        <td>Anual</td>
                        <td>Municipios de más de 1.000 habitantes en territorio fiscal común (excluye País Vasco y Navarra)</td>
                        <td>2023</td>
                        <td>En preparación</td>
                      </tr>
                      <tr>
                        <td>Tejido empresarial</td>
                        <td>Número de empresas total y por sector</td>
                        <td>INE · DIRCE</td>
                        <td>Anual</td>
                        <td>Total en todos los municipios; desglose por sector según tamaño del municipio</td>
                        <td>2025 (referencia 1 de enero)</td>
                        <td>En preparación</td>
                      </tr>
                      <tr>
                        <td>Estructura agraria y ganadería</td>
                        <td>Superficie agraria, explotaciones y cabaña ganadera</td>
                        <td>INE · Censo Agrario 2020</td>
                        <td>Estructural</td>
                        <td>Todos los municipios, con umbral de explotación y secreto estadístico</td>
                        <td>2020</td>
                        <td>Disponible parcial</td>
                      </tr>
                      <tr>
                        <td>Empleo registrado</td>
                        <td>Paro registrado por municipio</td>
                        <td>SEPE</td>
                        <td>Mensual</td>
                        <td>Todos los municipios</td>
                        <td>—</td>
                        <td>Pendiente</td>
                      </tr>
                      <tr>
                        <td>Afiliación</td>
                        <td>Afiliación a la Seguridad Social por municipio</td>
                        <td>TGSS / Seguridad Social</td>
                        <td>Mensual</td>
                        <td>Todos los municipios, con secreto estadístico</td>
                        <td>—</td>
                        <td>Pendiente</td>
                      </tr>
                      <tr>
                        <td>Finanzas locales y ayudas</td>
                        <td>Presupuestos, liquidaciones y subvenciones</td>
                        <td>Ministerio de Hacienda y otras</td>
                        <td>Variable</td>
                        <td>Heterogénea, sin fuente nacional homogénea verificada</td>
                        <td>—</td>
                        <td>Pendiente</td>
                      </tr>
                      <tr>
                        <td>Precios</td>
                        <td>IPC municipal homogéneo</td>
                        <td>—</td>
                        <td>—</td>
                        <td>Sin cobertura: no existe un IPC municipal homogéneo</td>
                        <td>—</td>
                        <td>Sin cobertura</td>
                      </tr>
                      <tr>
                        <td>Secciones censales</td>
                        <td>Geometría e indicadores por sección</td>
                        <td>INE</td>
                        <td>Según operación</td>
                        <td>Geometría oficial bajo demanda; indicadores solo con fuente a ese nivel</td>
                        <td>—</td>
                        <td>En preparación</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <Callout kind="limitacion" title="Renta por declaración no es renta por habitante">
                  <p>
                    Los importes medios por declaración de la AEAT dependen de la tributación individual o
                    conjunta y no equivalen a la renta por habitante ni por hogar del Atlas del INE. Ambas
                    familias se presentan por separado y nunca se mezclan.
                  </p>
                </Callout>
                <Callout kind="limitacion" title="Rezagos de publicación">
                  <p>
                    Las estadísticas oficiales se publican con retraso natural: la renta y las empresas
                    pueden referirse a uno o dos años anteriores. Cada indicador muestra siempre su año de
                    referencia para evitar lecturas anacrónicas.
                  </p>
                </Callout>
              </section>

              {/* 5 */}
              <section id="flujo-de-datos" aria-labelledby="h-flujo" className="mt-12 scroll-mt-24 border-t border-[var(--color-border-subtle)] pt-8">
                <SectionEyebrow>Flujo de datos</SectionEyebrow>
                <H2><span id="h-flujo">De la descarga controlada a la ficha</span></H2>
                <ol className="mt-4 max-w-3xl space-y-2 text-sm leading-relaxed text-[var(--color-text-secondary)] sm:text-base">
                  {[
                    "Fuente oficial: publicación del organismo estadístico.",
                    "Descarga controlada: obtención del fichero o tabla correspondiente al periodo.",
                    "Validación de periodo, código municipal, formato, rango y cobertura.",
                    "Normalización: unidades, dimensiones y trazabilidad homogéneas.",
                    "Documento municipal: el bloque actualizado se integra en el documento del municipio.",
                    "Ficha SOCideas: presentación con fuente, periodo y estado.",
                  ].map((paso, i) => (
                    <li key={paso} className="flex gap-3">
                      <span aria-hidden="true" className="text-xs font-bold tabular-nums text-[var(--color-secondary)] mt-1">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span>{paso}</span>
                    </li>
                  ))}
                </ol>
                <ul className="mt-4 max-w-3xl list-disc space-y-2 pl-5 text-sm leading-relaxed text-[var(--color-text-secondary)] sm:text-base">
                  <li>El código INE de cinco dígitos es la clave municipal en todo el flujo.</li>
                  <li>Se diferencia siempre entre dato consolidado y dato provisional: un provisional no sustituye al consolidado.</li>
                  <li>Cada indicador conserva su fuente y su fecha de referencia.</li>
                  <li>Las actualizaciones se limitan al bloque correspondiente del municipio y no sustituyen sin control otros bloques de la ficha.</li>
                  <li>Tras una actualización autorizada, los documentos se revalidan de forma selectiva.</li>
                </ul>
              </section>

              {/* 6 */}
              <section id="actualizacion-calidad" aria-labelledby="h-actualizacion" className="mt-12 scroll-mt-24 border-t border-[var(--color-border-subtle)] pt-8">
                <SectionEyebrow>Actualización y calidad</SectionEyebrow>
                <H2><span id="h-actualizacion">Actualización y controles de calidad</span></H2>
                <P>
                  Cada fuente tiene su propia periodicidad —anual la demografía y la renta, mensual el
                  empleo cuando se incorpore, estructural el censo agrario—, por lo que la ficha combina
                  periodos distintos según el bloque. Antes de publicar, cada lote supera controles de
                  plausibilidad: códigos INE válidos, periodos coherentes, valores no negativos cuando
                  corresponda, rentas positivas e índices dentro de rango.
                </P>
                <P>
                  El secreto estadístico recibe un tratamiento estricto: los valores inferiores al umbral
                  de publicación se muestran como no disponibles con su nota metodológica y nunca se
                  sustituyen por cero. La trazabilidad de cada valor —fuente, bloque, fecha de referencia
                  y estado consolidado o provisional— permite auditar qué hay detrás de cada cifra.
                </P>
                <P>
                  Cuando está autorizada, la actualización de un municipio es focalizada: afecta solo a su
                  ficha y a los bloques implicados. Si la interfaz informa de la falta de un valor
                  provisional, muestra la ausencia; jamás fabrica un valor provisional.
                </P>
              </section>

              {/* 7 */}
              <section id="cobertura-limitaciones" aria-labelledby="h-cobertura" className="mt-12 scroll-mt-24 border-t border-[var(--color-border-subtle)] pt-8">
                <SectionEyebrow>Cobertura y limitaciones</SectionEyebrow>
                <H2><span id="h-cobertura">Lo que SOCideas no puede prometer</span></H2>
                <ul className="mt-4 max-w-3xl list-disc space-y-2 pl-5 text-sm leading-relaxed text-[var(--color-text-secondary)] sm:text-base">
                  <li>Las estadísticas oficiales tienen un rezago natural de uno o más años.</li>
                  <li>La cobertura es desigual por fuente y tamaño de municipio: no todo indicador existe para los 8.130 municipios.</li>
                  <li>Municipio, provincia, comunidad autónoma y sección censal son niveles distintos con fuentes distintas; sus cifras no siempre son comparables entre sí.</li>
                  <li>Los umbrales de secreto estadístico dejan huecos explícitos en municipios pequeños.</li>
                  <li>La ausencia de datos es una ausencia explícita, nunca un cero.</li>
                  <li>Los datos consolidados y los provisionales conviven identificados; no deben leerse como equivalentes.</li>
                  <li>Las secciones censales se cargan bajo demanda por su peso y por la disponibilidad de geometría.</li>
                </ul>
                <Callout kind="limitacion" title="Apoyo técnico, no verificación normativa">
                  <p>
                    Los resultados apoyan el análisis técnico, pero no sustituyen una verificación
                    normativa, jurídica, estadística o territorial específica del caso.
                  </p>
                </Callout>
              </section>

              {/* 8 */}
              <section id="rendimiento" aria-labelledby="h-rendimiento" className="mt-12 scroll-mt-24 border-t border-[var(--color-border-subtle)] pt-8">
                <SectionEyebrow>Rendimiento</SectionEyebrow>
                <H2><span id="h-rendimiento">Rápido porque prepara, no porque improvisa</span></H2>
                <ul className="mt-4 max-w-3xl list-disc space-y-2 pl-5 text-sm leading-relaxed text-[var(--color-text-secondary)] sm:text-base">
                  <li>El catálogo municipal está optimizado para la consulta repetida.</li>
                  <li>La ficha utiliza el documento municipal ya estructurado y una caché selectiva.</li>
                  <li>Los datos pesados, como la geometría de secciones censales, se cargan únicamente cuando se solicitan.</li>
                  <li>La actualización de un municipio invalida solo la ficha afectada.</li>
                </ul>
              </section>

              {/* 9 */}
              <section id="privacidad-seguridad" aria-labelledby="h-privacidad" className="mt-12 scroll-mt-24 border-t border-[var(--color-border-subtle)] pt-8">
                <SectionEyebrow>Privacidad y seguridad</SectionEyebrow>
                <H2><span id="h-privacidad">Estadística agregada y funciones separadas</span></H2>
                <ul className="mt-4 max-w-3xl list-disc space-y-2 pl-5 text-sm leading-relaxed text-[var(--color-text-secondary)] sm:text-base">
                  <li>SOCideas se basa en estadísticas públicas y agregadas; no está diseñado para mostrar datos personales.</li>
                  <li>Las funciones internas de mantenimiento están protegidas y separadas de la consulta pública.</li>
                  <li>Las credenciales y los mecanismos internos no se exponen al navegador.</li>
                  <li>El acceso de consulta está separado de los procesos de actualización.</li>
                  <li>La trazabilidad contiene referencias metodológicas, nunca datos sensibles.</li>
                </ul>
              </section>

              {/* 10 */}
              <section id="alcance-futuro" aria-labelledby="h-alcance" className="mt-12 scroll-mt-24 border-t border-[var(--color-border-subtle)] pt-8">
                <SectionEyebrow>Alcance futuro</SectionEyebrow>
                <H2><span id="h-alcance">Hoja de ruta prudente</span></H2>
                <P>Sin fechas y sin llamar «disponible» a nada que no esté publicado:</P>
                <div className="mt-4 grid max-w-4xl gap-4 sm:grid-cols-3">
                  <div className="premium-card p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">En evaluación</p>
                    <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                      <li>Ampliación de indicadores económicos</li>
                      <li>Mejor diferenciación de datos provisionales</li>
                      <li>Nuevas capas territoriales con cobertura y revisión metodológica</li>
                    </ul>
                  </div>
                  <div className="premium-card p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">Preparado técnicamente</p>
                    <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                      <li>Conectores de empleo registrado y afiliación</li>
                      <li>Actualizaciones focalizadas autorizadas por municipio</li>
                    </ul>
                  </div>
                  <div className="premium-card p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">Futuro</p>
                    <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                      <li>Mejora de visualizaciones y comparativas</li>
                      <li>Finanzas locales y ayudas con fuente homogénea</li>
                    </ul>
                  </div>
                </div>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link
                    href="/socideas"
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[var(--color-primary)] rounded-xl hover:bg-[var(--color-primary-light)] transition-all duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]"
                  >
                    Ir al buscador municipal
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </Link>
                  <Link
                    href="/"
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-[var(--color-text-secondary)] bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-xl hover:text-[var(--color-text-primary)] transition-all duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]"
                  >
                    Volver a la plataforma
                  </Link>
                </div>
              </section>
            </article>
          </div>
        </div>
      </main>

      <PlatformFooter />
    </div>
  );
}
