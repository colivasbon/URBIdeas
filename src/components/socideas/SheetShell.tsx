import Link from "next/link";
import type { FichaSheetMeta } from "./ficha-sheets";

/**
 * Cabecera de un apartado-hoja: número de hoja + título + descripción. Da a
 * cada hoja del libro un encabezado propio y separado, sin tocar las
 * cabeceras internas de cada bloque.
 */
export function SheetHeader({ sheet }: { sheet: FichaSheetMeta }) {
  return (
    <header className="mb-6 border-l-2 border-[var(--color-secondary)] pl-4">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
        Hoja {sheet.code} · Libro SOCideas
      </p>
      <h2 className="editorial-display mt-1 text-2xl text-[var(--color-text-primary)]">{sheet.label}</h2>
      <p className="mt-1 max-w-3xl text-sm text-[var(--color-text-secondary)]">{sheet.descripcion}</p>
    </header>
  );
}

/**
 * Placeholder honesto para hojas sin datos: nunca inventa ceros ni valores,
 * declara el estado y la fuente pendiente. Reutiliza las clases de estado del
 * sistema (`ideas-status`).
 */
export function SheetPlaceholder({
  title,
  description,
  source,
  badge = "Pendiente de integración",
}: {
  title: string;
  description: string;
  source?: string;
  badge?: string;
}) {
  return (
    <div className="ideas-status mb-10" data-state="pending" role="status">
      <div className="ideas-status__head">
        <p className="ideas-status__title">{title}</p>
        <span className="ideas-status__badge">{badge}</span>
      </div>
      <div className="ideas-status__body">
        <p>{description}</p>
      </div>
      {source && <p className="ideas-status__source">{source}</p>}
    </div>
  );
}

/* ============================================================
   v2.3 — primitivas reutilizables para el coordinador
   Carga (Skeletons) · ND · Sin datos · Frescura visible
   ============================================================ */

/**
 * Esqueleto de una hoja completa (cabecera + bloques). Pensado como fallback
 * de `<Suspense>`: la región nunca queda vacía sin indicación visual.
 * Reutiliza `.premium-skeleton` (pulso plano, respeta prefers-reduced-motion).
 */
export function SheetSkeleton({
  label = "hoja",
  blocks = 2,
  rows = 4,
}: {
  /** Nombre del contenido que se carga (se announcea como sr-only). */
  label?: string;
  /** Nº de bloques simulados. */
  blocks?: number;
  /** Filas simuladas por bloque. */
  rows?: number;
}) {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Cargando {label}…</span>
      <div className="premium-skeleton h-7 w-64 max-w-full rounded-[6px]" />
      <div className="premium-skeleton mt-3 h-4 w-80 max-w-full rounded-[4px]" />
      {Array.from({ length: blocks }).map((_, i) => (
        <div key={i} className="mt-8">
          <div className="premium-skeleton h-5 w-56 max-w-full rounded-[4px]" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: rows }).map((__, j) => (
              <div key={j} className="flex gap-3">
                <div className="premium-skeleton h-4 w-1/3 min-w-0 rounded-[4px]" />
                <div className="premium-skeleton h-4 min-w-0 flex-1 rounded-[4px]" />
                <div className="premium-skeleton h-4 min-w-0 flex-1 rounded-[4px]" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Esqueleto de una tabla dentro de su superficie corporativa. Mismo contorno
 * que `DataTableShell` para que el cambio de estado no salte de layout.
 */
export function TableSkeleton({
  label = "tabla",
  rows = 5,
  columns = 3,
}: {
  /** Nombre de la tabla (se announcea como sr-only). */
  label?: string;
  rows?: number;
  columns?: number;
}) {
  const cols = Math.max(1, Math.min(columns, 5));
  return (
    <div className="socideas-table-block" role="status" aria-busy="true">
      <span className="sr-only">Cargando {label}…</span>
      <div className="socideas-table-shell">
        <div className="socideas-table-shell__head">
          <div className="min-w-0 flex-1">
            <div className="premium-skeleton h-4 w-1/2 max-w-[16rem] rounded-[4px]" />
            <div className="premium-skeleton mt-2 h-3 w-2/3 max-w-[22rem] rounded-[4px]" />
          </div>
        </div>
        <div className="socideas-table-shell__scroll">
          <div className="p-3">
            {Array.from({ length: rows }).map((_, i) => (
              <div key={i} className="flex gap-3 py-2">
                {Array.from({ length: cols }).map((__, j) => (
                  <div
                    key={j}
                    className={`premium-skeleton h-4 min-w-0 rounded-[4px] ${
                      j === 0 ? "w-1/3 shrink" : "flex-1"
                    }`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Explicación por defecto de «ND»: secreto estadístico / no difundido, nunca 0. */
export const ND_EXPLICACION =
  "ND = valor no difundido por la fuente oficial (secreto estadístico o sin dato publicado para este municipio y periodo). Nunca equivale a 0.";

/**
 * Celda «ND»: muestra ND con explicación accesible (tooltip `title` + texto
 * sr-only dentro del `<abbr>`). Nunca muestra 0 ni imputa valores.
 * Uso: `<td><NdCell /></td>` o `<NdCell motivo={…} />`.
 */
export function NdCell({ motivo = ND_EXPLICACION }: { motivo?: string }) {
  return (
    <abbr
      title={motivo}
      className="cursor-help font-semibold underline decoration-dotted underline-offset-2"
    >
      ND
      <span className="sr-only"> — {motivo}</span>
    </abbr>
  );
}

/**
 * Aviso de «sin datos» (la fuente no cubre el municipio), con enlace a la
 * alternativa cuando existe. Mismo lenguaje visual que `SheetPlaceholder`.
 * Uso: `<SinDatosAviso titulo={…} mensaje={…} alternativa={{ href, etiqueta }} />`
 */
export function SinDatosAviso({
  titulo,
  mensaje,
  alternativa,
}: {
  titulo: string;
  mensaje: string;
  /** Enlace a una fuente/hoja alternativa cuando existe (óptimo). */
  alternativa?: { href: string; etiqueta: string };
}) {
  return (
    <div className="ideas-status" data-state="pending" role="status">
      <div className="ideas-status__head">
        <p className="ideas-status__title">{titulo}</p>
        <span className="ideas-status__badge">Sin datos</span>
      </div>
      <div className="ideas-status__body">
        <p>{mensaje}</p>
      </div>
      {alternativa && (
        <p className="ideas-status__source">
          <Link
            href={alternativa.href}
            className="font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss-ink)]"
          >
            {alternativa.etiqueta}
          </Link>
        </p>
      )}
    </div>
  );
}

function fechaLegible(v: string | Date): { iso?: string; texto: string } {
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return { texto: typeof v === "string" ? v : "" };
  return {
    iso: d.toISOString(),
    texto: d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }),
  };
}

/**
 * LÍnea de frescura visible de un bloque: «Datos de … · Fuente: … ·
 * Actualizado: …». La fecha nunca se oculta ni se atenúa: si el dato es de
 * 2020, dice 2020. Nota metodológica opcional en línea propia.
 */
export function FreshnessLine({
  periodo,
  fuente,
  actualizado,
  nota,
}: {
  /** Año o rango de referencia del dato (p. ej. "2021", "2019–2023"). */
  periodo?: string | null;
  /** Nombre de la fuente oficial. */
  fuente?: string | null;
  /** Última ingesta: ISO, `Date` o texto libre (si no es fecha parseable, se muestra tal cual). */
  actualizado?: string | Date | null;
  /** Nota metodológica o advertencia de cobertura. */
  nota?: string | null;
}) {
  if (!periodo && !fuente && !actualizado && !nota) return null;
  const fecha = actualizado ? fechaLegible(actualizado) : null;
  const sep = (
    <span aria-hidden="true" className="socideas-table-meta__sep">
      ·
    </span>
  );
  const fuerte = "font-semibold text-[var(--color-text-secondary)]";
  return (
    <>
      {(periodo || fuente || fecha) && (
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-relaxed text-[var(--color-text-muted)]">
          {periodo && (
            <span>
              Datos de <strong className={fuerte}>{periodo}</strong>
            </span>
          )}
          {periodo && fuente && sep}
          {fuente && (
            <span>
              Fuente: <strong className={fuerte}>{fuente}</strong>
            </span>
          )}
          {fecha && (periodo || fuente) && sep}
          {fecha && (
            <span>
              Actualizado:{" "}
              {fecha.iso ? (
                <time dateTime={fecha.iso} className={fuerte}>
                  {fecha.texto}
                </time>
              ) : (
                <strong className={fuerte}>{fecha.texto}</strong>
              )}
            </span>
          )}
        </p>
      )}
      {nota && (
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[var(--color-text-muted)]">{nota}</p>
      )}
    </>
  );
}

/** Alias nominal alternativo (mismas props) por si el coordinador busca «BlockMeta». */
export const BlockMeta = FreshnessLine;
