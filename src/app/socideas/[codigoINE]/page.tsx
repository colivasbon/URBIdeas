import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServer } from "@/lib/supabase-server";
import { getPerfilDemografico } from "@/lib/socideas-perfil";
import type { FiltrosPerfil } from "@/lib/socideas-perfil";
import { getPerfilEconomico } from "@/lib/socideas-economia";
import SocideasHeader from "@/components/platform/SocideasHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";
import FichaFiltros from "@/components/socideas/FichaFiltros";
import SheetTabs from "@/components/socideas/SheetTabs";
import { SheetHeader, SheetPlaceholder } from "@/components/socideas/SheetShell";
import {
  ContextoPoliticoSheet,
  CriteriosFuentesSheet,
  PatrimonioSheet,
  ProyectoSheet,
  SocioculturalSheet,
} from "@/components/socideas/SheetSections";
import { AsociacionesBloque } from "@/components/socideas/AsociacionesBloque";
import { readAsociacionesMunicipio } from "@/lib/socideas-asociaciones";
import { readGalMunicipio } from "@/lib/socideas-gal";
import { readWikipediaEnrichment } from "@/lib/wikipedia-enrichment";
import { readElectoralProvincial } from "@/lib/socideas-electoral-provincial-store";
import type { ElectoralProvincialBundle } from "@/lib/socideas-electoral-provincial-store";
import { fichaSheetByKey, resolveFichaSheet } from "@/components/socideas/ficha-sheets";
import FichaToolbar from "@/components/socideas/FichaToolbar";
import ActualizacionMenu from "@/components/socideas/ActualizacionMenu";
import EconomiaFicha from "@/components/socideas/EconomiaFicha";
import { buildDemografiaTables, buildEconomiaTables } from "@/lib/socideas-export";
import { toFichaInitial, slimIneLayersForDemografia } from "@/lib/socideas-ficha-initial";
import { readDemographicPresentation } from "@/lib/socideas-demographic-summary";
import { readMigrationPresentation } from "@/lib/socideas-migration-summary";
import { buildMunicipalUpdatePreview, readMunicipalIneLayers } from "@/lib/socideas-ine-layers";
import type { MunicipalIneLayersV1 } from "@/lib/socideas-ine-layers";
import { readTemporaryMunicipalData } from "@/lib/socideas-temporary-data";
import type { TemporaryMunicipalData } from "@/lib/socideas-temporary-data";
import { readMunicipalStructureWithBenchmarks } from "@/lib/socideas-population-runtime";
import type { MunicipalStructureWithBenchmarks } from "@/lib/socideas-population-runtime";
import EstructuraSoloBloque from "@/components/socideas/EstructuraSoloBloque";
import EmptyState from "@/components/ui/EmptyState";
import PageShell from "@/components/ui/PageShell";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import type { PerfilDemografico, PerfilEconomico } from "@/lib/socideas";

export const dynamic = "force-dynamic";

// Sin self-fetch HTTP: la ficha llama a la lógica de perfil directamente.
// Un fetch a uno mismo puede fallar a nivel de red en serverless y tumbar
// la página entera con un error de Server Components.
async function getPerfil(
  codigoIne: string,
  filtros: FiltrosPerfil,
  refresh: boolean,
): Promise<PerfilDemografico | null> {
  try {
    const supabase = createSupabaseServer();
    // autoRefresh solo en el cuerpo de la página (no en metadatos): así una
    // misma visita no dispara dos sincronizaciones concurrentes.
    const result = await getPerfilDemografico(supabase, codigoIne, { ...filtros, autoRefresh: refresh });
    if (result.status === "ok" || result.status === "empty") return result.perfil;
    return null;
  } catch {
    // La ficha nunca debe tumbar la página: ante un fallo de datos se
    // muestra el estado de "no encontrado" en lugar del boundary de error.
    return null;
  }
}

async function getEconomia(codigoIne: string): Promise<PerfilEconomico | null> {
  try {
    const supabase = createSupabaseServer();
    const result = await getPerfilEconomico(supabase, codigoIne);
    if (result.status === "ok" || result.status === "empty") return result.perfil;
    return null;
  } catch {
    return null;
  }
}

/** Rango compacto de periodos para la píldora de resumen (solo lectura de strings). */
function periodoDe(periodos: string[]): string | null {
  const anios = periodos.flatMap((p) => (p.match(/\b(19|20)\d{2}\b/g) ?? []).map(Number));
  if (anios.length === 0) return null;
  const min = Math.min(...anios);
  const max = Math.max(...anios);
  return min === max ? String(min) : `${min}–${max}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ codigoINE: string }>;
}): Promise<Metadata> {
  const { codigoINE } = await params;
  try {
    const supabase = createSupabaseServer();
    const { data } = await supabase
      .from("municipios")
      .select("nombre")
      .eq("codigo_ine", codigoINE)
      .single();
    const nombre = (data as unknown as { nombre?: string })?.nombre ?? codigoINE;
    return {
      title: `${nombre} | SOCideas`,
      description: `Ficha sociodemográfica de ${nombre} (INE ${codigoINE}): población, evolución y estructura por edad y sexo con fuentes oficiales.`,
    };
  } catch {
    return {
      title: `${codigoINE} | SOCideas`,
      description: `Ficha sociodemográfica de ${codigoINE} (INE ${codigoINE}): población, evolución y estructura por edad y sexo con fuentes oficiales.`,
    };
  }
}

export default async function SocideasFicha({
  params,
  searchParams,
}: {
  params: Promise<{ codigoINE: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { codigoINE } = await params;
  const sp = (await searchParams) ?? {};
  const primero = (v: string | string[] | undefined): string | undefined =>
    Array.isArray(v) ? v[0] : v;
  // Hoja activa del libro: `?hoja=` manda; `?categoria=economia` (histórico) se
  // sigue aceptando y mapea a la hoja 03.
  const hojaActiva = resolveFichaSheet(primero(sp.hoja), primero(sp.categoria));
  const hojaMeta = fichaSheetByKey(hojaActiva);
  // UNA sola lectura del perfil (antes se hacían dos: base + filtrada; la
  // validación de filtros la repite el cliente sobre `disponibles`). La
  // comprobación de frescura contra el INE solo se lanza en la hoja de
  // demografía: al cambiar de pestaña no debe añadir latencia.
  const perfil = await getPerfil(codigoINE, {}, hojaActiva === "demografia");
  // La barra operativa necesita el resumen de AMBOS bloques. La lectura R2 del
  // envelope está deduplicada por React.cache en el mismo request (ver
  // socideas-r2:getMunicipioEnvelopeForRequest): no añade lecturas nuevas.
  const economia = await getEconomia(codigoINE);

  if (!perfil) {
    return (
      <div className="flex min-h-screen flex-col">
        <SocideasHeader codigoINE={codigoINE} />
        <main id="contenido" className="flex-1">
          <div className="container-ima py-16">
            <div className="mx-auto w-full max-w-md">
              <EmptyState
                title={`No se encontró el municipio con código INE ${codigoINE}`}
                description="El código no corresponde a ningún municipio del catálogo o sus datos no se han podido leer. Compruebe los cinco dígitos del código INE o búsquelo por nombre."
                action={
                  <Link href="/socideas" className="btn btn-secondary btn-sm">
                    Buscar un municipio
                  </Link>
                }
              />
            </div>
          </div>
        </main>
        <PlatformFooter />
      </div>
    );
  }

  const { municipio } = perfil;
  const mapHref =
    municipio.centroide_lat !== null && municipio.centroide_lng !== null
      ? `/urbideas/mapa?lat=${municipio.centroide_lat.toFixed(4)}&lng=${municipio.centroide_lng.toFixed(4)}&zoom=12`
      : "/urbideas";

  // Lectura lateral R2 (solo en la hoja de Demografía): nunca rompe
  // la ficha; ante ausencia o error se omite sin estado visible. Las capas INE
  // y los datos provisionales se leen siempre porque alimentan la vista previa
  // de actualización y la hoja sociocultural.
  const esHojaDemografia = hojaActiva === "demografia";
  const [demografiaExtra, ineLayers, migracion, temporaryData, estructuraPoblacion] = await Promise.all([
    esHojaDemografia ? readDemographicPresentation(codigoINE).catch(() => null) : Promise.resolve(null),
    readMunicipalIneLayers(codigoINE).catch(() => null) as Promise<MunicipalIneLayersV1 | null>,
    esHojaDemografia ? readMigrationPresentation(codigoINE).catch(() => null) : Promise.resolve(null),
    readTemporaryMunicipalData(codigoINE).catch(() => null) as Promise<TemporaryMunicipalData | null>,
    esHojaDemografia
      ? readMunicipalStructureWithBenchmarks(codigoINE).catch(() => null)
      : Promise.resolve(null) as Promise<MunicipalStructureWithBenchmarks | null>,
  ]);
  // Capas v2.3 (asociaciones, GAL, Wikipedia y resultados de circunscripción).
  // Se leen SOLO en las hojas que las muestran y siempre en paralelo: cada
  // lectura degrada a `null` sin romper la ficha. Ninguna escribe nada.
  const esHojaPolitico = hojaActiva === "politico";
  const esHojaPatrimonio = hojaActiva === "patrimonio";
  const esHojaAsociaciones = hojaActiva === "asociaciones";
  const provinciaCodigo = municipio.provincia_codigo_ine;
  // Cliente Supabase solo si alguna hoja v2.3 lo necesita (evita crear clientes
  // inútiles en el resto de pestañas).
  const supabaseV23 =
    esHojaPatrimonio || esHojaAsociaciones ? createSupabaseServer() : null;
  const [electoralProvincial, gal, wikipedia, asociaciones] = await Promise.all([
    esHojaPolitico && provinciaCodigo
      ? (readElectoralProvincial(provinciaCodigo.slice(0, 2)).catch(
          () => null,
        ) as Promise<ElectoralProvincialBundle | null>)
      : (Promise.resolve(null) as Promise<ElectoralProvincialBundle | null>),
    esHojaPatrimonio && supabaseV23
      ? readGalMunicipio(supabaseV23, codigoINE).catch(() => null)
      : Promise.resolve(null),
    esHojaPatrimonio
      ? readWikipediaEnrichment(codigoINE).catch(() => null)
      : Promise.resolve(null),
    esHojaAsociaciones && supabaseV23
      ? readAsociacionesMunicipio(supabaseV23, codigoINE).catch(() => null)
      : Promise.resolve(null),
  ]);

  // Vista previa de actualización (sin I/O extra): qué capas hay y su período.
  const capasPreview = buildMunicipalUpdatePreview(
    codigoINE,
    ineLayers,
    temporaryData ? { label: temporaryData.label, source: temporaryData.source, period: temporaryData.period } : null,
  );
  // Objeto plano (serializable para el Client Component; URLSearchParams no lo es).
  const spObj: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") spObj[k] = v;
    else if (Array.isArray(v) && v[0] !== undefined) spObj[k] = v[0];
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SocideasHeader codigoINE={municipio.codigo_ine} search={new URLSearchParams(spObj).toString()} />
      <main id="contenido" className="flex-1">
        <div className="container-ima pb-16">
          <PageShell
            breadcrumbs={
              <Breadcrumbs
                items={[
                  { label: "IDEAS Sostenibilidad", href: "/" },
                  { label: "SOCideas", href: "/socideas" },
                  { label: municipio.nombre },
                ]}
              />
            }
            title={municipio.nombre}
            meta={
              <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm text-[var(--text-secondary)]">
                <div>
                  <dt className="sr-only">Provincia y comunidad autónoma</dt>
                  <dd>
                    {municipio.provincia}, {municipio.comunidad_autonoma}
                  </dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="text-[var(--text-muted)]">Código INE</dt>
                  <dd className="tabular-nums">{municipio.codigo_ine}</dd>
                </div>
                {perfil.ultima_sincronizacion && (
                  <div className="flex flex-wrap gap-x-1.5" title={`Última sincronización: ${perfil.ultima_sincronizacion}`}>
                    <dt className="text-[var(--text-muted)]">Datos oficiales sincronizados el</dt>
                    <dd>
                      <time dateTime={perfil.ultima_sincronizacion}>
                        {new Date(perfil.ultima_sincronizacion).toLocaleDateString("es-ES", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                      </time>
                    </dd>
                  </div>
                )}
              </dl>
            }
          >
            {/* Barra operativa: recuento de tablas del libro y descarga XLSX. */}
            <FichaToolbar
              codigoINE={municipio.codigo_ine}
              demoCount={buildDemografiaTables(perfil).length}
              ecoCount={economia ? buildEconomiaTables(economia).length : 0}
              demoPeriodo={periodoDe(buildDemografiaTables(perfil).map((t) => t.periodo))}
              ecoPeriodo={economia ? periodoDe(buildEconomiaTables(economia).map((t) => t.periodo)) : null}
            >
              <Link href={mapHref} className="btn btn-ghost">
                Abrir en URBideas
              </Link>
              <ActualizacionMenu
                codigoINE={municipio.codigo_ine}
                ultimaDemografia={perfil.ultima_sincronizacion}
                ultimaEconomia={economia?.ultima_sincronizacion}
                capasPreview={capasPreview}
              />
            </FichaToolbar>
          </PageShell>

          {/* Navegación por hojas del libro XLSX. */}
          <div className="-mt-4">
            <SheetTabs codigoINE={municipio.codigo_ine} activa={hojaActiva} searchParams={spObj} />
          </div>

          {/* Apartado activo: cada hoja del libro tiene su propio encabezado. */}
          <div>
            <SheetHeader sheet={hojaMeta} />

            {hojaActiva === "proyecto" && <ProyectoSheet codigoINE={municipio.codigo_ine} />}

            {hojaActiva === "demografia" &&
              (!perfil.sincronizado ? (
                <EmptyState
                  title="Preparando datos oficiales"
                  description="Este municipio aún no tiene su perfil demográfico sincronizado. La sincronización la realiza el equipo técnico desde el servidor con fuentes oficiales; ningún dato se muestra sin trazabilidad."
                  action={
                    <Link href="/socideas" className="btn btn-secondary btn-sm">
                      Buscar otro municipio
                    </Link>
                  }
                />
              ) : perfil.total === null && perfil.evolucion.length === 0 ? (
                <div>
                  <EmptyState
                    title="Sin serie demográfica cargada"
                    description="Este municipio no tiene población en los envelopes R2 de la carga nacional SOCideas. La ausencia se muestra como tal: no se imputa ningún valor ni se convierte en cero."
                    action={
                      <Link href="/socideas" className="btn btn-secondary btn-sm">
                        Buscar otro municipio
                      </Link>
                    }
                  />
                  {/* La estructura anual vive en un objeto R2 INDEPENDIENTE del
                      envelope de serie: un municipio sin serie (p. ej. Ceuta o
                      Melilla en la carga nacional) sí puede tener pirámide 2025.
                      No se debe ocultar detrás del estado vacío. */}
                  {estructuraPoblacion && (
                    <EstructuraSoloBloque
                      data={estructuraPoblacion}
                      municipioNombre={municipio.nombre}
                      provinciaNombre={municipio.provincia}
                      ccaaNombre={municipio.comunidad_autonoma}
                      estRef={spObj.est_ref}
                      estModo={spObj.est_modo}
                    />
                  )}
                </div>
              ) : (
                <FichaFiltros
                  codigoINE={municipio.codigo_ine}
                  initial={toFichaInitial(perfil)}
                  searchParams={spObj}
                  demografiaExtra={demografiaExtra}
                  ineLayers={slimIneLayersForDemografia(ineLayers)}
                  migracion={migracion}
                  temporaryData={temporaryData}
                  estructuraPoblacion={estructuraPoblacion}
                />
              ))}

            {hojaActiva === "politico" && (
              <ContextoPoliticoSheet
                codigoINE={municipio.codigo_ine}
                valores={perfil.valores}
                municipio={municipio.nombre}
                provincial={electoralProvincial}
              />
            )}

            {hojaActiva === "economia" &&
              (economia ? (
                <EconomiaFicha codigoINE={municipio.codigo_ine} initial={economia} ineLayers={ineLayers} />
              ) : (
                <EmptyState
                  title="Bloque económico no disponible"
                  description="No se ha podido leer el bloque económico de este municipio. Recargue la página en unos minutos; si persiste, el bloque está pendiente de sincronización por el equipo técnico con fuentes oficiales."
                />
              ))}

            {hojaActiva === "sociocultural" && <SocioculturalSheet ineLayers={ineLayers} />}

            {hojaActiva === "patrimonio" && (
              <PatrimonioSheet
                wikipedia={wikipedia}
                gal={gal}
                municipio={municipio.nombre}
              />
            )}

            {hojaActiva === "infraestructura" && (
              <SheetPlaceholder
                title="Infraestructura, transporte, conectividad y transición energética"
                description="Pendiente de integración desde fuentes geográficas y administrativas oficiales. La ausencia de dato no se representa como cero."
                source="Fuente prevista: fuentes geográficas y administrativas oficiales con cobertura municipal."
              />
            )}

            {hojaActiva === "asociaciones" &&
              (asociaciones ? (
                <AsociacionesBloque data={asociaciones} municipio={municipio.nombre} />
              ) : (
                <SheetPlaceholder
                  title="Directorio asociativo"
                  description="Sin datos publicados de asociaciones para este municipio en este momento. El directorio se alimenta exclusivamente de registros autonómicos de datos abiertos; nunca se inventan entidades ni se realiza scraping."
                  source="Registros autonómicos de asociaciones (datos abiertos)."
                />
              ))}

            {hojaActiva === "fuentes" && <CriteriosFuentesSheet />}
          </div>
        </div>
      </main>
      <PlatformFooter />
    </div>
  );
}
