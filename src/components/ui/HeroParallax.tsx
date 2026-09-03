"use client"

import { useEffect, useRef, useState } from "react"

export default function HeroParallax({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const deepRef = useRef<HTMLDivElement>(null)
  const midRef = useRef<HTMLDivElement>(null)
  const nearRef = useRef<HTMLDivElement>(null)

  const [reducedMotion, setReducedMotion] = useState(false)
  const [isTouch, setIsTouch] = useState(false)

  useEffect(() => {
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    setIsTouch(window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window)
  }, [])

  useEffect(() => {
    const el = containerRef.current
    const deep = deepRef.current
    const mid = midRef.current
    const near = nearRef.current
    if (!el || !deep || !mid || !near) return
    if (reducedMotion) return

    let ticking = false
    let cursorX = 0
    let cursorY = 0

    function apply() {
      const rect = el!.getBoundingClientRect()
      const vh = window.innerHeight
      const total = el!.offsetHeight + vh
      // 0 con el hero en la parte superior de la vista, 1 cuando ha salido por arriba
      const progress = Math.max(0, Math.min(1, (vh - rect.top) / total))
      const scrollOffset = progress * 260

      // Parallax de scroll: capas suben a distinta velocidad (la profunda se retrasa mas)
      const syD = -scrollOffset * 0.32
      const syM = -scrollOffset * 0.58
      const syN = -scrollOffset * 0.82

      // Parallax de cursor (solo desktop): desplazamiento inverso, leve, se suma
      const cx = cursorX * (isTouch ? 0 : 1)
      const cy = cursorY * (isTouch ? 0 : 1)

      deep!.style.transform = `translate3d(${(-cx * 8).toFixed(1)}px, ${(syD - cy * 8).toFixed(1)}px, 0)`
      mid!.style.transform = `translate3d(${(-cx * 16).toFixed(1)}px, ${(syM - cy * 16).toFixed(1)}px, 0)`
      near!.style.transform = `translate3d(${(-cx * 24).toFixed(1)}px, ${(syN - cy * 24).toFixed(1)}px, 0)`
      ticking = false
    }

    function onScroll() {
      if (!ticking) {
        ticking = true
        requestAnimationFrame(apply)
      }
    }

    // Parallax de cursor en desktop (no tactil): solo guarda la posicion relativa
    function onMouseMove(e: MouseEvent) {
      if (isTouch) return
      const rect = el!.getBoundingClientRect()
      cursorX = (e.clientX - rect.left) / rect.width - 0.5
      cursorY = (e.clientY - rect.top) / rect.height - 0.5
      onScroll()
    }

    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll, { passive: true })
    el.addEventListener("mousemove", onMouseMove, { passive: true })
    onScroll()

    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
      el.removeEventListener("mousemove", onMouseMove)
    }
  }, [reducedMotion, isTouch])

  return (
    <div ref={containerRef} className="hero-parallax">
      {/* Reticula tecnica (izquierda) — se mantiene */}
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

      {/* Fondo topografico — solo en el tercio inferior */}
      <div className="hero-topo" aria-hidden="true">
        {/* Capa profunda: curvas grandes, oscuras, difuminadas */}
        <div ref={deepRef} className="tp-layer tp-deep">
          <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
            <g transform="rotate(-2 800 700)" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M 880 700 C 960 680, 1040 690, 1120 660 C 1200 630, 1280 640, 1360 610 C 1440 580, 1500 590, 1600 570" stroke="#4A5A4A" strokeWidth="1" opacity="0.08" />
              <path d="M 860 740 C 950 720, 1030 730, 1110 700 C 1190 670, 1270 680, 1350 650 C 1430 620, 1510 630, 1600 610" stroke="#4A5A4A" strokeWidth="1" opacity="0.09" />
              <path d="M 840 780 C 940 760, 1020 770, 1100 740 C 1180 710, 1260 720, 1340 690 C 1420 660, 1510 670, 1600 650" stroke="#4A5A4A" strokeWidth="1" opacity="0.08" />
              <path d="M 820 820 C 930 800, 1010 810, 1090 780 C 1170 750, 1250 760, 1330 730 C 1410 700, 1500 710, 1600 690" stroke="#4A5A4A" strokeWidth="1" opacity="0.07" />
              <path d="M 20 720 C 120 740, 200 730, 280 750 C 360 770, 300 800, 200 790 C 100 780, 40 770, 20 720 Z" stroke="#4A5A4A" strokeWidth="1" opacity="0.06" />
              <path d="M 0 790 C 100 810, 200 800, 280 820 C 360 840, 300 870, 200 860 C 100 850, -20 840, 0 790 Z" stroke="#4A5A4A" strokeWidth="1" opacity="0.06" />
            </g>
          </svg>
        </div>

        {/* Capa media: curvas visibles pero discretas, irregulares */}
        <div ref={midRef} className="tp-layer tp-mid">
          <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
            <g transform="rotate(1 800 700)" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M 1250 640 C 1300 600, 1370 590, 1420 620 C 1470 650, 1480 710, 1440 750 C 1400 790, 1320 780, 1280 730 C 1240 690, 1220 660, 1250 640 Z" stroke="#5A6A52" strokeWidth="1" opacity="0.13" />
              <path d="M 1180 700 C 1250 660, 1330 650, 1390 680 C 1450 710, 1460 780, 1410 820 C 1360 860, 1270 850, 1220 800 C 1170 750, 1140 720, 1180 700 Z" stroke="#5A6A52" strokeWidth="1" opacity="0.11" />
              <path d="M 1300 700 C 1350 650, 1430 640, 1490 670 C 1550 700, 1560 770, 1510 810 C 1460 850, 1370 840, 1320 790 C 1270 740, 1250 730, 1300 700 Z" stroke="#5A6A52" strokeWidth="1" opacity="0.12" />
              <path d="M 1050 780 C 1130 750, 1220 760, 1280 790 C 1340 820, 1360 870, 1310 900 C 1260 930, 1160 920, 1100 880 C 1040 840, 1010 810, 1050 780 Z" stroke="#5A6A52" strokeWidth="1" opacity="0.10" />
              <path d="M 120 820 C 200 800, 260 810, 300 840 C 340 870, 320 900, 260 890 C 200 880, 100 860, 120 820 Z" stroke="#5A6A52" strokeWidth="1" opacity="0.08" />
            </g>
          </svg>
        </div>

        {/* Capa cercana: pocas curvas algo mas definidas */}
        <div ref={nearRef} className="tp-layer tp-near">
          <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
            <g transform="rotate(0.5 900 800)" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M 1290 720 C 1330 680, 1390 670, 1430 690 C 1470 710, 1470 750, 1440 770 C 1410 790, 1340 785, 1310 755 C 1280 735, 1275 730, 1290 720 Z" stroke="#6A7A5A" strokeWidth="1" opacity="0.16" />
              <path d="M 1240 770 C 1290 740, 1360 735, 1400 755 C 1440 775, 1440 810, 1400 830 C 1360 850, 1280 840, 1250 810 C 1220 780, 1220 780, 1240 770 Z" stroke="#6A7A5A" strokeWidth="1" opacity="0.14" />
              <path d="M 1380 760 C 1420 730, 1470 725, 1500 745 C 1530 765, 1520 800, 1480 815 C 1440 830, 1380 820, 1370 790 C 1360 775, 1370 765, 1380 760 Z" stroke="#6A7A5A" strokeWidth="1" opacity="0.15" />
              <path d="M 110 870 C 170 850, 220 860, 250 885 C 280 910, 260 900, 210 895 C 160 890, 100 885, 110 870 Z" stroke="#6A7A5A" strokeWidth="1" opacity="0.12" />
            </g>
          </svg>
        </div>
      </div>

      {/* Halo sutil */}
      <div className="hero-glow" aria-hidden="true">
        <div className="hero-glow-a" />
        <div className="hero-glow-b" />
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
        /* Contenedor topografico: anclado al borde inferior, solo tercio inferior */
        .hero-topo {
          position: absolute;
          left: 0; right: 0; bottom: 0;
          height: 46%;
          z-index: 1;
          pointer-events: none;
          overflow: hidden;
        }
        .tp-layer {
          position: absolute;
          inset: -20% -6% -6% -6%;
          will-change: transform;
        }
        .tp-deep svg { filter: blur(2px); }
        .tp-deep { opacity: 0.55; }
        .tp-mid  { opacity: 0.8; }
        .tp-near { opacity: 0.95; }

        .hero-glow {
          position: absolute;
          inset: 0;
          z-index: 2;
          pointer-events: none;
          overflow: hidden;
        }
        .hero-glow-a {
          position: absolute;
          top: 6%;
          right: 8%;
          width: 520px;
          height: 520px;
          border-radius: 9999px;
          background: var(--color-primary);
          opacity: 0.07;
          filter: blur(90px);
        }
        .hero-glow-b {
          position: absolute;
          bottom: 6%;
          left: 6%;
          width: 380px;
          height: 380px;
          border-radius: 9999px;
          background: var(--color-secondary);
          opacity: 0.05;
          filter: blur(80px);
        }

        @media (prefers-reduced-motion: reduce) {
          .tp-layer, .tp-deep, .tp-mid, .tp-near {
            transform: none !important;
          }
        }

        @media (max-width: 768px) {
          .hero-grid { right: 42%; opacity: 0.08; }
          .hero-topo { height: 40%; opacity: 0.8; }
          .tp-deep { opacity: 0.4; }
          .tp-mid { opacity: 0.55; }
          .tp-near { opacity: 0.65; }
        }
      `}</style>
    </div>
  )
}