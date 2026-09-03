import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServer } from "@/lib/supabase-server";
import { getPerfilDemografico } from "@/lib/socideas-perfil";
import PlatformHeader from "@/components/platform/PlatformHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";
import StatCard from "@/components/socideas/StatCard";
import EvolutionChart from "@/components/socideas/EvolutionChart";
import PyramidChart from "@/components/socideas/PyramidChart";
import Traceability from "@/components/socideas/Traceability";
import type { PerfilDemografico } from "@/lib/socideas";

export const dynamic = "force-dynamic";

// Sin self-fetch HTTP: la ficha llama a la lógica de perfil directamente.
// Un fetch a uno mismo puede fallar a nivel de red en serverless y tumbar
// la página entera con un error de Server Components.
async function getPerfil(codigoIne: string): Promise<PerfilDemografico | null> {
  try {
    const supabase = createSupabaseServer();
    const result = await getPerfilDemografico(supabase, codigoIne);
    if (result.status === "ok" || result.status === "empty") return result.perfil;
    return null;
  } catch {
    // La ficha nunca debe tumbar la página: ante un fallo de datos se
    // muestra el estado de "no encontrado" en lugar del boundary de error.
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ codigoINE: string }>;
}): Promise<Metadata> {
  const { codigoINE } = await params;
  const perfil = await getPerfil(codigoINE);
  const nombre = perfil?.municipio.nombre ?? codigoINE;
  return {
    title: `${nombre} | SOCideas`,
    description: `Ficha sociodemográfica de ${nombre} (INE ${codigoINE}): población, evolución y estructura por edad y sexo con fuentes oficiales.`,
  };
}

function fmt(n: number | null): string {
  return n === null ? "—" : n.toLocaleString("es-ES");
}

export default async function SocideasFicha({
  params,
}: {
  params: Promise<{ codigoINE: string }>;
}) {
  const { codigoINE } = await params;
  const perfil = await getPerfil(codigoINE);

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

  if (!perfil.sincronizado) {
    return (
      <div className="flex min-h-screen flex-col">
        <PlatformHeader />
        <main className="flex-1">
          <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
            <FichaCabecera municipio={municipio} mapHref={mapHref} />
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
          </div>
        </main>
        <PlatformFooter />
      </div>
    );
  }

  const refAnio = perfil.total?.anio_referencia ?? null;
  const fuenteNombre =
    (perfil.total?.source as unknown as { organismo?: string } | undefined)?.organismo ??
    "Instituto Nacional de Estadística";

  return (
    <div className="flex min-h-screen flex-col">
      <PlatformHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <FichaCabecera municipio={municipio} mapHref={mapHref} />

          {/* Bloque 1: población actual */}
          <section aria-label="Población actual" className="mb-10">
            <h2 className="text-lg font-bold text-[var(--color-text-primary)] mb-4">Población actual</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                etiqueta="Población total"
                valor={fmt(perfil.total?.valor_numerico ?? null)}
                detalle={`${fuenteNombre} · ${refAnio ?? "—"}`}
              />
              <StatCard
                etiqueta="Hombres"
                valor={fmt(perfil.hombres?.valor_numerico ?? null)}
                detalle={`${fuenteNombre} · ${perfil.hombres?.anio_referencia ?? "—"}`}
              />
              <StatCard
                etiqueta="Mujeres"
                valor={fmt(perfil.mujeres?.valor_numerico ?? null)}
                detalle={`${fuenteNombre} · ${perfil.mujeres?.anio_referencia ?? "—"}`}
              />
              <StatCard
                etiqueta="Variación 10 años"
                valor={
                  perfil.derivados.cambio_10y !== null
                    ? `${perfil.derivados.cambio_10y > 0 ? "+" : ""}${perfil.derivados.cambio_10y.toLocaleString("es-ES")} %`
                    : "—"
                }
                detalle="Cálculo propio sobre serie oficial"
              />
            </div>
          </section>

          {/* Bloque 2: evolución */}
          <section aria-label="Evolución demográfica" className="mb-10 rounded-[var(--border-radius-lg)] border border-[var(--color-border-subtle)] p-5 sm:p-6">
            <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Evolución demográfica</h2>
            <div className="mt-4">
              <EvolutionChart
                id={`evo-${municipio.codigo_ine}`}
                puntos={perfil.evolucion
                  .filter((v) => v.valor_numerico !== null)
                  .map((v) => ({ anio: v.anio_referencia ?? 0, valor: v.valor_numerico as number }))}
              />
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard
                etiqueta="Variación 5 años"
                valor={
                  perfil.derivados.cambio_5y !== null
                    ? `${perfil.derivados.cambio_5y > 0 ? "+" : ""}${perfil.derivados.cambio_5y.toLocaleString("es-ES")} %`
                    : "Sin datos suficientes"
                }
              />
              <StatCard
                etiqueta="Variación 10 años"
                valor={
                  perfil.derivados.cambio_10y !== null
                    ? `${perfil.derivados.cambio_10y > 0 ? "+" : ""}${perfil.derivados.cambio_10y.toLocaleString("es-ES")} %`
                    : "Sin datos suficientes"
                }
              />
              <StatCard
                etiqueta="Comparativa"
                valor={comparativaTexto(perfil)}
                detalle="Último año disponible por ámbito"
              />
            </div>
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-semibold text-[var(--color-secondary)]">
                Ver tabla anual
              </summary>
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-[var(--color-text-muted)]">
                    <th className="py-2 pr-4">Año</th>
                    <th className="py-2 pr-4 text-right">Municipio</th>
                    <th className="py-2 pr-4 text-right">Provincia</th>
                    <th className="py-2 pr-4 text-right">CCAA</th>
                    <th className="py-2 text-right">España</th>
                  </tr>
                </thead>
                <tbody>
                  {tablaComparada(perfil).map((row) => (
                    <tr key={row.anio} className="border-t border-[var(--color-border-subtle)] tabular-nums">
                      <td className="py-2 pr-4">{row.anio}</td>
                      <td className="py-2 pr-4 text-right">{fmt(row.municipio)}</td>
                      <td className="py-2 pr-4 text-right">{fmt(row.provincia)}</td>
                      <td className="py-2 pr-4 text-right">{fmt(row.ccaa)}</td>
                      <td className="py-2 text-right">{fmt(row.espana)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </section>

          {/* Bloque 3: edad y sexo */}
          <section aria-label="Población por edad y sexo" className="mb-10 rounded-[var(--border-radius-lg)] border border-[var(--color-border-subtle)] p-5 sm:p-6">
            <h2 className="text-lg font-bold text-[var(--color-text-primary)]">
              Población por edad y sexo{perfil.piramide.anio ? ` (${perfil.piramide.anio})` : ""}
            </h2>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              Padrón Continuo (INE). El año de referencia puede diferir del de población total.
            </p>
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-8">
              <PyramidChart grupos={perfil.piramide.grupos} anio={perfil.piramide.anio} />
              <div className="flex flex-col gap-4">
                <StatCard
                  etiqueta="Índice de envejecimiento"
                  valor={
                    perfil.derivados.indice_envejecimiento !== null
                      ? `${perfil.derivados.indice_envejecimiento.toLocaleString("es-ES")} %`
                      : "—"
                  }
                  detalle="Población 65+ / 0-14 × 100"
                />
                <StatCard
                  etiqueta="Índice de dependencia"
                  valor={
                    perfil.derivados.indice_dependencia !== null
                      ? `${perfil.derivados.indice_dependencia.toLocaleString("es-ES")} %`
                      : "—"
                  }
                  detalle="(0-14 + 65+) / 15-64 × 100"
                />
                <details>
                  <summary className="cursor-pointer text-sm font-semibold text-[var(--color-secondary)]">
                    Ver tabla por grupos
                  </summary>
                  <table className="mt-3 w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wider text-[var(--color-text-muted)]">
                        <th className="py-2 pr-4">Edad</th>
                        <th className="py-2 pr-4 text-right">Hombres</th>
                        <th className="py-2 text-right">Mujeres</th>
                      </tr>
                    </thead>
                    <tbody>
                      {perfil.piramide.grupos.map((g) => (
                        <tr key={g.tramo} className="border-t border-[var(--color-border-subtle)] tabular-nums">
                          <td className="py-2 pr-4">{g.tramo}</td>
                          <td className="py-2 pr-4 text-right">{fmt(g.hombres)}</td>
                          <td className="py-2 text-right">{fmt(g.mujeres)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </div>
            </div>
          </section>

          {/* Bloque 4: densidad */}
          <section aria-label="Densidad y lectura territorial" className="mb-10 rounded-[var(--border-radius-lg)] border border-[var(--color-border-subtle)] p-5 sm:p-6">
            <h2 className="text-lg font-bold text-[var(--color-text-primary)]">Densidad y lectura territorial</h2>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              {perfil.densidad.valor !== null
                ? `${perfil.densidad.valor.toLocaleString("es-ES")} hab/km²`
                : perfil.densidad.pendiente ?? "Pendiente de integración de fuente de superficie"}
            </p>
          </section>

          <Traceability
            valores={perfil.valores}
            pendientes={[
              "Densidad: pendiente de integración de fuente de superficie.",
              "Población extranjera y saldo migratorio: sin cobertura municipal verificada en Tempus3.",
            ]}
          />
        </div>
      </main>
      <PlatformFooter />
    </div>
  );
}

function FichaCabecera({
  municipio,
  mapHref,
}: {
  municipio: PerfilDemografico["municipio"];
  mapHref: string;
}) {
  return (
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
    </section>
  );
}

function tablaComparada(perfil: PerfilDemografico) {
  const get = (list: PerfilDemografico["evolucion"]) => {
    const m = new Map<number, number | null>();
    for (const v of list) m.set(v.anio_referencia ?? 0, v.valor_numerico);
    return m;
  };
  const muni = get(perfil.evolucion);
  const prov = get(perfil.comparativas.provincia);
  const ccaa = get(perfil.comparativas.ccaa);
  const esp = get(perfil.comparativas.espana);
  const anios = [...new Set([...muni.keys(), ...prov.keys(), ...ccaa.keys(), ...esp.keys()])].sort((a, b) => a - b);
  return anios.map((anio) => ({
    anio,
    municipio: muni.get(anio) ?? null,
    provincia: prov.get(anio) ?? null,
    ccaa: ccaa.get(anio) ?? null,
    espana: esp.get(anio) ?? null,
  }));
}

function comparativaTexto(perfil: PerfilDemografico): string {
  const last = (list: PerfilDemografico["evolucion"]) =>
    list.length > 0 ? (list[list.length - 1].valor_numerico ?? null) : null;
  const parts: string[] = [];
  const p = last(perfil.comparativas.provincia);
  const c = last(perfil.comparativas.ccaa);
  const e = last(perfil.comparativas.espana);
  if (p !== null) parts.push(`Prov. ${fmt(p)}`);
  if (c !== null) parts.push(`CCAA ${fmt(c)}`);
  if (e !== null) parts.push(`Esp. ${fmt(e)}`);
  return parts.length > 0 ? parts.join(" · ") : "Sin comparativas";
}
