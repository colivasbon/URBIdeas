import Link from "next/link";
import { FICHA_SHEETS, type FichaSheetKey } from "./ficha-sheets";
import TabPendingIndicator from "./TabPendingIndicator";

/**
 * Navegación por hojas del libro. Sustituye a la antigua cápsula
 * Demografía · Economía · Secciones censales: ahora cada hoja del XLSX tiene su
 * propio apartado. La hoja activa se marca con `aria-current` y color primario;
 * el estado "pendiente" se etiqueta de forma discreta y honesta.
 *
 * No usa estado cliente: los enlaces son navegación de servidor con `Link`.
 */
export default function SheetTabs({
  codigoINE,
  activa,
  searchParams,
}: {
  codigoINE: string;
  activa: FichaSheetKey;
  searchParams: Record<string, string>;
}) {
  const hrefFor = (key: FichaSheetKey): string => {
    const p = new URLSearchParams(searchParams);
    // La hoja manda: se elimina el parámetro histórico `categoria` para no
    // entrar en conflicto con `?hoja=`.
    p.delete("categoria");
    if (key === "demografia") p.delete("hoja");
    else p.set("hoja", key);
    const qs = p.toString();
    return qs ? `/socideas/${codigoINE}?${qs}` : `/socideas/${codigoINE}`;
  };

  return (
    <nav aria-label="Hojas del libro municipal" className="flex flex-wrap gap-2">
      {FICHA_SHEETS.map((s) => {
        const selected = s.key === activa;
        return (
          <Link
            key={s.key}
            href={hrefFor(s.key)}
            aria-current={selected ? "page" : undefined}
            title={s.descripcion}
            className={`inline-flex items-center gap-2 rounded-[6px] border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss-ink)] ${
              selected
                ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                : "border-[var(--color-border-subtle)] bg-[var(--color-card-bg)] text-[var(--color-text-secondary)] hover:border-[var(--color-border)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            <span
              aria-hidden="true"
              className={`font-mono text-[10px] tabular-nums ${
                selected ? "text-white/70" : "text-[var(--color-text-muted)]"
              }`}
            >
              {s.code}
            </span>
            <span>{s.label}</span>
            <TabPendingIndicator />
            {s.estado === "pendiente" && (
              <span
                className={`rounded-[4px] px-1.5 py-0.5 text-[10px] font-semibold ${
                  selected ? "bg-white/15 text-white/80" : "bg-[var(--color-input-bg)] text-[var(--color-text-muted)]"
                }`}
              >
                pronto
              </span>
            )}
          </Link>
        );
      })}
      <Link
        href={`/socideas/${codigoINE}/secciones-censales`}
        title="Geometría de secciones censales del municipio"
        className="inline-flex items-center gap-2 rounded-[6px] border border-dashed border-[var(--color-border)] bg-[var(--color-card-bg)] px-3 py-2 text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss-ink)]"
      >
        <span aria-hidden="true" className="font-mono text-[10px] text-[var(--color-text-muted)]">
          SC
        </span>
        Secciones censales
        <TabPendingIndicator />
      </Link>
    </nav>
  );
}
