/**
 * Layout reusable tabla + visualización. En ≥1280px la tabla ocupa 64–70% y el
 * rail 30–36%; en tablet/móvil se apila (tabla primero, rail debajo solo si hay
 * contenido real). Sin rail, la tabla deja respiro editorial en xl (variante
 * bare, máx. 70%). NUNCA muestra gráficos falsos: sin `visual` no hay card vacía.
 */
export default function TableWorkspace({
  table,
  visual,
  visualLabel,
}: {
  table: React.ReactNode;
  visual?: React.ReactNode;
  visualLabel?: string;
}) {
  return (
    <div className={`socideas-workspace${visual ? "" : " socideas-workspace--bare"}`}>
      <div className="socideas-workspace__table">{table}</div>
      {visual && (
        <div className="socideas-workspace__rail" aria-label={visualLabel ?? "Visualización asociada"}>
          {visual}
        </div>
      )}
    </div>
  );
}
