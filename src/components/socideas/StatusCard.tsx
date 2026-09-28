import type { ReactNode } from "react";

export type BlockState = "ok" | "partial" | "pending" | "error";

const LABEL: Record<BlockState, string> = {
  ok: "Disponible",
  partial: "Parcial",
  pending: "Pendiente",
  error: "No disponible",
};

const TONE: Record<BlockState, "positive" | "mineral" | "draft" | "error"> = {
  ok: "positive",
  partial: "mineral",
  pending: "draft",
  error: "error",
};

/** Tarjeta de estado inequívoca para bloques con o sin datos.
 * Nunca usa el color como único indicador: siempre hay etiqueta textual. */
export default function StatusCard({
  state,
  titulo,
  children,
  fuente,
}: {
  state: BlockState;
  titulo: string;
  children: ReactNode;
  fuente?: string;
}) {
  return (
    <div
      className={`rounded-[6px] border px-5 py-4 ${
        state === "ok" ? "border-[var(--border-subtle)]" : "border-dashed border-[var(--border-default)]"
      }`}
      data-state={state}
      role="status"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="type-h4 text-[var(--text-primary)]">{titulo}</p>
        <span className="socideas-badge" data-tone={TONE[state]}>
          <span aria-hidden="true" className="socideas-badge__dot" />
          {LABEL[state]}
        </span>
      </div>
      <div className="mt-2 max-w-[70ch] text-sm leading-relaxed text-[var(--text-secondary)]">{children}</div>
      {fuente && <p className="mt-3 max-w-[70ch] text-[13px] leading-relaxed text-[var(--text-muted)]">{fuente}</p>}
    </div>
  );
}
