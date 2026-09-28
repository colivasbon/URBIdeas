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

/** Trazo por clave: la serie principal continua; las comparativas, discontinuas. */
const DASH: Record<string, string | undefined> = {
  provincia: "6 3",
  ccaa: "2 3",
  espana: "8 3 2 3",
};

/** Series principales (municipio y equivalentes) dibujadas con más peso. */
const esPrincipal = (clave: string) => !(clave in DASH);

// Gráfico de línea SVG propio (sin dependencias) con varias series.
// Incluye tabla de datos asociada en el componente padre (accesibilidad).
export interface ChartPointMeta {
  unidad?: string;
  fuente?: string;
  estado?: string;
}

export default function EvolutionChart({ series, id, pointMeta }: { series: SerieEvo[]; id: string; pointMeta?: ChartPointMeta }) {
  const activas = series.filter((s) => s.puntos.length > 0);
  if (activas.length === 0) {
    return (
      <p className="max-w-[70ch] rounded-[6px] border border-dashed border-[var(--border-default)] px-4 py-3 text-sm text-[var(--text-secondary)]">
        Sin datos para el período y los ámbitos seleccionados. Amplíe el período o active otro ámbito.
      </p>
    );
  }
  const W = 640;
  const H = 220;
  const PAD = { l: 56, r: 12, t: 12, b: 30 };
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
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--border-subtle)" strokeWidth={1} />
            <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" fontSize={12} fill="var(--text-muted)" style={{ fontVariantNumeric: "tabular-nums" }}>
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
              <path d={path} fill="none" stroke={s.color} strokeWidth={esPrincipal(s.clave) ? 2.25 : 1.5} strokeDasharray={DASH[s.clave]} strokeLinejoin="round" />
              {s.puntos.map((p, i) => (
                <circle key={`${s.clave}-${p.anio}-${i}`} cx={x(p.anio)} cy={y(p.valor)} r={esPrincipal(s.clave) ? 3 : 2} fill={s.color}>
                  <title>{`${s.etiqueta} ${p.anio}: ${p.valor.toLocaleString("es-ES")}${pointMeta?.unidad ? ` ${pointMeta.unidad}` : ""}${pointMeta?.fuente ? `. Fuente: ${pointMeta.fuente}` : ""}${pointMeta?.estado ? `. ${pointMeta.estado}` : ""}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
        {anios
          .filter((_, i) => i === 0 || i === anios.length - 1 || i % Math.ceil(anios.length / 6) === 0)
          .map((a) => (
            <text key={a} x={x(a)} y={H - 8} textAnchor="middle" fontSize={12} fill="var(--text-muted)" style={{ fontVariantNumeric: "tabular-nums" }}>
              {a}
            </text>
          ))}
      </svg>
      <figcaption className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {activas.map((s) => (
          <span key={s.clave} className="inline-flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <svg aria-hidden="true" width="20" height="6" viewBox="0 0 20 6" className="shrink-0">
              <line x1="0" x2="20" y1="3" y2="3" stroke={s.color} strokeWidth={esPrincipal(s.clave) ? 2.25 : 1.5} strokeDasharray={DASH[s.clave]} />
            </svg>
            {s.etiqueta}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
