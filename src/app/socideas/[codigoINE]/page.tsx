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
  ProyectoSheet,
  SocioculturalSheet,
} from "@/components/socideas/SheetSections";
import { fichaSheetByKey, resolveFichaSheet } from "@/components/socideas/ficha-sheets";
import FichaToolbar from "@/components/socideas/FichaToolbar";
import ActualizacionMenu from "@/components/socideas/ActualizacionMenu";
import EconomiaFicha from "@/components/socideas/EconomiaFicha";
import { buildDemografiaTables, buildEconomiaTables } from "@/lib/socideas-export";
import { readDemographicPresentation } from "@/lib/socideas-demographic-summary";
import { readMigrationPresentation } from "@/lib/socideas-migration-summary";
import { buildMunicipalUpdatePreview, readMunicipalIneLayers } from "@/lib/socideas-ine-layers";
import type { MunicipalIneLayersV1 } from "@/lib/socideas-ine-layers";
import { readTemporaryMunicipalData } from "@/lib/socideas-temporary-data";
import type { TemporaryMunicipalData } from "@/lib/socideas-temporary-data";
import EmptyState from "@/components/ui/EmptyState";
import SourcePill from "@/components/ui/SourcePill";
import SectionEyebrow from "@/components/ui/SectionEyebrow";
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
        <main className="flex-1 flex items-center justify-center px-4 py-10">
          <div className="w-full max-w-md">
            <EmptyState
              title={`No se encontró el municipio con código INE ${codigoINE}.`}
              description="Compruebe el código o vuelva al buscador municipal de SOCideas."
              action={
                <Link href="/socideas" className="text-sm font-semibold text-[var(--color-secondary)]">
                  Volver al buscador
                </Link>
              }
            />
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
  const [demografiaExtra, ineLayers, migracion, temporaryData] = await Promise.all([
    esHojaDemografia ? readDemographicPresentation(codigoINE).catch(() => null) : Promise.resolve(null),
    readMunicipalIneLayers(codigoINE).catch(() => null) as Promise<MunicipalIneLayersV1 | null>,
    esHojaDemografia ? readMigrationPresentation(codigoINE).catch(() => null) : Promise.resolve(null),
    readTemporaryMunicipalData(codigoINE).catch(() => null) as Promise<TemporaryMunicipalData | null>,
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
      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <section className="mb-8 border-b border-[var(--color-border-subtle)] pb-8">
            <nav aria-label="Migas de pan" className="mb-3 text-xs text-[var(--color-text-muted)]">
              <Link href="/socideas" className="hover:text-[var(--color-secondary)]">
                SOCideas
              </Link>
              <span className="mx-1.5">/</span>
              <span className="text-[var(--color-text-secondary)]">{municipio.nombre}</span>
            </nav>
            <SectionEyebrow>
              Ficha municipal · {municipio.provincia} · {municipio.comunidad_autonoma}
            </SectionEyebrow>
            <h1 className="editorial-display mt-3 text-3xl text-[var(--color-text-primary)] sm:text-4xl">
              {municipio.nombre}
            </h1>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              {municipio.provincia} · {municipio.comunidad_autonoma} · Código INE {municipio.codigo_ine}
            </p>
            {perfil.ultima_sincronizacion && (
              <div className="mt-3">
                <SourcePill title={`Última sincronización: ${perfil.ultima_sincronizacion}`}>
                  Datos oficiales actualizados el{" "}
                  {new Date(perfil.ultima_sincronizacion).toLocaleDateString("es-ES", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </SourcePill>
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/socideas"
                className="inline-flex min-h-[36px] items-center gap-2 px-4 py-2 text-xs font-semibold text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded-[6px] hover:text-[var(--color-text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss-ink)]"
                style={{ backgroundColor: 'var(--color-input-bg)' }}
              >
                ← Volver a SOCideas
              </Link>
              <Link
                href={mapHref}
                className="inline-flex min-h-[36px] items-center gap-2 px-4 py-2 text-xs font-semibold text-hueso bg-musgo rounded-[6px] hover:bg-musgo-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss-ink)]"
              >
                Abrir en URBideas →
              </Link>
            </div>
          </section>

          {/* Cabecera operativa: recuento de tablas + descarga XLSX en banda propia. */}
          <FichaToolbar
            codigoINE={municipio.codigo_ine}
            demoCount={buildDemografiaTables(perfil).length}
            ecoCount={economia ? buildEconomiaTables(economia).length : 0}
            demoPeriodo={periodoDe(buildDemografiaTables(perfil).map((t) => t.periodo))}
            ecoPeriodo={economia ? periodoDe(buildEconomiaTables(economia).map((t) => t.periodo)) : null}
          >
            <ActualizacionMenu
              codigoINE={municipio.codigo_ine}
              ultimaDemografia={perfil.ultima_sincronizacion}
              ultimaEconomia={economia?.ultima_sincronizacion}
              capasPreview={capasPreview}
            />
          </FichaToolbar>

          {/* Navegación por hojas del libro XLSX. */}
          <div className="mt-6">
            <SheetTabs codigoINE={municipio.codigo_ine} activa={hojaActiva} searchParams={spObj} />
          </div>

          {/* Apartado activo: cada hoja del libro tiene su propio encabezado. */}
          <div className="mt-8">
            <SheetHeader sheet={hojaMeta} />

            {hojaActiva === "proyecto" && <ProyectoSheet codigoINE={municipio.codigo_ine} />}

            {hojaActiva === "demografia" &&
              (!perfil.sincronizado ? (
                <EmptyState
                  title="Preparando datos oficiales"
                  description="Este municipio aún no tiene su perfil demográfico sincronizado. La sincronización la realiza el equipo técnico desde el servidor con fuentes oficiales; ningún dato se muestra sin trazabilidad."
                  action={
                    <Link href="/socideas" className="text-sm font-semibold text-[var(--color-secondary)]">
                      Volver al buscador
                    </Link>
                  }
                />
              ) : (
                <FichaFiltros
                  codigoINE={municipio.codigo_ine}
                  initial={perfil}
                  searchParams={spObj}
                  demografiaExtra={demografiaExtra}
                  ineLayers={ineLayers}
                  migracion={migracion}
                  temporaryData={temporaryData}
                />
              ))}

            {hojaActiva === "politico" && (
              <ContextoPoliticoSheet valores={perfil.valores} municipio={municipio.nombre} />
            )}

            {hojaActiva === "economia" &&
              (economia ? (
                <EconomiaFicha codigoINE={municipio.codigo_ine} initial={economia} />
              ) : (
                <EmptyState
                  title="Bloque económico no disponible"
                  description="No se pudo cargar el bloque económico de este municipio. La sincronización la realiza el equipo técnico desde el servidor con fuentes oficiales."
                />
              ))}

            {hojaActiva === "sociocultural" && <SocioculturalSheet ineLayers={ineLayers} />}

            {hojaActiva === "patrimonio" && (
              <SheetPlaceholder
                title="Patrimonio y turismo"
                description="Pendiente de integración desde inventarios culturales y registros turísticos oficiales con cobertura territorial y licencia verificadas. Nada se rellena con valores provisionales."
                source="Fuente prevista: inventarios culturales y registros turísticos oficiales."
              />
            )}

            {hojaActiva === "infraestructura" && (
              <SheetPlaceholder
                title="Infraestructura, transporte, conectividad y transición energética"
                description="Pendiente de integración desde fuentes geográficas y administrativas oficiales. La ausencia de dato no se representa como cero."
                source="Fuente prevista: fuentes geográficas y administrativas oficiales con cobertura municipal."
              />
            )}

            {hojaActiva === "asociaciones" && (
              <SheetPlaceholder
                title="Directorio asociativo"
                description="Pendiente de integración desde registros oficiales con licencias verificadas y política de privacidad aplicable."
                source="Fuente prevista: registros oficiales de asociaciones."
              />
            )}

            {hojaActiva === "fuentes" && <CriteriosFuentesSheet />}
          </div>
        </div>
      </main>
      <PlatformFooter />
    </div>
  );
}
