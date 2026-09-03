interface Punto {
  anio: number;
  valor: number;
}

// Gráfico de línea SVG propio (sin dependencias): evolución demográfica.
// Incluye tabla de datos asociada para accesibilidad (ver componente padre).
export default function EvolutionChart({ puntos, id }: { puntos: Punto[]; id: string }) {
  if (puntos.length < 2) {
    return (
      <p className="text-sm text-[var(--color-text-muted)]">
        Evolución no disponible: se necesitan al menos dos años.
      </p>
    );
  }
  const W = 640;
  const H = 220;
  const PAD = { l: 56, r: 12, t: 12, b: 28 };
  const valores = puntos.map((p) => p.valor);
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const span = max - min || 1;
  const x = (i: number) => PAD.l + (i / (puntos.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - min) / span) * (H - PAD.t - PAD.b);
  const path = puntos.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.valor).toFixed(1)}`).join(" ");
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
          {`Evolución de la población entre ${puntos[0].anio} y ${puntos[puntos.length - 1].anio}`}
        </title>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--color-border-subtle)" strokeWidth={1} />
            <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--color-text-muted)">
              {Math.round(t).toLocaleString("es-ES")}
            </text>
          </g>
        ))}
        <path d={path} fill="none" stroke="var(--color-secondary)" strokeWidth={2.5} strokeLinejoin="round" />
        {puntos.map((p, i) => (
          <g key={p.anio}>
            <circle cx={x(i)} cy={y(p.valor)} r={3.5} fill="var(--color-secondary)">
              <title>{`${p.anio}: ${p.valor.toLocaleString("es-ES")}`}</title>
            </circle>
            {(i === 0 || i === puntos.length - 1 || i % Math.ceil(puntos.length / 6) === 0) && (
              <text x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--color-text-muted)">
                {p.anio}
              </text>
            )}
          </g>
        ))}
      </svg>
    </figure>
  );
}
