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

      // Parallax de scroll: capas bajan a distinta velocidad (la profunda se retrasa mas)
      const syD = scrollOffset * 0.72
      const syM = scrollOffset * 0.5
      const syN = scrollOffset * 0.28

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

      {/* Fondo topografico — masa densa en toda la derecha + borde inferior */}
      <div className="hero-topo" aria-hidden="true">
        {/* Capa profunda: curvas amplias, oscuras, difuminadas */}
        <div ref={deepRef} className="tp-layer tp-deep">
          <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
            <g transform="rotate(-1.5 800 700)" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M 1080 300 C 1180 285, 1280 295, 1380 280 C 1480 265, 1540 280, 1600 268" stroke="#4A5A4A" strokeWidth="1" opacity="0.12" />
              <path d="M 1070 380 C 1170 365, 1270 375, 1370 360 C 1470 345, 1540 360, 1600 348" stroke="#4A5A4A" strokeWidth="1" opacity="0.13" />
              <path d="M 1050 470 C 1160 455, 1260 465, 1360 450 C 1460 435, 1530 450, 1600 438" stroke="#4A5A4A" strokeWidth="1" opacity="0.12" />
              <path d="M 1030 570 C 1140 555, 1250 565, 1350 550 C 1450 535, 1520 550, 1600 538" stroke="#4A5A4A" strokeWidth="1" opacity="0.13" />
              <path d="M 1010 680 C 1120 665, 1240 675, 1340 660 C 1440 645, 1510 660, 1600 648" stroke="#4A5A4A" strokeWidth="1" opacity="0.12" />
              <path d="M 990 800 C 1100 785, 1220 795, 1320 780 C 1420 765, 1500 780, 1600 768" stroke="#4A5A4A" strokeWidth="1" opacity="0.13" />
            </g>
          </svg>
        </div>

        {/* Capa media: masa densa de curvas irregulares en toda la derecha */}
        <div ref={midRef} className="tp-layer tp-mid">
          <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
            <g transform="rotate(0.8 800 700)" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M 1280 320 C 1330 285, 1390 275, 1440 300 C 1490 325, 1500 385, 1460 415 C 1420 445, 1340 430, 1300 395 C 1260 360, 1250 335, 1280 320 Z" stroke="#6A7A52" strokeWidth="1.1" opacity="0.22" />
              <path d="M 1080 270 C 1160 258, 1240 268, 1320 256 C 1400 244, 1480 260, 1600 248" stroke="#5A6A52" strokeWidth="1" opacity="0.2" />
              <path d="M 1080 310 C 1170 296, 1250 306, 1330 294 C 1410 282, 1490 298, 1600 286" stroke="#5A6A52" strokeWidth="1" opacity="0.19" />
              <path d="M 1070 355 C 1160 340, 1245 350, 1325 338 C 1405 326, 1490 342, 1600 330" stroke="#5A6A52" strokeWidth="1" opacity="0.2" />
              <path d="M 1060 400 C 1150 385, 1235 395, 1315 383 C 1395 371, 1480 387, 1600 375" stroke="#96A678" strokeWidth="1.25" opacity="0.3" />
              <path d="M 1050 448 C 1140 432, 1225 442, 1305 430 C 1385 418, 1470 434, 1600 422" stroke="#5A6A52" strokeWidth="1" opacity="0.2" />
              <path d="M 1040 495 C 1130 480, 1215 490, 1295 478 C 1375 466, 1460 482, 1600 470" stroke="#5A6A52" strokeWidth="1" opacity="0.21" />
              <path d="M 1030 545 C 1120 530, 1205 540, 1285 528 C 1365 516, 1450 532, 1600 520" stroke="#5A6A52" strokeWidth="1" opacity="0.2" />
              <path d="M 1150 700 C 1200 670, 1260 665, 1300 690 C 1340 715, 1330 765, 1290 785 C 1250 805, 1190 795, 1170 755 C 1150 730, 1140 720, 1150 700 Z" stroke="#96A678" strokeWidth="1.25" opacity="0.3" />
              <path d="M 1020 595 C 1110 580, 1195 590, 1275 578 C 1355 566, 1440 582, 1600 570" stroke="#5A6A52" strokeWidth="1" opacity="0.2" />
              <path d="M 1010 648 C 1100 633, 1185 643, 1265 631 C 1345 619, 1430 635, 1600 623" stroke="#5A6A52" strokeWidth="1" opacity="0.21" />
              <path d="M 1000 700 C 1090 685, 1175 695, 1255 683 C 1335 671, 1420 687, 1600 675" stroke="#5A6A52" strokeWidth="1" opacity="0.2" />
              <path d="M 990 755 C 1080 740, 1165 750, 1245 738 C 1325 726, 1410 742, 1600 730" stroke="#96A678" strokeWidth="1.25" opacity="0.3" />
              <path d="M 980 810 C 1070 795, 1155 805, 1235 793 C 1315 781, 1400 797, 1600 785" stroke="#5A6A52" strokeWidth="1" opacity="0.2" />
              <path d="M 970 865 C 1060 850, 1145 860, 1225 848 C 1305 836, 1390 852, 1600 840" stroke="#5A6A52" strokeWidth="1" opacity="0.21" />
            </g>
          </svg>
        </div>

        {/* Capa cercana: pocas curvas mas definidas, superpuestas */}
        <div ref={nearRef} className="tp-layer tp-near">
          <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
            <g transform="rotate(1.2 900 800)" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M 1300 460 C 1350 420, 1420 410, 1470 435 C 1520 460, 1520 510, 1480 535 C 1440 560, 1360 545, 1320 510 C 1280 475, 1270 480, 1300 460 Z" stroke="#7A8A5E" strokeWidth="1.1" opacity="0.28" />
              <path d="M 1180 560 C 1240 530, 1310 525, 1350 550 C 1390 575, 1380 620, 1340 640 C 1300 660, 1230 645, 1200 615 C 1170 585, 1160 585, 1180 560 Z" stroke="#7A8A5E" strokeWidth="1" opacity="0.26" />
              <path d="M 1240 760 C 1290 730, 1360 725, 1400 745 C 1440 765, 1440 800, 1400 820 C 1360 840, 1280 830, 1250 800 C 1220 770, 1220 770, 1240 760 Z" stroke="#7A8A5E" strokeWidth="1" opacity="0.26" />
              <path d="M 1390 640 C 1430 610, 1480 605, 1510 625 C 1540 645, 1530 680, 1490 695 C 1450 710, 1390 700, 1380 670 C 1370 655, 1380 645, 1390 640 Z" stroke="#7A8A5E" strokeWidth="1.1" opacity="0.28" />
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
          top: -40%; bottom: -40%; left: -10%; right: -10%;
          will-change: transform;
        }
        .tp-deep svg { filter: blur(1.5px); }
        .tp-deep { opacity: 0.9; }
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
          .hero-topo { width: 60%; opacity: 0.85; }
          .tp-deep { opacity: 0.6; }
          .tp-mid { opacity: 0.75; }
          .tp-near { opacity: 0.7; }
        }
      `}</style>
    </div>
  )
}