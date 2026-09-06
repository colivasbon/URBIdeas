/**
 * Layout reusable tabla + visualización. En ≥1280px la tabla ocupa 64–70% y el
 * rail 30–36% (variante `half`: 44–50% / 50–56% para tabla compacta + gráfico
 * protagonista); en tablet/móvil se apila (tabla primero, rail debajo solo si hay
 * contenido real, nunca oculto en móvil). Sin rail, la tabla deja respiro
 * editorial en xl (variante bare, máx. 70%). NUNCA muestra gráficos falsos.
 */
export default function TableWorkspace({
  table,
  visual,
  visualLabel,
  layout = "auto",
  uncapped = false,
}: {
  table: React.ReactNode;
  visual?: React.ReactNode;
  visualLabel?: string;
  layout?: "auto" | "half";
  /** Tablas amplias sin gráfico: sin tope del 70 %, a izquierda con scroll-x. */
  uncapped?: boolean;
}) {
  // El reparto 44–50/50–56 solo tiene sentido con gráfico real: sin visual,
  // la tabla ancha (p. ej. renta de un solo año) ocupa todo el ancho disponible.
  const cls = `socideas-workspace${visual ? "" : " socideas-workspace--bare"}${layout === "half" && visual ? " socideas-workspace--half" : ""}${uncapped ? " socideas-workspace--uncapped" : ""}`;
  return (
    <div className={cls}>
      <div className="socideas-workspace__table">{table}</div>
      {visual && (
        <div className="socideas-workspace__rail" aria-label={visualLabel ?? "Visualización asociada"}>
          {visual}
        </div>
      )}
    </div>
  );
}
