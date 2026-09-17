// Bloque de densidad de población SOCideas — INTEGRADO en FichaFiltros.tsx
// (Bloque 4: sustituye al "Densidad no disponible / Pendiente" cuando el
// envelope trae superficie oficial IGN; si no, la ficha mantiene el estado
// pendiente honesto).
//
// Esbozo presentacional reutilizando piezas existentes (StatCard, StatusCard,
// DataTableMeta) y replicando los ayudantes locales Trace/EstadoLinea de
// DemographicBlocks.tsx (no se importan: son locales a ese fichero y ese
// fichero no se toca). Sin estilos nuevos: solo clases del sistema
// (data-card, ideas-status, ideas-h2, socideas-table-meta, role=status).
import DataTableMeta from "./DataTableMeta";
import StatCard from "./StatCard";
import StatusCard from "./StatusCard";
import {
  DENSITY_METHOD_TEXT,
  densityDetailLabel,
  densityPendingReason,
  densityYearsWarning,
} from "@/lib/socideas-density";

export interface DensityBlockData {
  densidad: number | null;
  superficieKm2: number | null;
  anioPoblacion: number | null;
  anioSuperficie: number;
  poblacion: number | null;
}

/** Réplica del patrón Trace de DemographicBlocks, adaptada a doble fuente + doble año. */
function DensityTrace({
  anioPoblacion,
  anioSuperficie,
}: {
  anioPoblacion: number | null;
  anioSuperficie: number;
}) {
  return (
    <p className="mt-3 text-xs text-[var(--color-text-muted)]">
      Fuente: INE · Cifras oficiales de población (padrón, {anioPoblacion ?? "—"}) +
      IGN · Superficie oficial municipal NGMEP ({anioSuperficie}) · Cálculo SOCideas
    </p>
  );
}

/** Réplica del patrón EstadoLinea de DemographicBlocks (mismas clases, mensajes de densidad). */
function DensityEstadoLinea({ motivo }: { motivo: string }) {
  return (
    <p role="status" className="rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-input-bg)] px-4 py-3 text-xs text-[var(--color-text-muted)]">
      {motivo}
    </p>
  );
}

/** Bloque completo: dos StatCards + meta + aviso de años + método. */
export function DensityBlock({ data }: { data: DensityBlockData }) {
  const { densidad, superficieKm2, anioPoblacion, anioSuperficie } = data;
  const aviso = densityYearsWarning(anioPoblacion, anioSuperficie);
  const periodo =
    anioPoblacion !== null ? `población ${anioPoblacion} · superficie ${anioSuperficie}` : `superficie ${anioSuperficie}`;
  return (
    <section aria-label="Densidad y lectura territorial" className="premium-card mb-10 p-5 sm:p-6">
      <h2 className="ideas-h2">Densidad y lectura territorial</h2>
      <div className="mt-2">
        <DataTableMeta
          meta={{
            fuente: "INE + IGN (NGMEP) · Cálculo SOCideas",
            periodo,
            unidad: "hab/km²",
          }}
        />
      </div>
      {densidad !== null ? (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatCard
            etiqueta="Densidad de población"
            valor={`${densidad.toLocaleString("es-ES")} hab/km²`}
            detalle={densityDetailLabel(anioPoblacion, anioSuperficie)}
          />
          <StatCard
            etiqueta="Superficie municipal"
            valor={
              superficieKm2 !== null
                ? `${superficieKm2.toLocaleString("es-ES")} km²`
                : "ND"
            }
            detalle={`IGN · NGMEP ${anioSuperficie}`}
          />
        </div>
      ) : (
        <div className="mt-4">
          <DensityEstadoLinea motivo={densityPendingReason(data.poblacion, superficieKm2)} />
        </div>
      )}
      {aviso !== null && densidad !== null && (
        <div className="mt-3">
          <DensityEstadoLinea motivo={aviso} />
        </div>
      )}
      <DensityTrace anioPoblacion={anioPoblacion} anioSuperficie={anioSuperficie} />
      <details className="mt-3">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--color-secondary)]">Cómo se calcula</summary>
        <p className="mt-2 text-xs leading-relaxed text-[var(--color-text-muted)]">
          {DENSITY_METHOD_TEXT}
        </p>
      </details>
    </section>
  );
}

/** Estado pendiente honesto (sustituto del "Pendiente" actual cuando falte un componente). */
export function DensityPendingBlock({ motivo }: { motivo: string }) {
  return (
    <StatusCard
      state="pending"
      titulo="Densidad no disponible"
      fuente="Fuente: pendiente de superficie oficial o población municipal · Nada se estima"
    >
      <p>{motivo} El detalle figura en el panel de cobertura final; nada se estima.</p>
    </StatusCard>
  );
}
