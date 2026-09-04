import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServer } from "@/lib/supabase-server";
import { getPerfilDemografico } from "@/lib/socideas-perfil";
import type { FiltrosPerfil } from "@/lib/socideas-perfil";
import { getPerfilEconomico } from "@/lib/socideas-economia";
import PlatformHeader from "@/components/platform/PlatformHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";
import FichaFiltros from "@/components/socideas/FichaFiltros";
import CategoryTabs from "@/components/socideas/CategoryTabs";
import EconomiaFicha from "@/components/socideas/EconomiaFicha";
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
  const economia = categoria === "economia" ? await getEconomia(codigoINE) : null;

  if (!perfil) {
    return (
      <div className="flex min-h-screen flex-col">
        <PlatformHeader />
        <main className="flex-1 flex items-center justify-center px-4">
          <div className="border border-[var(--color-border-subtle)] rounded-[var(--border-radius-lg)] p-6 max-w-md text-center">
            <p className="text-sm text-[var(--color-text-secondary)]">
              No se encontró el municipio con código INE {codigoINE}.
            </p>
            <Link href="/socideas" className="mt-4 inline-block text-sm font-semibold text-[var(--color-secondary)]">
              Volver al buscador
            </Link>
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

  // Objeto plano (serializable para el Client Component; URLSearchParams no lo es).
  const spObj: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") spObj[k] = v;
    else if (Array.isArray(v) && v[0] !== undefined) spObj[k] = v[0];
  }

  return (
    <div className="flex min-h-screen flex-col">
      <PlatformHeader />
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
            <h1 className="text-3xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-4xl">
              {municipio.nombre}
            </h1>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              {municipio.provincia} · {municipio.comunidad_autonoma} · Código INE {municipio.codigo_ine}
            </p>
            {perfil.ultima_sincronizacion && (
              <p className="mt-2 inline-flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--color-secondary)]" />
                Datos oficiales actualizados el{" "}
                {new Date(perfil.ultima_sincronizacion).toLocaleDateString("es-ES", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/socideas"
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[var(--color-text-secondary)] bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-xl hover:text-[var(--color-text-primary)]"
              >
                ← Volver a SOCideas
              </Link>
              <Link
                href={mapHref}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[var(--color-primary)] rounded-xl hover:bg-[var(--color-primary-light)]"
              >
                Abrir en URBideas →
              </Link>
            </div>
            <div className="mt-6">
              <CategoryTabs codigoINE={municipio.codigo_ine} activa={categoria} searchParams={spObj} />
            </div>
          </section>

          {categoria === "economia" ? (
            economia ? (
              <EconomiaFicha codigoINE={municipio.codigo_ine} initial={economia} />
            ) : (
              <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border-subtle)] p-6 text-center">
                <p className="text-base font-semibold text-[var(--color-text-primary)]">
                  Bloque económico no disponible
                </p>
                <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                  No se pudo cargar el bloque económico de este municipio. La sincronización la realiza
                  el equipo técnico desde el servidor con fuentes oficiales.
                </p>
              </div>
            )
          ) : !perfil.sincronizado ? (
            <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border-subtle)] p-6 text-center">
              <p className="text-base font-semibold text-[var(--color-text-primary)]">
                Preparando datos oficiales
              </p>
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                Este municipio aún no tiene su perfil demográfico sincronizado.
                La sincronización la realiza el equipo técnico desde el servidor
                con fuentes oficiales; ningún dato se muestra sin trazabilidad.
              </p>
              <Link href="/socideas" className="mt-4 inline-block text-sm font-semibold text-[var(--color-secondary)]">
                Volver al buscador
              </Link>
            </div>
          ) : (
            <FichaFiltros codigoINE={municipio.codigo_ine} initial={perfil} searchParams={spObj} />
          )}
        </div>
      </main>
      <PlatformFooter />
    </div>
  );
}
