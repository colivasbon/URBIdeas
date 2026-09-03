"use client"

import { useEffect, useMemo, useRef, useState } from "react"

const W = 1200
const H = 1000

/** Genera una línea ondulada paralela: recorre todo el ancho con doble seno */
function wavyLine(baseY: number, phase: number, amp1: number, amp2: number): string {
  const step = 24
  let d = `M -60 ${(baseY + amp1 * Math.sin((-60 * 0.008) + phase) + amp2 * Math.sin((-60 * 0.021) + phase * 1.7)).toFixed(1)}`
  for (let x = -60 + step; x <= W + 60; x += step) {
    const y = baseY + amp1 * Math.sin(x * 0.008 + phase) + amp2 * Math.sin(x * 0.021 + phase * 1.7)
    d += ` L ${x} ${y.toFixed(1)}`
  }
  return d
}

/** Anillo concéntrico orgánico (no círculo perfecto) centrado en cx, cy */
function organicRing(cx: number, cy: number, r: number, wobble: number, seed: number): string {
  const pts: string[] = []
  const n = 48
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2
    const rr = r + wobble * Math.sin(a * 3 + seed) + wobble * 0.5 * Math.sin(a * 5 + seed * 2)
    const x = cx + rr * Math.cos(a)
    const y = cy + rr * Math.sin(a) * 0.92
    pts.push(`${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`)
  }
  return pts.join(" ") + " Z"
}

export default function HeroParallax({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const linesRef = useRef<HTMLDivElement>(null)
  const summitRef = useRef<HTMLDivElement>(null)

  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches)
  }, [])

  useEffect(() => {
    const el = containerRef.current
    const lines = linesRef.current
    const summit = summitRef.current
    if (!el || !lines || !summit) return
    if (reducedMotion) return

    let ticking = false

    function apply() {
      const rect = el!.getBoundingClientRect()
      const vh = window.innerHeight
      const total = el!.offsetHeight + vh
      const progress = Math.max(0, Math.min(1, (vh - rect.top) / total))
      const scrollOffset = progress * 220

      // Parallax exclusivo por scroll: cada capa baja a distinta velocidad
      lines!.style.transform = `translate3d(0, ${(scrollOffset * 0.4).toFixed(1)}px, 0)`
      summit!.style.transform = `translate3d(0, ${(scrollOffset * 0.2).toFixed(1)}px, 0)`
      ticking = false
    }

    function onScroll() {
      if (!ticking) {
        ticking = true
        requestAnimationFrame(apply)
      }
    }

    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll, { passive: true })
    onScroll()

    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
    }
  }, [reducedMotion])

  // Líneas de contorno paralelas, espaciado uniforme, como la referencia
  const contourLines = useMemo(() => {
    const lines: { d: string; key: number }[] = []
    const spacing = 56
    let i = 0
    for (let y = -120; y < H + 140; y += spacing, i++) {
      lines.push({
        key: i,
        d: wavyLine(y, i * 0.42, 26, 10),
      })
    }
    return lines
  }, [])

  // Anillos de la cima, del exterior al interior
  const summitRings = useMemo(() => {
    const cx = 830
    const cy = 640
    return [300, 252, 206, 162, 120, 82, 48, 22].map((r, idx) => ({
      key: idx,
      d: organicRing(cx, cy, r, 10 + idx * 0.8, idx * 1.31),
    }))
  }, [])

  return (
    <div ref={containerRef} className="hero-parallax">
      {/* Retícula técnica (izquierda) */}
      <div className="hero-grid" aria-hidden="true">
        <svg className="hero-grid-svg" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" preserveAspectRatio="none">
          <defs>
            <pattern id="heroGridPattern" width="144" height="144" patternUnits="userSpaceOnUse">
              <rect width="144" height="144" fill="none" />
              <path d="M 36 0 V 144 M 72 0 V 144 M 108 0 V 144 M 0 36 H 144 M 0 72 H 144 M 0 108 H 144" fill="none" stroke="#4A5E42" strokeWidth="0.5" />
              <path d="M 144 0 H 0 V 144" fill="none" stroke="#5A6E52" strokeWidth="1.1" />
              <circle cx="0" cy="0" r="0.9" fill="#6A7E5A" />
              <circle cx="72" cy="72" r="0.7" fill="#6A7E5A" opacity="0.6" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#heroGridPattern)" />
        </svg>
      </div>

      {/* Fondo topográfico estilo referencia: malla ondulada + cima */}
      <div className="hero-topo" aria-hidden="true">
        {/* Capa de curvas onduladas paralelas */}
        <div ref={linesRef} className="tp-layer tp-lines">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
            <g fill="none" strokeLinecap="round" strokeLinejoin="round">
              {contourLines.map((l) => (
                <path key={l.key} d={l.d} stroke="#5A6A52" strokeWidth="1.6" />
              ))}
            </g>
          </svg>
        </div>

        {/* Capa de la cima: anillos concéntricos descentrados */}
        <div ref={summitRef} className="tp-layer tp-summit">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
            <g fill="none" strokeLinecap="round" strokeLinejoin="round">
              {summitRings.map((r) => (
                <path key={r.key} d={r.d} stroke="#7A8A5E" strokeWidth="1.8" />
              ))}
            </g>
          </svg>
        </div>
      </div>

      {/* Contenido — por encima del fondo */}
      <div className="hero-content" style={{ zIndex: 10 }}>
        {children}
      </div>

      <style>{`
        .hero-parallax {
          position: relative;
          overflow: hidden;
          isolation: isolate;
        }
        .hero-grid {
          position: absolute;
          top: 0; bottom: 0; left: 0; right: 58%;
          z-index: 0;
          pointer-events: none;
          opacity: 0.12;
          -webkit-mask-image: linear-gradient(to right, black 52%, transparent 100%);
          mask-image: linear-gradient(to right, black 52%, transparent 100%);
        }
        .hero-grid-svg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
        }
        /* Contenedor topográfico: mitad derecha, máscara para proteger el texto central */
        .hero-topo {
          position: absolute;
          top: 0; bottom: 0; right: 0;
          width: 58%;
          z-index: 1;
          pointer-events: none;
          overflow: visible;
          -webkit-mask-image: linear-gradient(to right, transparent 0%, black 22%);
          mask-image: linear-gradient(to right, transparent 0%, black 22%);
        }
        .tp-layer {
          position: absolute;
          top: -45%; bottom: -45%; left: -10%; right: -10%;
          will-change: transform;
        }
        .tp-lines { opacity: 0.5; }
        .tp-summit { opacity: 0.8; }

        @media (prefers-reduced-motion: reduce) {
          .tp-layer, .tp-lines, .tp-summit {
            transform: none !important;
          }
        }

        @media (max-width: 768px) {
          .hero-grid { right: 42%; opacity: 0.08; }
          .hero-topo { width: 62%; opacity: 0.7; }
          .tp-lines { opacity: 0.42; }
          .tp-summit { opacity: 0.65; }
        }
      `}</style>
    </div>
  )
}
