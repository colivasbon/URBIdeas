interface Grupo {
  tramo: string;
  hombres: number;
  mujeres: number;
}

// Pirámide de población con barras horizontales (sin dependencias).
export default function PyramidChart({ grupos, anio }: { grupos: Grupo[]; anio: number | null }) {
  if (grupos.length === 0) {
    return (
      <p className="text-sm text-[var(--color-text-muted)]">
        Pirámide no disponible para este municipio.
      </p>
    );
  }
  const max = Math.max(...grupos.flatMap((g) => [g.hombres, g.mujeres]), 1);
  return (
    <div role="img" aria-label={`Pirámide de población${anio ? ` ${anio}` : ""} por grupos de edad y sexo`}>
      <div className="grid grid-cols-[3rem_1fr_1fr_3rem] items-center gap-x-2 text-[11px] font-semibold text-[var(--color-text-muted)] mb-2" aria-hidden="true">
        <span className="text-right">H</span>
        <span className="text-right">Hombres</span>
        <span>Mujeres</span>
        <span>M</span>
      </div>
      <ul className="flex flex-col gap-1">
        {grupos.map((g) => (
          <li key={g.tramo} className="grid grid-cols-[3rem_1fr_1fr_3rem] items-center gap-x-2">
            <span className="text-right text-[11px] tabular-nums text-[var(--color-text-secondary)]">
              {g.hombres.toLocaleString("es-ES")}
            </span>
            <span className="flex justify-end h-4 rounded-l bg-[var(--color-input-bg)] overflow-hidden">
              <span
                className="h-full bg-[var(--color-primary)] rounded-l"
                style={{ width: `${(g.hombres / max) * 100}%` }}
              />
            </span>
            <span className="flex justify-start h-4 rounded-r bg-[var(--color-input-bg)] overflow-hidden">
              <span
                className="h-full bg-[var(--color-secondary)] rounded-r"
                style={{ width: `${(g.mujeres / max) * 100}%` }}
              />
            </span>
            <span className="text-[11px] tabular-nums text-[var(--color-text-secondary)]">
              {g.mujeres.toLocaleString("es-ES")}
            </span>
            <span className="col-span-4 text-center text-[11px] text-[var(--color-text-muted)] -mt-0.5 mb-1">
              {g.tramo} años
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
