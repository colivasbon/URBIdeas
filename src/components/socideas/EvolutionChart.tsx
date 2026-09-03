interface Punto {
  anio: number;
  valor: number;
}

export interface SerieEvo {
  clave: string;
  etiqueta: string;
  color: string;
  puntos: Punto[];
}

// Gráfico de línea SVG propio (sin dependencias) con varias series.
// Incluye tabla de datos asociada en el componente padre (accesibilidad).
export default function EvolutionChart({ series, id }: { series: SerieEvo[]; id: string }) {
  const activas = series.filter((s) => s.puntos.length > 0);
  if (activas.length === 0) {
    return (
      <p className="text-sm text-[var(--color-text-muted)]">
        Sin datos para el período y los ámbitos seleccionados.
      </p>
    );
  }
  const W = 640;
  const H = 220;
  const PAD = { l: 56, r: 12, t: 12, b: 28 };
  const todos = activas.flatMap((s) => s.puntos.map((p) => p.valor));
  const min = Math.min(...todos);
  const max = Math.max(...todos);
  const span = max - min || 1;
  const anios = [...new Set(activas.flatMap((s) => s.puntos.map((p) => p.anio)))].sort((a, b) => a - b);
  const x = (anio: number) =>
    anios.length === 1
      ? PAD.l + (W - PAD.l - PAD.r) / 2
      : PAD.l + ((anio - anios[0]) / (anios[anios.length - 1] - anios[0])) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - min) / span) * (H - PAD.t - PAD.b);
  const ticks = [0, 1, 2, 3, 4].map((t) => min + (span * t) / 4);

  return (
    <figure>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-labelledby={`${id}-title`}
      >
        <title id={`${id}-title`}>
          {`Evolución de la población: ${activas.map((s) => s.etiqueta).join(", ")}`}
        </title>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--color-border-subtle)" strokeWidth={1} />
            <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--color-text-muted)">
              {Math.round(t).toLocaleString("es-ES")}
            </text>
          </g>
        ))}
        {activas.map((s) => {
          const path = s.puntos
            .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.anio).toFixed(1)},${y(p.valor).toFixed(1)}`)
            .join(" ");
          return (
            <g key={s.clave}>
              <path d={path} fill="none" stroke={s.color} strokeWidth={s.clave === "municipio" ? 2.5 : 1.8} strokeLinejoin="round" />
              {s.puntos.map((p) => (
                <circle key={`${s.clave}-${p.anio}`} cx={x(p.anio)} cy={y(p.valor)} r={s.clave === "municipio" ? 3.5 : 2.5} fill={s.color}>
                  <title>{`${s.etiqueta} ${p.anio}: ${p.valor.toLocaleString("es-ES")}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
        {anios
          .filter((_, i) => i === 0 || i === anios.length - 1 || i % Math.ceil(anios.length / 6) === 0)
          .map((a) => (
            <text key={a} x={x(a)} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--color-text-muted)">
              {a}
            </text>
          ))}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {activas.map((s) => (
          <span key={s.clave} className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
            <span aria-hidden="true" className="inline-block h-0.5 w-4" style={{ background: s.color }} />
            {s.etiqueta}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
