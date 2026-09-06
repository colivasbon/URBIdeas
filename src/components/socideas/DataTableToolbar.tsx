"use client";

import CopyTableButton from "./CopyTableButton";
import { FuenteOficial } from "./ConsultaTools";

/**
 * Toolbar compacta de tabla: solo acciones con funcionalidad real.
 * Misma altura (2.25rem), radio 6px, icono + texto. Nunca botones falsos.
 */
export default function DataTableToolbar({
  tableId,
  sourceUrl,
  onDownloadCsv,
  downloadLabel = "Descargar CSV",
  extra,
}: {
  tableId?: string;
  sourceUrl?: string | null;
  onDownloadCsv?: () => void;
  downloadLabel?: string;
  extra?: React.ReactNode;
}) {
  if (!tableId && !sourceUrl && !onDownloadCsv && !extra) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Acciones de la tabla">
      {tableId && <CopyTableButton tableId={tableId} label="Copiar" />}
      {sourceUrl && <FuenteOficial url={sourceUrl} className="socideas-btn" />}
      {onDownloadCsv && (
        <button type="button" onClick={onDownloadCsv} className="socideas-btn socideas-btn--primary">
          <svg className="socideas-btn__icon" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          {downloadLabel}
        </button>
      )}
      {extra}
    </div>
  );
}
