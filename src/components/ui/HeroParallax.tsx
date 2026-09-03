"use client"

import { useEffect, useRef, useState } from "react"

export default function HeroParallax({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const deepRef = useRef<HTMLDivElement>(null)
  const midRef = useRef<HTMLDivElement>(null)
  const nearRef = useRef<HTMLDivElement>(null)

  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches)
  }, [])

  useEffect(() => {
    const el = containerRef.current
    const deep = deepRef.current
    const mid = midRef.current
    const near = nearRef.current
    if (!el || !deep || !mid || !near) return
    if (reducedMotion) return

    let ticking = false

    function apply() {
      const rect = el!.getBoundingClientRect()
      const vh = window.innerHeight
      const total = el!.offsetHeight + vh
      // 0 cuando el hero entra por abajo, 1 cuando ha salido por arriba
      const progress = Math.max(0, Math.min(1, (vh - rect.top) / total))
      const scrollOffset = progress * 220

      // Parallax exclusivo por scroll: capas se desplazan verticalmente a distinta velocidad
      deep!.style.transform = `translate3d(0, ${(scrollOffset * 0.65).toFixed(1)}px, 0)`
      mid!.style.transform = `translate3d(0, ${(scrollOffset * 0.42).toFixed(1)}px, 0)`
      near!.style.transform = `translate3d(0, ${(scrollOffset * 0.22).toFixed(1)}px, 0)`
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
      {/* Reticula tecnica (izquierda) */}
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

      {/* Fondo topografico: curvas de nivel densas en el lateral derecho */}
      <div className="hero-topo" aria-hidden="true">
        {/* Capa profunda: masas amplias, difuminadas y tenues */}
        <div ref={deepRef} className="tp-layer tp-deep">
          <svg viewBox="0 0 1200 1000" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
            <g fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M 820 120 C 960 90, 1080 160, 1150 260 C 1220 360, 1200 500, 1120 590 C 1040 680, 900 720, 780 690 C 660 660, 580 560, 620 440 C 660 320, 760 140, 820 120 Z" stroke="#4A5A4A" strokeWidth="1.2" opacity="0.10" />
              <path d="M 880 220 C 1000 200, 1100 260, 1140 340 C 1180 420, 1140 520, 1060 580 C 980 640, 860 650, 780 600 C 700 550, 680 440, 740 340 C 800 240, 840 230, 880 220 Z" stroke="#4A5A4A" strokeWidth="1" opacity="0.12" />
              <path d="M 750 760 C 870 720, 1010 740, 1100 820 C 1190 900, 1160 980, 1080 1000" stroke="#4A5A4A" strokeWidth="1.1" opacity="0.10" />
              <path d="M 700 860 C 820 820, 960 840, 1060 920 C 1120 970, 1140 1010, 1100 1040" stroke="#4A5A4A" strokeWidth="1" opacity="0.10" />
            </g>
          </svg>
        </div>

        {/* Capa media: curvas de nivel irregulares y densas por la derecha */}
        <div ref={midRef} className="tp-layer tp-mid">
          <svg viewBox="0 0 1200 1000" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
            <g fill="none" strokeLinecap="round" strokeLinejoin="round">
              {/* Grupo superior-derecho */}
              <path d="M 1050 80 C 1100 75, 1135 105, 1125 145 C 1115 185, 1065 205, 1020 195 C 975 185, 950 145, 970 110 C 990 75, 1020 82, 1050 80 Z" stroke="#5A6A52" strokeWidth="1" opacity="0.18" />
              <path d="M 1070 130 C 1110 125, 1140 155, 1130 190 C 1120 225, 1075 245, 1035 235 C 995 225, 970 190, 985 155 C 1000 120, 1035 132, 1070 130 Z" stroke="#5A6A52" strokeWidth="1" opacity="0.16" />
              <path d="M 1090 185 C 1125 180, 1150 210, 1140 245 C 1130 280, 1085 295, 1045 285 C 1005 275, 985 240, 1000 205 C 1015 170, 1055 188, 1090 185 Z" stroke="#6A7A52" strokeWidth="1" opacity="0.18" />

              {/* Cresta diagonal descendente */}
              <path d="M 900 180 C 980 190, 1060 250, 1100 330 C 1140 410, 1120 510, 1060 580 C 1000 650, 900 690, 800 670 C 700 650, 640 560, 660 460" stroke="#5A6A52" strokeWidth="1.1" opacity="0.18" />
              <path d="M 950 260 C 1020 270, 1085 320, 1115 390 C 1145 460, 1125 540, 1070 595 C 1015 650, 920 675, 835 655 C 750 635, 700 555, 720 470" stroke="#6A7A52" strokeWidth="1" opacity="0.16" />
              <path d="M 1000 350 C 1060 360, 1110 405, 1130 465 C 1150 525, 1130 585, 1080 625 C 1030 665, 950 680, 880 660 C 810 640, 770 575, 790 505" stroke="#5A6A52" strokeWidth="1.1" opacity="0.18" />
              <path d="M 1045 450 C 1095 460, 1135 500, 1145 550 C 1155 600, 1130 645, 1085 670 C 1040 695, 975 700, 920 675 C 865 650, 835 595, 855 540" stroke="#6A7A52" strokeWidth="1" opacity="0.17" />
              <path d="M 1080 555 C 1120 565, 1150 600, 1155 640 C 1160 680, 1130 710, 1085 725 C 1040 740, 985 730, 940 700 C 895 670, 880 620, 905 575" stroke="#5A6A52" strokeWidth="1.1" opacity="0.18" />

              {/* Lineas horizontales abiertas hacia la derecha */}
              <path d="M 720 240 C 840 235, 960 255, 1080 245 C 1150 238, 1200 250, 1220 265" stroke="#5A6A52" strokeWidth="0.9" opacity="0.14" />
              <path d="M 700 310 C 820 305, 940 325, 1060 315 C 1130 308, 1180 320, 1200 335" stroke="#5A6A52" strokeWidth="0.9" opacity="0.13" />
              <path d="M 680 385 C 800 380, 920 400, 1040 390 C 1110 383, 1160 395, 1180 410" stroke="#5A6A52" strokeWidth="0.9" opacity="0.14" />
              <path d="M 660 465 C 780 460, 900 480, 1020 470 C 1090 463, 1140 475, 1160 490" stroke="#5A6A52" strokeWidth="0.9" opacity="0.13" />
              <path d="M 640 550 C 760 545, 880 565, 1000 555 C 1070 548, 1120 560, 1140 575" stroke="#5A6A52" strokeWidth="0.9" opacity="0.14" />
              <path d="M 620 640 C 740 635, 860 655, 980 645 C 1050 638, 1100 650, 1120 665" stroke="#5A6A52" strokeWidth="0.9" opacity="0.13" />
              <path d="M 600 735 C 720 730, 840 750, 960 740 C 1030 733, 1080 745, 1100 760" stroke="#5A6A52" strokeWidth="0.9" opacity="0.14" />
              <path d="M 580 835 C 700 830, 820 850, 940 840 C 1010 833, 1060 845, 1080 860" stroke="#5A6A52" strokeWidth="0.9" opacity="0.13" />
            </g>
          </svg>
        </div>

        {/* Capa cercana: lineas mas nitidas y definidas */}
        <div ref={nearRef} className="tp-layer tp-near">
          <svg viewBox="0 0 1200 1000" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
            <g fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M 1120 160 C 1155 155, 1180 185, 1170 220 C 1160 255, 1115 270, 1075 260 C 1035 250, 1015 215, 1030 180 C 1045 145, 1085 165, 1120 160 Z" stroke="#7A8A5E" strokeWidth="1.2" opacity="0.26" />
              <path d="M 1145 280 C 1175 275, 1195 300, 1185 330 C 1175 360, 1135 372, 1100 363 C 1065 354, 1048 325, 1062 295 C 1076 265, 1112 284, 1145 280 Z" stroke="#7A8A5E" strokeWidth="1.1" opacity="0.25" />
              <path d="M 1160 410 C 1185 405, 1200 430, 1192 455 C 1184 480, 1150 490, 1120 482 C 1090 474, 1075 448, 1088 422 C 1101 396, 1130 414, 1160 410 Z" stroke="#7A8A5E" strokeWidth="1.2" opacity="0.26" />
              <path d="M 1150 545 C 1175 540, 1190 565, 1180 590 C 1170 615, 1135 625, 1105 617 C 1075 609, 1060 583, 1075 557 C 1090 531, 1120 549, 1150 545 Z" stroke="#7A8A5E" strokeWidth="1.1" opacity="0.25" />
              <path d="M 1125 680 C 1150 675, 1165 700, 1155 725 C 1145 750, 1110 758, 1080 750 C 1050 742, 1035 717, 1050 692 C 1065 667, 1095 684, 1125 680 Z" stroke="#7A8A5E" strokeWidth="1.2" opacity="0.26" />
              <path d="M 1080 820 C 1105 815, 1120 838, 1110 862 C 1100 886, 1068 894, 1040 886 C 1012 878, 998 854, 1012 830 C 1026 806, 1052 824, 1080 820 Z" stroke="#7A8A5E" strokeWidth="1.1" opacity="0.25" />

              {/* Linea de cierre descendente */}
              <path d="M 980 100 C 1040 120, 1105 175, 1135 250 C 1165 325, 1155 420, 1115 500 C 1075 580, 1000 640, 920 655 C 840 670, 760 635, 720 560" stroke="#7A8A5E" strokeWidth="1" opacity="0.22" />
              <path d="M 940 900 C 1000 875, 1060 820, 1095 750 C 1130 680, 1135 590, 1100 510 C 1065 430, 990 365, 900 350 C 810 335, 730 385, 690 470" stroke="#7A8A5E" strokeWidth="1" opacity="0.20" />
            </g>
          </svg>
        </div>
      </div>

      {/* Halo muy sutil, solo para dar profundidad sin llamar la atencion */}
      <div className="hero-glow" aria-hidden="true">
        <div className="hero-glow-a" />
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
        /* Contenedor topografico: mitad derecha, con mascara para proteger el contenido central */
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
        .tp-deep svg { filter: blur(2px); }
        .tp-deep { opacity: 0.85; }
        .tp-mid  { opacity: 1; }
        .tp-near { opacity: 1; }

        .hero-glow {
          position: absolute;
          inset: 0;
          z-index: 2;
          pointer-events: none;
          overflow: hidden;
        }
        .hero-glow-a {
          position: absolute;
          top: 10%;
          right: 6%;
          width: 420px;
          height: 420px;
          border-radius: 9999px;
          background: var(--color-primary);
          opacity: 0.035;
          filter: blur(110px);
        }

        @media (prefers-reduced-motion: reduce) {
          .tp-layer, .tp-deep, .tp-mid, .tp-near {
            transform: none !important;
          }
        }

        @media (max-width: 768px) {
          .hero-grid { right: 42%; opacity: 0.08; }
          .hero-topo { width: 60%; opacity: 0.80; }
          .tp-deep { opacity: 0.55; }
          .tp-mid { opacity: 0.70; }
          .tp-near { opacity: 0.65; }
          .hero-glow-a { width: 260px; height: 260px; opacity: 0.03; }
        }
      `}</style>
    </div>
  )
}
