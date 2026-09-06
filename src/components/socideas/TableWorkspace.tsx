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
}: {
  table: React.ReactNode;
  visual?: React.ReactNode;
  visualLabel?: string;
  layout?: "auto" | "half";
}) {
  const cls = `socideas-workspace${visual ? "" : " socideas-workspace--bare"}${layout === "half" ? " socideas-workspace--half" : ""}`;
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
