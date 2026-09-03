import type { ReactNode } from "react";

export type BlockState = "ok" | "partial" | "pending" | "error";

const LABEL: Record<BlockState, string> = {
  ok: "Disponible",
  partial: "Parcial",
  pending: "Pendiente",
  error: "No disponible",
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
    <div className="ideas-status" data-state={state} role="status">
      <div className="ideas-status__head">
        <p className="ideas-status__title">{titulo}</p>
        <span className="ideas-status__badge">{LABEL[state]}</span>
      </div>
      <div className="ideas-status__body">{children}</div>
      {fuente && <p className="ideas-status__source">{fuente}</p>}
    </div>
  );
}
