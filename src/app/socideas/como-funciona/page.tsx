import type { Metadata } from "next";
import Link from "next/link";
import SocideasHeader from "@/components/platform/SocideasHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";
import PageShell from "@/components/ui/PageShell";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import Badge from "@/components/ui/Badge";

export const metadata: Metadata = {
  title: "Cómo funciona SOCideas",
  description:
    "Metodología, fuentes oficiales y arquitectura de consulta municipal de SOCideas: qué consulta el usuario, de dónde vienen los datos y cuáles son sus límites.",
};

// Anclas estables: #fuentes y #actualizacion-calidad se enlazan desde la navegación.
const INDICE = [
  { id: "vision-general", label: "Visión general" },
  { id: "que-consulta-el-usuario", label: "Qué consulta el usuario" },
  { id: "arquitectura", label: "Arquitectura" },
  { id: "fuentes", label: "Fuentes y cobertura" },
  { id: "flujo-de-datos", label: "Flujo de datos" },
  { id: "herramientas-de-consulta", label: "Herramientas de consulta" },
  { id: "descargas", label: "Descargas" },
  { id: "actualizacion-y-control", label: "Actualización y control" },
  { id: "actualizacion-calidad", label: "Controles de calidad" },
  { id: "cobertura-limitaciones", label: "Cobertura y limitaciones" },
  { id: "rendimiento", label: "Rendimiento" },
  { id: "privacidad-seguridad", label: "Privacidad y seguridad" },
  { id: "alcance-futuro", label: "Alcance futuro" },
];

type Estado = "Disponible" | "Disponible parcial" | "En preparación" | "Pendiente" | "Sin cobertura";

const ESTADO_BADGE: Record<Estado, "success" | "secondary" | "primary" | "muted"> = {
  Disponible: "success",
  "Disponible parcial": "secondary",
  "En preparación": "primary",
  Pendiente: "muted",
  "Sin cobertura": "muted",
};

const FUENTES: {
  bloque: string;
  indicadores: string;
  fuente: string;
  periodicidad: string;
  cobertura: string;
  periodo: string;
  estado: Estado;
}[] = [
  {
    bloque: "Demografía",
    indicadores: "Población, evolución anual, estructura por edad y sexo",
    fuente: "INE",
    periodicidad: "Anual",
    cobertura: "Todos los municipios; comparativas de provincia, comunidad y Estado",
    periodo: "Serie anual disponible por municipio",
    estado: "Disponible",
  },
  {
    bloque: "Renta de los hogares",
    indicadores: "Renta neta y bruta media por persona y hogar; Gini; P80/P20",
    fuente: "INE, Atlas de Distribución de Renta de los Hogares",
    periodicidad: "Anual",
    cobertura: "Rentas medias en todos los municipios; desigualdad solo en municipios de 100 o más residentes",
    periodo: "2023 (serie 2015–2023)",
    estado: "En preparación",
  },
  {
    bloque: "Renta por declaración",
    indicadores: "Número de declaraciones; renta bruta y disponible media por declaración",
    fuente: "AEAT, Estadística de declarantes del IRPF por municipios",
    periodicidad: "Anual",
    cobertura: "Municipios de más de 1.000 habitantes en territorio fiscal común (excluye País Vasco y Navarra)",
    periodo: "2023",
    estado: "En preparación",
  },
  {
    bloque: "Tejido empresarial",
    indicadores: "Número de empresas total y por sector",
    fuente: "INE, DIRCE",
    periodicidad: "Anual",
    cobertura: "Total en todos los municipios; desglose por sector según tamaño del municipio",
    periodo: "2025 (referencia 1 de enero)",
    estado: "En preparación",
  },
  {
    bloque: "Estructura agraria y ganadería",
    indicadores: "Superficie agraria, explotaciones y cabaña ganadera",
    fuente: "INE, Censo Agrario 2020",
    periodicidad: "Estructural",
    cobertura: "Todos los municipios, con umbral de explotación y secreto estadístico",
    periodo: "2020",
    estado: "Disponible parcial",
  },
  {
    bloque: "Empleo registrado",
    indicadores: "Paro registrado por municipio",
    fuente: "SEPE",
    periodicidad: "Mensual",
    cobertura: "Todos los municipios",
    periodo: "—",
    estado: "Pendiente",
  },
  {
    bloque: "Afiliación",
    indicadores: "Afiliación a la Seguridad Social por municipio",
    fuente: "TGSS / Seguridad Social",
    periodicidad: "Mensual",
    cobertura: "Todos los municipios, con secreto estadístico",
    periodo: "—",
    estado: "Pendiente",
  },
  {
    bloque: "Finanzas locales y ayudas",
    indicadores: "Presupuestos, liquidaciones y subvenciones",
    fuente: "Ministerio de Hacienda y otras",
    periodicidad: "Variable",
    cobertura: "Heterogénea, sin fuente nacional homogénea verificada",
    periodo: "—",
    estado: "Pendiente",
  },
  {
    bloque: "Precios",
    indicadores: "IPC municipal homogéneo",
    fuente: "—",
    periodicidad: "—",
    cobertura: "Sin cobertura: no existe un IPC municipal homogéneo",
    periodo: "—",
    estado: "Sin cobertura",
  },
  {
    bloque: "Secciones censales",
    indicadores: "Geometría e indicadores por sección",
    fuente: "INE",
    periodicidad: "Según operación",
    cobertura: "Geometría oficial bajo demanda; indicadores solo con fuente a ese nivel",
    periodo: "—",
    estado: "En preparación",
  },
];

const CAPAS = [
  { nombre: "Usuario", texto: "Busca y consulta fichas municipales." },
  { nombre: "Aplicación web", texto: "Navegación, búsqueda y fichas." },
  { nombre: "Catálogo territorial y trazabilidad", texto: "Municipios, fuentes, periodos y estados." },
  { nombre: "Datos municipales estructurados", texto: "Bloque principal de indicadores." },
  { nombre: "Fuentes oficiales", texto: "Descarga, validación y normalización previas a la publicación." },
];

const FLUJO = [
  { titulo: "Fuente oficial", texto: "Publicación del organismo estadístico." },
  { titulo: "Descarga controlada", texto: "Obtención del fichero o tabla correspondiente al periodo." },
  { titulo: "Validación", texto: "Periodo, código municipal, formato, rango y cobertura." },
  { titulo: "Normalización", texto: "Unidades, dimensiones y trazabilidad homogéneas." },
  { titulo: "Documento municipal", texto: "El bloque actualizado se integra en el documento del municipio." },
  { titulo: "Ficha SOCideas", texto: "Presentación con fuente, periodo y estado." },
];

const HOJA_DE_RUTA = [
  {
    fase: "En evaluación",
    items: [
      "Ampliación de indicadores económicos",
      "Mejor diferenciación de datos provisionales",
      "Nuevas capas territoriales con cobertura y revisión metodológica",
    ],
  },
  {
    fase: "Preparado técnicamente",
    items: ["Conectores de empleo registrado y afiliación", "Actualizaciones focalizadas autorizadas por municipio"],
  },
  {
    fase: "Futuro",
    items: ["Mejora de visualizaciones y comparativas", "Finanzas locales y ayudas con fuente homogénea"],
  },
];

function Nota({
  kind,
  title,
  children,
}: {
  kind: "principio" | "limitacion" | "trazabilidad";
  title: string;
  children: React.ReactNode;
}) {
  const tag = kind === "principio" ? "Principio" : kind === "limitacion" ? "Limitación" : "Trazabilidad";
  return (
    <div className="note my-6 max-w-[68ch]" role="note" aria-label={`${tag}: ${title}`}>
      <p className="font-semibold text-[var(--text-primary)]">
        {tag}: {title}
      </p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Seccion({
  id,
  headingId,
  title,
  first = false,
  children,
}: {
  id: string;
  headingId: string;
  title: string;
  first?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={[
        "scroll-mt-24",
        first ? "" : "mt-14 border-t border-[var(--border-subtle)] pt-10",
      ].join(" ")}
    >
      <h2 id={headingId} className="type-h2 max-w-[32ch] scroll-mt-24 text-[var(--text-primary)]">
        {title}
      </h2>
      {children}
    </section>
  );
}

function IndiceLista() {
  return (
    <ol>
      {INDICE.map((s) => (
        <li key={s.id}>
          <a
            href={`#${s.id}`}
            className="flex min-h-11 items-center text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] focus-visible:rounded-[6px] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none lg:-ml-px lg:min-h-0 lg:border-l-2 lg:border-transparent lg:py-1.5 lg:pl-3 lg:hover:border-[var(--border-strong)]"
          >
            {s.label}
          </a>
        </li>
      ))}
    </ol>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="type-body mt-4 max-w-[68ch] text-[var(--text-secondary)]">{children}</p>;
}

function Lista({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="type-body mt-4 max-w-[68ch] list-disc space-y-2 pl-5 text-[var(--text-secondary)] marker:text-[var(--border-strong)]">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export default function ComoFuncionaSocideas() {
  return (
    <div className="flex min-h-screen flex-col">
      <SocideasHeader />

      <main id="contenido" className="flex-1">
        <div className="container-ima pb-16">
          <PageShell
            breadcrumbs={
              <Breadcrumbs
                items={[
                  { label: "SOCideas", href: "/" },
                  { label: "Cómo funciona" },
                ]}
              />
            }
            title="Cómo funciona SOCideas"
            lede="Metodología, fuentes oficiales y arquitectura de la consulta municipal: qué se consulta, de dónde vienen los datos y cuáles son sus límites."
            meta={
              <>
                <Badge variant="success" dot>
                  Demografía disponible (INE)
                </Badge>
                <Badge variant="primary">Economía en desarrollo por subbloques</Badge>
              </>
            }
            actions={
              <Link href="/" className="btn btn-primary">
                Consultar un municipio
              </Link>
            }
          />

          <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-14">
            {/* Índice: plegable en móvil, fijo en escritorio. */}
            <details className="mb-10 rounded-[6px] border border-[var(--border-subtle)] lg:hidden">
              <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-medium text-[var(--text-primary)] focus-visible:rounded-[6px] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none">
                En esta página
              </summary>
              <nav aria-label="Índice de la página" className="border-t border-[var(--border-subtle)] px-4 py-2">
                <IndiceLista />
              </nav>
            </details>
            <nav aria-label="Índice de la página" className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
              <p className="type-label text-[var(--text-muted)]">En esta página</p>
              <div className="mt-3 border-l border-[var(--border-subtle)]">
                <IndiceLista />
              </div>
            </nav>

            <article className="min-w-0">
              <Seccion id="vision-general" headingId="h-vision-general" title="Una ficha por municipio, con fuente y periodo" first>
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
                <Nota kind="principio" title="ausencia explícita, nunca cero inventado">
                  <p>
                    Los valores bajo secreto estadístico o fuera de cobertura se conservan como ausencia
                    con trazabilidad. Ningún proceso sustituye un valor no disponible por cero.
                  </p>
                </Nota>
              </Seccion>

              <Seccion id="que-consulta-el-usuario" headingId="h-que-consulta" title="Qué consulta el usuario">
                <P>
                  El punto de partida es el buscador municipal: selección de comunidad autónoma, provincia
                  y municipio, o búsqueda directa por nombre. Desde el resultado se accede a la ficha del
                  municipio, organizada en categorías.
                </P>
                <dl className="mt-6 max-w-[68ch] border-t border-[var(--border-strong)]">
                  {[
                    {
                      nombre: "Demografía",
                      estado: <Badge variant="success">Disponible</Badge>,
                      texto:
                        "Población municipal, evolución anual y estructura por edad y sexo, con comparativas de provincia, comunidad autónoma y conjunto nacional.",
                    },
                    {
                      nombre: "Economía",
                      estado: <Badge variant="primary">En desarrollo</Badge>,
                      texto:
                        "Renta, desigualdad, tejido empresarial y sector agrario. Cada subbloque declara su cobertura y su año de referencia; los subbloques sin cobertura se muestran como pendientes, no como vacíos.",
                    },
                    {
                      nombre: "Secciones censales",
                      estado: <Badge variant="primary">En preparación</Badge>,
                      texto:
                        "Divisiones estadísticas internas del municipio. La geometría oficial se carga únicamente bajo demanda, y los indicadores por sección solo se incorporan cuando existe una fuente oficial que los publique a ese nivel.",
                    },
                  ].map((c) => (
                    <div key={c.nombre} className="border-b border-[var(--border-subtle)] py-4">
                      <dt className="flex flex-wrap items-center gap-3">
                        <span className="type-h4 text-[var(--text-primary)]">{c.nombre}</span>
                        {c.estado}
                      </dt>
                      <dd className="type-body-sm mt-2 text-[var(--text-secondary)]">{c.texto}</dd>
                    </div>
                  ))}
                </dl>
                <P>
                  Una vez cargada la información municipal, los filtros de la ficha —año de referencia,
                  ventana de evolución, año de pirámide y ámbitos de comparación— se aplican localmente
                  sobre los datos ya disponibles, sin nuevas consultas a las fuentes oficiales.
                </P>
              </Seccion>

              <Seccion id="arquitectura" headingId="h-arquitectura" title="De la fuente oficial a la ficha">
                <P>
                  La arquitectura separa tres responsabilidades: la aplicación web que presenta la
                  navegación, la búsqueda y las fichas; el catálogo territorial y la trazabilidad que
                  respaldan la selección de municipios y la referencia de cada dato; y los documentos
                  municipales estructurados que contienen el bloque principal de indicadores.
                </P>
                <figure className="mt-6 max-w-[68ch]" aria-labelledby="fig-arquitectura">
                  <figcaption id="fig-arquitectura" className="type-label text-[var(--text-muted)]">
                    Capas de la arquitectura, de la consulta a la fuente
                  </figcaption>
                  <p className="sr-only">
                    El usuario consulta la aplicación web; la aplicación se apoya en el catálogo
                    territorial y la trazabilidad; estos se alimentan de documentos municipales
                    estructurados; y estos, de las fuentes oficiales, que se descargan, validan y
                    normalizan antes de publicarse.
                  </p>
                  <ol className="mt-3 border-l-2 border-[var(--border-strong)]">
                    {CAPAS.map((capa, i) => (
                      <li
                        key={capa.nombre}
                        className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-4 gap-y-1 border-b border-[var(--border-subtle)] py-3 pl-4 last:border-b-0 sm:grid-cols-[1.5rem_16rem_minmax(0,1fr)]"
                      >
                        <span aria-hidden="true" className="tnum type-body-sm text-[var(--text-muted)]">
                          {i + 1}
                        </span>
                        <span className="text-sm font-semibold text-[var(--text-primary)]">{capa.nombre}</span>
                        <span className="type-body-sm col-start-2 text-[var(--text-secondary)] sm:col-start-3">{capa.texto}</span>
                      </li>
                    ))}
                  </ol>
                </figure>
                <Lista
                  items={[
                    "La aplicación y el renderizado se sirven sobre una arquitectura web moderna (Next.js).",
                    "Los documentos municipales de gran volumen se almacenan como objetos para consulta repetida.",
                    "El catálogo territorial y la trazabilidad residen en una base de datos relacional.",
                    "Las fuentes oficiales se descargan, validan y normalizan antes de publicarse.",
                    "Las operaciones de actualización están protegidas y no existen como función pública de consulta.",
                  ]}
                />
                <Nota kind="trazabilidad" title="cada indicador conserva su referencia">
                  <p>
                    Fuente, bloque, periodo de referencia y estado (consolidado o provisional) viajan con
                    el dato desde su incorporación hasta su visualización en la ficha.
                  </p>
                </Nota>
              </Seccion>

              {/* #datos-y-fuentes se conserva como ancla de compatibilidad. */}
              <section id="datos-y-fuentes" aria-labelledby="fuentes" className="mt-14 scroll-mt-24 border-t border-[var(--border-subtle)] pt-10">
                <h2 id="fuentes" className="type-h2 max-w-[32ch] scroll-mt-24 text-[var(--text-primary)]">
                  <span id="h-datos">Fuentes oficiales, cobertura y estado</span>
                </h2>
                <P>
                  Cada fuente se incorpora solo tras verificar su cobertura municipal real. La tabla resume
                  el estado a fecha de redacción: lo disponible, lo que está en preparación técnica y lo
                  que permanece pendiente o sin cobertura.
                </P>
                <div
                  className="data-table-wrap mt-6 rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
                  role="region"
                  aria-label="Tabla de fuentes oficiales (desplazable)"
                  tabIndex={0}
                >
                  <table className="data-table min-w-[880px]">
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
                      {FUENTES.map((f) => (
                        <tr key={f.bloque} className="align-top">
                          <td className="py-3 font-semibold">{f.bloque}</td>
                          <td className="py-3">{f.indicadores}</td>
                          <td className="meta py-3">{f.fuente}</td>
                          <td className="meta py-3">{f.periodicidad}</td>
                          <td className="meta py-3">{f.cobertura}</td>
                          <td className="meta tnum py-3">{f.periodo}</td>
                          <td className="py-3">
                            <Badge variant={ESTADO_BADGE[f.estado]}>{f.estado}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Nota kind="limitacion" title="renta por declaración no es renta por habitante">
                  <p>
                    Los importes medios por declaración de la AEAT dependen de la tributación individual o
                    conjunta y no equivalen a la renta por habitante ni por hogar del Atlas del INE. Ambas
                    familias se presentan por separado y nunca se mezclan.
                  </p>
                </Nota>
                <Nota kind="limitacion" title="rezagos de publicación">
                  <p>
                    Las estadísticas oficiales se publican con retraso natural: la renta y las empresas
                    pueden referirse a uno o dos años anteriores. Cada indicador muestra siempre su año de
                    referencia para evitar lecturas anacrónicas.
                  </p>
                </Nota>
              </section>

              <Seccion id="flujo-de-datos" headingId="h-flujo" title="De la descarga controlada a la ficha">
                <ol className="mt-6 max-w-[68ch] border-t border-[var(--border-strong)]">
                  {FLUJO.map((paso, i) => (
                    <li
                      key={paso.titulo}
                      className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 border-b border-[var(--border-subtle)] py-3"
                    >
                      <span aria-hidden="true" className="tnum text-sm font-semibold text-[var(--moss-ink)]">
                        {i + 1}
                      </span>
                      <p className="type-body-sm text-[var(--text-secondary)]">
                        <span className="font-semibold text-[var(--text-primary)]">{paso.titulo}.</span> {paso.texto}
                      </p>
                    </li>
                  ))}
                </ol>
                <Lista
                  items={[
                    "El código INE de cinco dígitos es la clave municipal en todo el flujo.",
                    "Se diferencia siempre entre dato consolidado y dato provisional: un provisional no sustituye al consolidado.",
                    "Cada indicador conserva su fuente y su fecha de referencia.",
                    "Las actualizaciones se limitan al bloque correspondiente del municipio y no sustituyen sin control otros bloques de la ficha.",
                    "Tras una actualización autorizada, los documentos se revalidan de forma selectiva.",
                  ]}
                />
              </Seccion>

              <Seccion id="herramientas-de-consulta" headingId="h-herramientas" title="Herramientas de consulta">
                <P>
                  La ficha permite revisar los datos disponibles por bloque. Los filtros actúan sobre la
                  información ya cargada, sin nuevas consultas a las fuentes oficiales. Las comparativas
                  —por nivel territorial o por periodo— solo se muestran cuando hay cobertura y periodos
                  compatibles; en caso contrario la herramienta se oculta o indica «No comparable».
                </P>
                <Lista
                  items={[
                    "Selector de nivel territorial (municipio, provincia, comunidad autónoma, España) solo con niveles y periodos homogéneos.",
                    "Comparador de periodos con variación absoluta y porcentual, con años exactos.",
                    "Filtros de tabla (búsqueda, año, restablecer) sobre datos ya cargados, accesibles con teclado.",
                    "Vista de metodología «Ver definición y fuente» con definición, fuente, periodo, cobertura, estado y limitación.",
                    "Copia de tabla visible con encabezados, fuente y periodo.",
                    "Enlace «Consultar fuente oficial» solo cuando existe una URL pública verificada.",
                  ]}
                />
                <P>
                  La ausencia de un dato se comunica como ausencia, no como cero. La trazabilidad indica
                  fuente, periodo y cobertura de cada valor.
                </P>
              </Seccion>

              <Seccion id="descargas" headingId="h-descargas" title="Descargas">
                <P>
                  Demografía y Economía disponen de páginas separadas de tablas, contextuales al municipio
                  (con su código INE en la URL). Solo se incluyen indicadores disponibles; cada exportación
                  incorpora fuente, periodo y limitaciones. Las tablas no cubiertas se documentan en la hoja
                  de trazabilidad, pero no se rellenan con valores.
                </P>
                <Lista
                  items={[
                    "Libro XLSX combinado por municipio (acceso principal desde la cabecera de la ficha): hojas de resumen con trazabilidad, demografía y economía, solo con tablas reales y estética corporativa.",
                    "CSV individual por tabla (UTF-8 con BOM, separador compatible con Excel español).",
                    "Informe HTML imprimible por bloque con identidad corporativa y hoja inicial de trazabilidad.",
                    "Descarga completa del bloque actual (nunca de toda la plataforma ni hojas vacías).",
                  ]}
                />
                <P>
                  Los archivos pueden descargarse individualmente o por bloque. Las descargas son
                  idempotentes: no modifican datos ni registran actualizaciones.
                </P>
              </Seccion>

              <Seccion id="actualizacion-y-control" headingId="h-act-control" title="Actualización y control">
                <P>
                  Las actualizaciones se realizan por bloque y municipio: actualizar Demografía nunca
                  sobrescribe Economía, ni a la inversa. Los datos consolidados y provisionales se
                  diferencian siempre; si no existe una fuente provisional válida, se conserva el último
                  dato consolidado y se comunica la ausencia de forma explícita.
                </P>
                <Lista
                  items={[
                    "Cada actualización valida cobertura, periodo, código municipal y coherencia.",
                    "Las operaciones internas están restringidas a personal autorizado.",
                    "La consulta pública no permite modificar datos.",
                    "Tras una actualización autorizada solo se revalida la ficha afectada.",
                  ]}
                />
              </Seccion>

              <Seccion id="actualizacion-calidad" headingId="h-actualizacion" title="Actualización y controles de calidad">
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
              </Seccion>

              <Seccion id="cobertura-limitaciones" headingId="h-cobertura" title="Lo que SOCideas no puede prometer">
                <Lista
                  items={[
                    "Las estadísticas oficiales tienen un rezago natural de uno o más años.",
                    "La cobertura es desigual por fuente y tamaño de municipio: no todo indicador existe para los 8.130 municipios.",
                    "Municipio, provincia, comunidad autónoma y sección censal son niveles distintos con fuentes distintas; sus cifras no siempre son comparables entre sí.",
                    "Los umbrales de secreto estadístico dejan huecos explícitos en municipios pequeños.",
                    "La ausencia de datos es una ausencia explícita, nunca un cero.",
                    "Los datos consolidados y los provisionales conviven identificados; no deben leerse como equivalentes.",
                    "Las secciones censales se cargan bajo demanda por su peso y por la disponibilidad de geometría.",
                  ]}
                />
                <Nota kind="limitacion" title="apoyo técnico, no verificación normativa">
                  <p>
                    Los resultados apoyan el análisis técnico, pero no sustituyen una verificación
                    normativa, jurídica, estadística o territorial específica del caso.
                  </p>
                </Nota>
              </Seccion>

              <Seccion id="rendimiento" headingId="h-rendimiento" title="Rápido porque prepara, no porque improvisa">
                <Lista
                  items={[
                    "El catálogo municipal está optimizado para la consulta repetida.",
                    "La ficha utiliza el documento municipal ya estructurado y una caché selectiva.",
                    "Los datos pesados, como la geometría de secciones censales, se cargan únicamente cuando se solicitan.",
                    "La actualización de un municipio invalida solo la ficha afectada.",
                  ]}
                />
              </Seccion>

              <Seccion id="privacidad-seguridad" headingId="h-privacidad" title="Estadística agregada y funciones separadas">
                <Lista
                  items={[
                    "SOCideas se basa en estadísticas públicas y agregadas; no está diseñado para mostrar datos personales.",
                    "Las funciones internas de mantenimiento están protegidas y separadas de la consulta pública.",
                    "Las credenciales y los mecanismos internos no se exponen al navegador.",
                    "El acceso de consulta está separado de los procesos de actualización.",
                    "La trazabilidad contiene referencias metodológicas, nunca datos sensibles.",
                  ]}
                />
              </Seccion>

              <Seccion id="alcance-futuro" headingId="h-alcance" title="Hoja de ruta prudente">
                <P>Sin fechas y sin llamar «disponible» a nada que no esté publicado.</P>
                <div className="mt-6 grid gap-8 sm:grid-cols-3 sm:gap-6">
                  {HOJA_DE_RUTA.map((col) => (
                    <div key={col.fase} className="border-t-2 border-[var(--border-strong)] pt-4">
                      <h3 className="type-h4 text-[var(--text-primary)]">{col.fase}</h3>
                      <ul className="type-body-sm mt-3 list-disc space-y-1.5 pl-4 text-[var(--text-secondary)] marker:text-[var(--border-strong)]">
                        {col.items.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                <div className="mt-12 flex flex-wrap gap-3 border-t border-[var(--border-subtle)] pt-8">
                  <Link href="/" className="btn btn-primary">
                    Consultar un municipio
                  </Link>
                  <Link href="/" className="btn btn-secondary">
                    Volver a la plataforma
                  </Link>
                </div>
              </Seccion>
            </article>
          </div>
        </div>
      </main>

      <PlatformFooter />
    </div>
  );
}
