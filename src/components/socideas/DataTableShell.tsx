import DataTableMeta, { type TableMeta } from "./DataTableMeta";

/**
 * Superficie corporativa común de tabla SOCideas:
 * título + toolbar / metadata rail / tabla con scroll-x / nota metodológica.
 * Radio 6px, ritmo título→meta 8–12px, meta→tabla 12–16px, tabla→nota 10–14px.
 * Presentacional: no toca datos, lógica ni semántica de la tabla hija.
 */
export default function DataTableShell({
  title,
  subtitle,
  meta,
  toolbar,
  tableLabel,
  maxHeight,
  footnote,
  children,
}: {
  title: string;
  subtitle?: string;
  meta?: TableMeta;
  toolbar?: React.ReactNode;
  tableLabel?: string;
  maxHeight?: string;
  footnote?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="socideas-table-block">
      <div className="socideas-table-shell">
        <div className="socideas-table-shell__head">
          <div className="min-w-0">
            <h3 className="socideas-table-shell__title">{title}</h3>
            {subtitle && <p className="socideas-table-shell__subtitle">{subtitle}</p>}
          </div>
          {toolbar}
        </div>
        {meta && (
          <div className="socideas-table-shell__meta">
            <DataTableMeta meta={meta} />
          </div>
        )}
        <div
          className="socideas-table-shell__scroll"
          role="region"
          aria-label={`Tabla: ${tableLabel ?? title}`}
          tabIndex={0}
          style={maxHeight ? { maxHeight, overflowY: "auto" } : undefined}
        >
          {children}
        </div>
        {footnote && <div className="socideas-table__footnote">{footnote}</div>}
      </div>
    </div>
  );
}
