import type { ReactNode } from "react";

/** Primitivas de presentación documental (estilo memoria de PTM).
 *  Sin estado: se pueden usar desde Server Components. */

/** Id de ancla de una sección: «Anexo II» → «sec-Anexo-II». */
export function anclaSeccion(numero: string): string {
  return `sec-${numero.trim().replace(/\s+/g, "-")}`;
}

export function SeccionDoc({
  numero,
  titulo,
  children,
}: {
  numero: string;
  titulo: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-10 scroll-mt-24" id={anclaSeccion(numero)}>
      <h2 className="flex items-baseline gap-3 border-b border-[var(--border-subtle)] pb-2">
        <span className="tnum text-[var(--moss-ink)] font-semibold">{numero}</span>
        <span className="type-h3 text-[var(--text-primary)]">{titulo}</span>
      </h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export function SubseccionDoc({
  numero,
  titulo,
  children,
}: {
  numero: string;
  titulo: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-6 scroll-mt-24" id={anclaSeccion(numero)}>
      <h3 className="flex items-baseline gap-2">
        <span className="tnum text-sm text-[var(--text-muted)]">{numero}</span>
        <span className="type-h4 text-[var(--text-primary)]">{titulo}</span>
      </h3>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

export function Prosa({ children }: { children: ReactNode }) {
  return (
    <p className="max-w-[75ch] text-[var(--fs-body)] leading-[var(--lh-body)] text-[var(--text-secondary)]">
      {children}
    </p>
  );
}

export function TablaDoc({
  columnas,
  filas,
  pie,
  vacio = "Sin datos disponibles en esta iteración.",
}: {
  columnas: string[];
  filas: (string | number | null)[][];
  pie?: string;
  vacio?: string;
}) {
  return (
    <figure className="mt-2">
      <div className="overflow-x-auto rounded-[6px] border border-[var(--border-subtle)]">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="bg-[var(--bg-subtle)]">
              {columnas.map((c) => (
                <th
                  key={c}
                  scope="col"
                  className="border-b border-[var(--border-subtle)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 ? (
              <tr>
                <td
                  colSpan={columnas.length}
                  className="px-3 py-4 text-center text-sm text-[var(--text-muted)]"
                >
                  {vacio}
                </td>
              </tr>
            ) : (
              filas.map((fila, i) => (
                <tr key={i} className="border-b border-[var(--border-subtle)] last:border-0">
                  {fila.map((celda, j) => (
                    <td
                      key={j}
                      className={`px-3 py-2 align-top ${j === 0 ? "font-medium text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}
                    >
                      {celda ?? "—"}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {pie && (
        <figcaption className="mt-1 text-xs text-[var(--text-muted)]">{pie}</figcaption>
      )}
    </figure>
  );
}

export function TablaClaveValor({ filas }: { filas: [string, ReactNode][] }) {
  return (
    <div className="overflow-hidden rounded-[6px] border border-[var(--border-subtle)]">
      <table className="w-full border-collapse text-sm">
        <tbody>
          {filas.map(([k, v]) => (
            <tr key={k} className="border-b border-[var(--border-subtle)] last:border-0">
              <th
                scope="row"
                className="w-[42%] bg-[var(--bg-subtle)] px-3 py-2 text-left align-top text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]"
              >
                {k}
              </th>
              <td className="px-3 py-2 align-top text-[var(--text-primary)]">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Carencia({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-[6px] border border-dashed border-[var(--limo)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-muted)]">
      {children}
    </p>
  );
}

export function PieFuente({ children }: { children: ReactNode }) {
  return <p className="text-xs text-[var(--text-muted)]">{children}</p>;
}
