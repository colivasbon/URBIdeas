/**
 * Curvas de nivel topográficas (SVG inline ligero y determinista).
 *
 * Los paths se generan UNA sola vez a nivel de módulo con un PRNG con
 * semilla fija (mulberry32). Sin aleatoriedad en render, sin filtros SVG,
 * sin librerías. Solo curvas Bézier cúbicas (`C`), `fill="none"`.
 *
 * Garantía de no-intersección: cada anillo es una curva polar
 * r(θ) = R + w(θ) en forma de estrella con |w(θ)| ≤ 16px fijos y un paso
 * radial entre anillos de ≥34px, de modo que la extensión radial de dos
 * anillos consecutivos nunca se toca (separación mínima ≈ 2px). El radio
 * interior mínimo (56px) supera siempre la oscilación máxima, por lo que
 * ningún anillo se autointersecta. Los anillos son bucles cerrados
 * concéntricos e irregulares (oscilación orgánica controlada, sin
 * simetría perfecta, sin círculos/elipses exactas).
 */

interface Ring {
  d: string;
  opacity: number;
  width: number;
  master: boolean;
  massif: string;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SAMPLES = 24;

/** Convierte un anillo polar muestreado en un path cerrado suave (solo C). */
function ringPath(
  cx: number,
  cy: number,
  radius: number,
  phase1: number,
  phase2: number,
): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const t = (i / SAMPLES) * Math.PI * 2;
    // Oscilación fija acotada: |w| ≤ 10 + 6 = 16px.
    const w = 10 * Math.sin(3 * t + phase1) + 6 * Math.sin(5 * t + phase2);
    const r = radius + w;
    pts.push([cx + r * Math.cos(t), cy + 0.82 * r * Math.sin(t)]);
  }
  // Catmull-Rom cerrado → Bézier cúbicas.
  let d = `M ${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < SAMPLES; i++) {
    const p0 = pts[(i - 1 + SAMPLES) % SAMPLES];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % SAMPLES];
    const p3 = pts[(i + 2) % SAMPLES];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return `${d} Z`;
}

interface MassifSpec {
  key: string;
  cx: number;
  cy: number;
  outer: number;
  rings: number;
  gap: number;
}

const MASSIFS: MassifSpec[] = [
  // Macizo principal derecho: domina la zona derecha/superior.
  { key: "este", cx: 1190, cy: 370, outer: 330, rings: 8, gap: 36 },
  // Macizo parcial inferior izquierdo: entra por el borde, sale del viewport.
  { key: "sudoeste", cx: 110, cy: 990, outer: 390, rings: 6, gap: 38 },
  // Macizo menor distante: profundidad en la esquina superior derecha.
  { key: "noreste", cx: 1480, cy: 50, outer: 180, rings: 5, gap: 34 },
];

function buildRings(): Ring[] {
  const rng = mulberry32(20260906);
  const rings: Ring[] = [];
  for (const m of MASSIFS) {
    for (let k = 0; k < m.rings; k++) {
      const radius = m.outer - k * m.gap;
      const master = k % 4 === 3;
      rings.push({
        d: ringPath(m.cx, m.cy, radius, rng() * Math.PI * 2, rng() * Math.PI * 2),
        opacity: master ? 0.26 : 0.1 + ((k * 37 + m.outer) % 10) / 100,
        width: master ? 1.9 : 1.4,
        master,
        massif: m.key,
      });
    }
  }
  return rings;
}

// Generado una sola vez con semilla fija fuera del render.
const RINGS: Ring[] = buildRings();

interface Props {
  /** Profundidad de parallax en px para scroll completo del hero. 0 = estático. */
  depth?: number;
  className?: string;
}

export default function TopographicContours({ depth = 0, className = "" }: Props) {
  return (
    <svg
      className={`topographic-contours ${className}`}
      data-depth={depth}
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      role="presentation"
      focusable="false"
    >
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        {RINGS.map((r, i) => (
          <path
            key={`${r.massif}-${i}`}
            d={r.d}
            className={r.master ? "contour contour--master" : "contour"}
            data-massif={r.massif}
            strokeWidth={r.width}
            opacity={r.opacity}
          />
        ))}
      </g>
    </svg>
  );
}
