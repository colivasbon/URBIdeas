import Link from "next/link";
import { AMBITO_LABEL, AMBITO_OPCIONES } from "@/lib/socideas-scope";
import type { AmbitoTerritorial } from "@/lib/socideas";

/**
 * Selector de ÁMBITO territorial para toda la ficha. Persiste en `?ambito=`
 * (junto a `?hoja=`) para que sobreviva al cambio de pestaña, igual que la
 * navegación por hojas. Un ámbito sin datos publicados se muestra deshabilitado
 * (nunca se pinta un 0): la disponibilidad la decide el envelope.
 */
export function AmbitoSelector({
  codigoINE,
  hoja,
  ambito,
  disponibles,
}: {
  codigoINE: string;
  hoja: string;
  ambito: AmbitoTerritorial;
  disponibles?: AmbitoTerritorial[];
}) {
  const href = (opt: AmbitoTerritorial): string => {
    const p = new URLSearchParams();
    if (hoja && hoja !== "demografia") p.set("hoja", hoja);
    p.set("ambito", opt);
    const qs = p.toString();
    return `/socideas/${codigoINE}${qs ? `?${qs}` : ""}`;
  };
  return (
    <nav aria-label="Ámbito territorial" className="mb-6 flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-[var(--text-secondary)]">Ámbito</span>
      <div className="flex flex-wrap gap-1">
        {AMBITO_OPCIONES.map((opt) => {
          const activo = opt === ambito;
          const permitido = opt === "municipio" || !disponibles || disponibles.includes(opt);
          const base =
            "rounded-[6px] border px-3 py-1 text-xs tabular-nums transition-colors";
          if (!permitido) {
            return (
              <span
                key={opt}
                aria-disabled="true"
                title={`Sin datos publicados a este ámbito para este indicador`}
                className={`${base} cursor-not-allowed border-[var(--border-subtle)] text-[var(--text-muted)] opacity-60`}
              >
                {AMBITO_LABEL[opt]}
              </span>
            );
          }
          return (
            <Link
              key={opt}
              href={href(opt)}
              aria-current={activo ? "page" : undefined}
              className={`${base} ${
                activo
                  ? "border-[var(--text-primary)] text-[var(--text-primary)]"
                  : "border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)]"
              }`}
            >
              {AMBITO_LABEL[opt]}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
