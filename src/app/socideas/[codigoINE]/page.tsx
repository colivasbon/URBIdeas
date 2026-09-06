import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServer } from "@/lib/supabase-server";
import { getPerfilDemografico } from "@/lib/socideas-perfil";
import type { FiltrosPerfil } from "@/lib/socideas-perfil";
import { getPerfilEconomico } from "@/lib/socideas-economia";
import SocideasHeader from "@/components/platform/SocideasHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";
import FichaFiltros from "@/components/socideas/FichaFiltros";
import CategoryTabs from "@/components/socideas/CategoryTabs";
import FichaToolbar from "@/components/socideas/FichaToolbar";
import ActualizacionMenu from "@/components/socideas/ActualizacionMenu";
import EconomiaFicha from "@/components/socideas/EconomiaFicha";
import { buildDemografiaTables, buildEconomiaTables } from "@/lib/socideas-export";
import { readDemographicPresentation } from "@/lib/socideas-demographic-summary";
import EmptyState from "@/components/ui/EmptyState";
import SourcePill from "@/components/ui/SourcePill";
import SectionEyebrow from "@/components/ui/SectionEyebrow";
import type { AmbitoTerritorial, CategoriaFicha, PerfilDemografico, PerfilEconomico } from "@/lib/socideas";
import { AMBITOS } from "@/lib/socideas";

export const dynamic = "force-dynamic";

const AMBITOS_DEFECTO: AmbitoTerritorial[] = ["municipio"];

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

function parseAnio(v: string | undefined, lista: number[]): number | null {
  if (!v || !/^\d{4}$/.test(v)) return null;
  const n = parseInt(v, 10);
  return lista.includes(n) ? n : null;
}

/** Rango compacto de periodos para la píldora de resumen (solo lectura de strings). */
function periodoDe(periodos: string[]): string | null {
  const anios = periodos.flatMap((p) => (p.match(/\b(19|20)\d{2}\b/g) ?? []).map(Number));
  if (anios.length === 0) return null;
  const min = Math.min(...anios);
  const max = Math.max(...anios);
  return min === max ? String(min) : `${min}–${max}`;
}

/** Filtros iniciales validados para la primera pintura en servidor. */
async function filtrosIniciales(
  codigoIne: string,
  sp: Record<string, string | string[] | undefined>,
): Promise<{ filtros: FiltrosPerfil; perfil: PerfilDemografico | null }> {
  const primero = (v: string | string[] | undefined): string | undefined =>
    Array.isArray(v) ? v[0] : v;
  // Carga base sin filtros para conocer los años disponibles.
  const base = await getPerfil(codigoIne, {}, false);
  const d = base?.disponibles;
  const filtros: FiltrosPerfil = { ambitos: [...AMBITOS_DEFECTO] };
  if (d) {
    const anio = parseAnio(primero(sp.anio), d.anios_municipio);
    const desde = parseAnio(primero(sp.evo_desde), d.anios_evolucion);
    const hasta = parseAnio(primero(sp.evo_hasta), d.anios_evolucion);
    const pirAnio = parseAnio(primero(sp.pir_anio), d.piramide_anios);
    if (anio !== null) filtros.anio = anio;
    if (desde !== null && hasta !== null && desde <= hasta) {
      filtros.desde = desde;
      filtros.hasta = hasta;
    }
    if (pirAnio !== null) filtros.pirAnio = pirAnio;
    const comparar = (primero(sp.comparar) ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s): s is AmbitoTerritorial => (AMBITOS as string[]).includes(s));
    if (comparar.length > 0) filtros.ambitos = comparar;
  }
  const perfil = await getPerfil(codigoIne, filtros, true);
  return { filtros, perfil };
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
  const categoria: CategoriaFicha = sp.categoria === "economia" ? "economia" : "demografia";
  const { perfil } = await filtrosIniciales(codigoINE, sp);
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

  // Lectura lateral R2 (una sola por carga, solo en Demografía): nunca rompe
  // la ficha; ante ausencia o error se omite sin estado visible.
  const demografiaExtra =
    categoria === "economia" ? null : await readDemographicPresentation(codigoINE).catch(() => null);
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
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[var(--color-text-secondary)] bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-xl hover:text-[var(--color-text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]"
              >
                ← Volver a SOCideas
              </Link>
              <Link
                href={mapHref}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[var(--color-primary)] rounded-xl hover:bg-[var(--color-primary-light)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]"
              >
                Abrir en URBideas →
              </Link>
            </div>
            <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <CategoryTabs codigoINE={municipio.codigo_ine} activa={categoria} searchParams={spObj} />
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
                />
              </FichaToolbar>
            </div>
          </section>

          {categoria === "economia" ? (
            economia ? (
              <EconomiaFicha codigoINE={municipio.codigo_ine} initial={economia} />
            ) : (
              <EmptyState
                title="Bloque económico no disponible"
                description="No se pudo cargar el bloque económico de este municipio. La sincronización la realiza el equipo técnico desde el servidor con fuentes oficiales."
              />
            )
          ) : !perfil.sincronizado ? (
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
            <FichaFiltros codigoINE={municipio.codigo_ine} initial={perfil} searchParams={spObj} demografiaExtra={demografiaExtra} />
          )}
        </div>
      </main>
      <PlatformFooter />
    </div>
  );
}
