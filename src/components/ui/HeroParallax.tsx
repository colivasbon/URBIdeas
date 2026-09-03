"use client"

import { useEffect, useRef, useState } from "react"

export default function HeroParallax({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches)
  }, [])

  useEffect(() => {
    const el = containerRef.current
    const grid = gridRef.current
    if (!el || !grid) return
    if (reducedMotion) return

    let ticking = false

    function apply() {
      const vh = window.innerHeight
      // Punto de referencia: la barra de stats (siguiente sección del hero)
      const stats = document.getElementById("stats-bar")
      let progress = 0
      if (stats) {
        const statsTop = stats.getBoundingClientRect().top
        // 0 cuando la barra está abajo fuera de vista, 1 cuando llega arriba del todo
        progress = Math.max(0, Math.min(1, (vh - statsTop) / vh))
      } else {
        const rect = el!.getBoundingClientRect()
        progress = Math.max(0, Math.min(1, (vh - rect.top) / (vh + el!.offsetHeight)))
      }
      // Recorrido amplio para que el efecto se note de verdad
      grid!.style.transform = `translate3d(0, ${(progress * 340).toFixed(1)}px, 0)`
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

  return (
    <div ref={containerRef} className="hero-parallax">
      {/* Retícula técnica a todo el hero */}
      <div ref={gridRef} className="hero-grid" aria-hidden="true">
        <svg className="hero-grid-svg" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" preserveAspectRatio="none">
          <defs>
            <pattern id="heroGridPattern" width="120" height="120" patternUnits="userSpaceOnUse">
              <rect width="120" height="120" fill="none" />
              <path d="M 30 0 V 120 M 60 0 V 120 M 90 0 V 120 M 0 30 H 120 M 0 60 H 120 M 0 90 H 120" fill="none" stroke="#4A5E42" strokeWidth="0.5" />
              <path d="M 120 0 H 0 V 120" fill="none" stroke="#5A6E52" strokeWidth="1.1" />
              <circle cx="0" cy="0" r="0.9" fill="#6A7E5A" />
              <circle cx="60" cy="60" r="0.7" fill="#6A7E5A" opacity="0.6" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#heroGridPattern)" />
        </svg>
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
          top: -45%; bottom: -45%; left: -5%; right: -5%;
          z-index: 0;
          pointer-events: none;
          opacity: 0.2;
          will-change: transform;
        }
        .hero-grid-svg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
        }

        @media (prefers-reduced-motion: reduce) {
          .hero-grid {
            transform: none !important;
          }
        }

        @media (max-width: 768px) {
          .hero-grid { opacity: 0.25; }
        }
      `}</style>
    </div>
  )
}
