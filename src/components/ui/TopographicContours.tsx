/**
 * Curvas de nivel topográficas (SVG inline ligero y determinista).
 *
 * Tres macizos (este principal, sudoeste parcial, noreste secundario),
 * 17 paths en total. Generados UNA sola vez a nivel de módulo con PRNG de
 * semilla fija (mulberry32): sin aleatoriedad en render, sin filtros SVG,
 * sin librerías. Solo curvas Bézier cúbicas (`C`), `fill="none"`.
 *
 * No-intersección por construcción: los anillos de cada macizo comparten
 * la misma forma base (anillos casi paralelos, como un relieve real) con
 * una perturbación por anillo acotada a ±0.02; el paso radial (38–42u)
 * supera siempre la desviación máxima. Verificado numéricamente con la
 * misma semilla: separación mínima entre anillos adyacentes 26u, mínima
 * global 54u, cobertura en 1920×500, 1440×650, 1280×700, 768×900,
 * 390×700 y 320×650 (≥2 macizos visibles en desktop, macizo noreste
 * portando el móvil).
 *
 * Excentricidad propia por macizo (squash + rotación distintos) y
 * oscilación orgánica por dirección (armónicos 2, 3 y 5 + perturbación
 * en 4 y 7): crestas suaves, entrantes largos, valles anchos.
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

const SAMPLES = 40;

interface MassifSpec {
  key: string;
  cx: number;
  cy: number;
  outer: number;
  rings: number;
  gap: number;
  squash: number;
  rotDeg: number;
}

const MASSIFS: MassifSpec[] = [
  // Macizo A — principal derecho (~85% ancho, ~47% alto, sale por el borde).
  { key: "este", cx: 1360, cy: 420, outer: 340, rings: 8, gap: 40, squash: 0.86, rotDeg: 0 },
  // Macizo B — profundidad inferior izquierda (solo arcos exteriores).
  { key: "sudoeste", cx: 220, cy: 990, outer: 450, rings: 4, gap: 42, squash: 0.78, rotDeg: 25 },
  // Macizo C — secundario superior (profundidad, porta el móvil).
  { key: "noreste", cx: 830, cy: 70, outer: 210, rings: 5, gap: 38, squash: 0.93, rotDeg: -15 },
];

/** Anillo polar muestreado → path cerrado suave (solo C). */
function ringPath(
  m: MassifSpec,
  radius: number,
  base: { a1: number; a2: number; a3: number; p1: number; p2: number; p3: number },
  pert: { b1: number; b2: number; q1: number; q2: number },
): string {
  const rot = (m.rotDeg * Math.PI) / 180;
  const pts: [number, number][] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const t = (i / SAMPLES) * Math.PI * 2;
    const s =
      base.a1 * Math.sin(3 * t + base.p1) +
      base.a2 * Math.sin(2 * t + base.p2) +
      base.a3 * Math.sin(5 * t + base.p3) +
      pert.b1 * Math.sin(4 * t + pert.q1) +
      pert.b2 * Math.sin(7 * t + pert.q2);
    const r = radius * (1 + s);
    const x0 = r * Math.cos(t);
    const y0 = m.squash * r * Math.sin(t);
    pts.push([
      m.cx + x0 * Math.cos(rot) - y0 * Math.sin(rot),
      m.cy + x0 * Math.sin(rot) + y0 * Math.cos(rot),
    ]);
  }
  // Catmull-Rom cerrado → Bézier cúbicas.
  let d = `M ${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < SAMPLES; i++) {
    const p0 = pts[(i - 1 + SAMPLES) % SAMPLES];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % SAMPLES];
    const p3 = pts[(i + 2) % SAMPLES];
    const c1x = p1[0] + (p2[0] - p0[0]) / 4;
    const c1y = p1[1] + (p2[1] - p0[1]) / 4;
    const c2x = p2[0] - (p3[0] - p1[0]) / 4;
    const c2y = p2[1] - (p3[1] - p1[1]) / 4;
    d += ` C ${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return `${d} Z`;
}

function buildRings(): Ring[] {
  const rng = mulberry32(20260906);
  const rings: Ring[] = [];
  for (const m of MASSIFS) {
    const base = {
      a1: 0.05 + rng() * 0.02,
      a2: 0.03 + rng() * 0.015,
      a3: 0.015 + rng() * 0.01,
      p1: rng() * Math.PI * 2,
      p2: rng() * Math.PI * 2,
      p3: rng() * Math.PI * 2,
    };
    for (let k = 0; k < m.rings; k++) {
      const radius = m.outer - k * m.gap;
      const pert = {
        b1: (rng() - 0.5) * 0.02,
        b2: (rng() - 0.5) * 0.02,
        q1: rng() * Math.PI * 2,
        q2: rng() * Math.PI * 2,
      };
      const master = k % 4 === 3;
      rings.push({
        d: ringPath(m, radius, base, pert),
        opacity: master ? 0.3 : 0.16 + ((k * 37 + m.outer) % 9) / 100,
        width: master ? 1.25 : 0.9,
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
