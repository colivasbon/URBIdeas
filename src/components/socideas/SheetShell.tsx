import Link from "next/link";
import type { FichaSheetMeta } from "./ficha-sheets";

/**
 * Cabecera de un apartado-hoja: número de hoja + título + descripción. Da a
 * cada hoja del libro un encabezado propio y separado, sin tocar las
 * cabeceras internas de cada bloque.
 */
export function SheetHeader({ sheet }: { sheet: FichaSheetMeta }) {
  return (
    <header className="pb-8 pt-10">
      <h2 className="type-h2 text-[var(--text-primary)]">{sheet.label}</h2>
      <p className="mt-3 max-w-[70ch] text-[var(--text-secondary)]">{sheet.descripcion}</p>
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        Hoja <span className="tabular-nums">{sheet.code}</span> del libro XLSX descargable
      </p>
    </header>
  );
}

/**
 * Placeholder honesto para hojas sin datos: nunca inventa ceros ni valores,
 * declara el estado y la fuente pendiente. Filete discontinuo y etiqueta de
 * estado en texto (nunca solo color).
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
    <div className={`${PENDING_PANEL} mb-10`} data-state="pending" role="status">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="type-h4 text-[var(--text-primary)]">{title}</p>
        <span className="socideas-badge" data-tone="draft">
          <span aria-hidden="true" className="socideas-badge__dot" />
          {badge}
        </span>
      </div>
      <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-[var(--text-secondary)]">{description}</p>
      {source && <p className="mt-3 max-w-[70ch] text-[13px] leading-relaxed text-[var(--text-muted)]">{source}</p>}
    </div>
  );
}

/** Panel de estado pendiente / sin datos (compartido). */
export const PENDING_PANEL =
  "rounded-[6px] border border-dashed border-[var(--border-default)] px-5 py-4";

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
      <div className="premium-skeleton mt-3 h-4 w-80 max-w-full rounded-[6px]" />
      {Array.from({ length: blocks }).map((_, i) => (
        <div key={i} className="mt-8">
          <div className="premium-skeleton h-5 w-56 max-w-full rounded-[6px]" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: rows }).map((__, j) => (
              <div key={j} className="flex gap-3">
                <div className="premium-skeleton h-4 w-1/3 min-w-0 rounded-[6px]" />
                <div className="premium-skeleton h-4 min-w-0 flex-1 rounded-[6px]" />
                <div className="premium-skeleton h-4 min-w-0 flex-1 rounded-[6px]" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Esqueleto de una tabla dentro de su superficie corporativa. Misma estructura
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
      <div>
        <div>
          <div className="min-w-0 flex-1">
            <div className="premium-skeleton h-4 w-1/2 max-w-[16rem] rounded-[6px]" />
            <div className="premium-skeleton mt-2 h-3 w-2/3 max-w-[22rem] rounded-[6px]" />
          </div>
        </div>
        <div className="socideas-table-shell__scroll">
          <div className="p-3">
            {Array.from({ length: rows }).map((_, i) => (
              <div key={i} className="flex gap-3 py-2">
                {Array.from({ length: cols }).map((__, j) => (
                  <div
                    key={j}
                    className={`premium-skeleton h-4 min-w-0 rounded-[6px] ${
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
      className="cursor-help font-medium underline decoration-dotted underline-offset-2"
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
    <div className={PENDING_PANEL} data-state="pending" role="status">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="type-h4 text-[var(--text-primary)]">{titulo}</p>
        <span className="socideas-badge" data-tone="draft">
          <span aria-hidden="true" className="socideas-badge__dot" />
          Sin datos
        </span>
      </div>
      <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-[var(--text-secondary)]">{mensaje}</p>
      {alternativa && (
        <p className="mt-3 text-sm">
          <Link
            href={alternativa.href}
            className="font-medium text-[var(--text-link)] underline underline-offset-2 hover:text-[var(--text-link-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-focus)]"
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
 * Línea de frescura visible de un bloque: fuente, periodo y fecha de
 * actualización. La fecha nunca se oculta ni se atenúa: si el dato es de
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
  const valor = "font-medium text-[var(--text-secondary)]";
  return (
    <div className="mt-8 border-t border-[var(--border-subtle)] pt-4">
      {(periodo || fuente || fecha) && (
        <p className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[13px] leading-relaxed text-[var(--text-muted)]">
          {fuente && (
            <span>
              Fuente: <span className={valor}>{fuente}</span>
            </span>
          )}
          {periodo && (
            <span>
              Periodo: <span className={`${valor} tabular-nums`}>{periodo}</span>
            </span>
          )}
          {fecha && (
            <span>
              Actualizado:{" "}
              {fecha.iso ? (
                <time dateTime={fecha.iso} className={valor}>
                  {fecha.texto}
                </time>
              ) : (
                <span className={valor}>{fecha.texto}</span>
              )}
            </span>
          )}
        </p>
      )}
      {nota && (
        <p className="mt-1 max-w-[70ch] text-[13px] leading-relaxed text-[var(--text-muted)]">{nota}</p>
      )}
    </div>
  );
}

/** Alias nominal alternativo (mismas props) por si el coordinador busca «BlockMeta». */
export const BlockMeta = FreshnessLine;
