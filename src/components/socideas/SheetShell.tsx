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
