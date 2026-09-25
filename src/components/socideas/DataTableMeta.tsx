import DataStatusBadge, { type DataEstado } from "./DataStatusBadge";

/**
 * Metadata rail compacta y legible (≥12px móvil, 13px escritorio):
 * Fuente · Período · Cobertura · Estado. Solo muestra valores existentes;
 * la ausencia se omite (se explica en el panel de cobertura, no aquí).
 */
export interface TableMeta {
  fuente?: string | null;
  periodo?: string | null;
  cobertura?: string | null;
  estado?: DataEstado | null;
  unidad?: string | null;
}

export default function DataTableMeta({ meta }: { meta: TableMeta }) {
  const items: React.ReactNode[] = [];
  if (meta.fuente) {
    items.push(
      <span key="f">
        <span className="socideas-table-meta__label">Fuente:</span> {meta.fuente}
      </span>,
    );
  }
  if (meta.periodo) {
    items.push(
      <span key="p">
        <span className="socideas-table-meta__label">Período:</span> {meta.periodo}
      </span>,
    );
  }
  if (meta.cobertura) {
    items.push(
      <span key="c">
        <span className="socideas-table-meta__label">Cobertura:</span> {meta.cobertura}
      </span>,
    );
  }
  if (meta.unidad) {
    items.push(
      <span key="u">
        <span className="socideas-table-meta__label">Unidad:</span> {meta.unidad}
      </span>,
    );
  }
  if (meta.estado) {
    items.push(<DataStatusBadge key="e" estado={meta.estado} />);
  }
  if (items.length === 0) return null;
  return (
    <p className="socideas-table-meta" aria-label="Fuente, período, cobertura y estado de la tabla">
      {items.map((it, i) => (
        <span key={i} style={{ display: "contents" }}>
          {i > 0 && (
            <span aria-hidden="true" className="socideas-table-meta__sep">
              ·
            </span>
          )}
          {it}
        </span>
      ))}
    </p>
  );
}
