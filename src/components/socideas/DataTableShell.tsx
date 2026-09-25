import DataTableMeta, { type TableMeta } from "./DataTableMeta";

/**
 * Superficie corporativa común de tabla SOCideas:
 * título + toolbar / metadata rail / tabla con scroll-x / nota metodológica.
 * Radio 6px, ritmo título→meta 8–12px, meta→tabla 12–16px, tabla→nota 10–14px.
 * Presentacional: no toca datos, lógica ni semántica de la tabla hija.
 *
 * v2.3 — responsividad y accesibilidad:
 * - El contenedor de la tabla desplaza en horizontal (`overflow-x-auto`, con
 *   la clase de sistema `.socideas-table-shell__scroll` como red de
 *   seguridad): a 375 px la tabla hace scroll en vez de comprimir columnas
 *   hasta la ilegibilidad (las cabeceras con `white-space: nowrap` marcan el
 *   ancho mínimo natural de la tabla).
 * - `min-w-0` en el bloque evita que un padre flex/grid inflen la página.
 * - Alternativa accesible: región con nombre (`role="region"` + `aria-label`,
 *   enfocable para operar el scroll con teclado) más un `caption` sr-only con
 *   título, fuente, período y cobertura.
 * - Orden de columnas priorizado (nombre/concepto → valor → fuente) se
 *   declara en cada tabla hija; este shell no reordena contenido.
 */
export default function DataTableShell({
  title,
  subtitle,
  meta,
  toolbar,
  tableLabel,
  maxHeight,
  footnote,
  narrow,
  series,
  children,
}: {
  title: string;
  subtitle?: string;
  meta?: TableMeta;
  toolbar?: React.ReactNode;
  tableLabel?: string;
  maxHeight?: string;
  footnote?: React.ReactNode;
  /** Tablas de 2–3 columnas: tope 560px, alineadas a izquierda. */
  narrow?: boolean;
  /** Series largas: filas compactas 34–38px. */
  series?: boolean;
  children?: React.ReactNode;
}) {
  const cls = `socideas-table-shell${narrow ? " socideas-table-shell--narrow" : ""}${series ? " socideas-table-shell--series" : ""}`;
  const nombreTabla = tableLabel ?? title;
  return (
    <div className="socideas-table-block min-w-0">
      <div className={cls}>
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
          className="socideas-table-shell__scroll overflow-x-auto"
          role="region"
          aria-label={`Tabla: ${nombreTabla}`}
          tabIndex={0}
          style={maxHeight ? { maxHeight, overflowY: "auto" } : undefined}
        >
          <p className="sr-only">
            {`Tabla «${nombreTabla}».`}
            {subtitle ? ` ${subtitle}.` : ""}
            {meta?.fuente ? ` Fuente: ${meta.fuente}.` : ""}
            {meta?.periodo ? ` Período: ${meta.periodo}.` : ""}
            {meta?.cobertura ? ` Cobertura: ${meta.cobertura}.` : ""}
            {" En pantallas estrechas la tabla desplaza en horizontal para no comprimir las columnas."}
          </p>
          {children}
        </div>
        {footnote && <div className="socideas-table__footnote">{footnote}</div>}
      </div>
    </div>
  );
}
