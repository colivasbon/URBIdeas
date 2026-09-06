/**
 * Badge unificado de estado de dato/tabla SOCideas.
 * Punto + texto siempre (nunca solo color). Amarillo solo para alerta genuina,
 * rojo solo para error real. Legible en modo oscuro y claro.
 */
export type DataEstado =
  | "consolidado"
  | "provisional"
  | "parcial"
  | "pendiente"
  | "sin-cobertura"
  | "secreto"
  | "no-comparable"
  | "no-aplicable"
  | "error";

const CONFIG: Record<DataEstado, { tono: "mineral" | "positive" | "draft" | "alert" | "error" | undefined; etiqueta: string }> = {
  consolidado: { tono: "mineral", etiqueta: "Consolidado" },
  provisional: { tono: "draft", etiqueta: "Provisional" },
  parcial: { tono: "positive", etiqueta: "Cobertura parcial" },
  pendiente: { tono: undefined, etiqueta: "Pendiente" },
  "sin-cobertura": { tono: undefined, etiqueta: "Sin cobertura" },
  secreto: { tono: undefined, etiqueta: "Secreto estadístico" },
  "no-comparable": { tono: undefined, etiqueta: "No comparable" },
  "no-aplicable": { tono: undefined, etiqueta: "No aplicable" },
  error: { tono: "error", etiqueta: "Error" },
};

export default function DataStatusBadge({ estado }: { estado: DataEstado }) {
  const c = CONFIG[estado];
  return (
    <span className="socideas-badge" data-tone={c.tono} role="status">
      <span aria-hidden="true" className="socideas-badge__dot" />
      {c.etiqueta}
    </span>
  );
}
