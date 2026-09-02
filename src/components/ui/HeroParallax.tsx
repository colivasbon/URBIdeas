"use client"

import { useEffect, useRef } from "react"

export default function HeroParallax({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (prefersReduced) return

    let ticking = false
    let heroH = el.offsetHeight

    function update() {
      const rect = el!.getBoundingClientRect()
      // 0 when hero top at viewport top, 1 when hero scrolled ~70% past
      const progress = Math.max(0, Math.min(1, -rect.top / (heroH * 0.7)))
      el!.style.setProperty("--hero-p", String(progress))
      ticking = false
    }

    function onScroll() {
      if (!ticking) {
        requestAnimationFrame(update)
        ticking = true
      }
    }

    function onResize() {
      heroH = el!.offsetHeight
      update()
    }

    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onResize, { passive: true })
    update()

    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onResize)
    }
  }, [])

  return (
    <div ref={containerRef} className="hero-parallax" style={{ ["--hero-p" as string]: 0 } as React.CSSProperties}>
      {/* Grid — left third */}
      <div className="hero-grid" aria-hidden="true">
        <svg className="hero-grid-svg" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" preserveAspectRatio="none">
          <defs>
            <pattern id="heroGridPattern" width="144" height="144" patternUnits="userSpaceOnUse">
              {/* subtle base */}
              <rect width="144" height="144" fill="none" />
              {/* fine lines 36px */}
              <path d="M 36 0 V 144 M 72 0 V 144 M 108 0 V 144 M 0 36 H 144 M 0 72 H 144 M 0 108 H 144" fill="none" stroke="#4A5E42" strokeWidth="0.5" />
              {/* thick divisions 144px */}
              <path d="M 144 0 H 0 V 144" fill="none" stroke="#5A6E52" strokeWidth="1.1" />
              {/* intersection dots */}
              <circle cx="0" cy="0" r="0.9" fill="#6A7E5A" />
              <circle cx="72" cy="72" r="0.7" fill="#6A7E5A" opacity="0.6" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#heroGridPattern)" />
        </svg>
      </div>

      {/* Topo — unica masa topografica en cuadrante inferior-derecho, parcialmente fuera de pantalla */}
      <div className="hero-topo-main" aria-hidden="true">
        <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            {/* Loma principal — foco en (1330,860) cerca de la esquina inferior-derecha, curvas cerradas e irregulares recortadas por el viewport */}
            <path d="M 1326 802 C 1348 806, 1362 824, 1360 846 C 1358 870, 1362 890, 1350 904 C 1338 918, 1316 914, 1304 898 C 1292 882, 1290 850, 1300 832 C 1308 818, 1318 800, 1326 802 Z" stroke="#7E8E66" strokeWidth="1" opacity="0.10" />
            <path d="M 1320 782 C 1358 786, 1382 818, 1380 852 C 1378 890, 1386 916, 1368 938 C 1350 960, 1308 952, 1292 928 C 1276 904, 1270 852, 1284 820 C 1296 794, 1310 780, 1320 782 Z" stroke="#7E8E66" strokeWidth="1" opacity="0.10" />
            <path d="M 1314 762 C 1368 766, 1402 810, 1400 856 C 1398 908, 1408 942, 1384 972 C 1360 1002, 1300 990, 1280 958 C 1260 926, 1250 852, 1268 808 C 1284 778, 1302 760, 1314 762 Z" stroke="#7E8E66" strokeWidth="1" opacity="0.11" />
            <path d="M 1308 740 C 1378 744, 1422 800, 1420 860 C 1418 924, 1428 966, 1400 1004 C 1372 1042, 1292 1026, 1268 986 C 1244 946, 1230 852, 1252 796 C 1270 758, 1296 738, 1308 740 Z" stroke="#96A678" strokeWidth="1.25" opacity="0.16" />
            <path d="M 1302 720 C 1388 724, 1442 790, 1440 864 C 1438 940, 1448 990, 1416 1036 C 1384 1082, 1284 1062, 1256 1014 C 1228 966, 1210 850, 1236 784 C 1256 740, 1288 718, 1302 720 Z" stroke="#7E8E66" strokeWidth="1" opacity="0.11" />
            <path d="M 1296 700 C 1398 704, 1462 780, 1460 868 C 1458 956, 1468 1014, 1432 1068 C 1396 1122, 1276 1098, 1244 1042 C 1212 986, 1190 848, 1220 772 C 1242 722, 1278 698, 1296 700 Z" stroke="#7E8E66" strokeWidth="1" opacity="0.10" />
            <path d="M 1290 678 C 1408 682, 1482 770, 1480 872 C 1478 972, 1488 1038, 1448 1100 C 1408 1162, 1268 1134, 1232 1070 C 1196 1006, 1170 846, 1204 760 C 1228 704, 1268 676, 1290 678 Z" stroke="#7E8E66" strokeWidth="1" opacity="0.11" />
            <path d="M 1284 656 C 1418 660, 1502 760, 1500 876 C 1498 988, 1508 1062, 1464 1132 C 1420 1202, 1260 1170, 1220 1098 C 1180 1026, 1150 844, 1188 748 C 1214 686, 1258 654, 1284 656 Z" stroke="#96A678" strokeWidth="1.25" opacity="0.16" />
            <path d="M 1278 634 C 1428 638, 1522 750, 1520 880 C 1518 1004, 1528 1086, 1480 1164 C 1432 1242, 1252 1206, 1208 1126 C 1164 1046, 1130 842, 1172 736 C 1200 668, 1248 632, 1278 634 Z" stroke="#7E8E66" strokeWidth="1" opacity="0.10" />
            <path d="M 1272 612 C 1438 616, 1542 740, 1540 884 C 1538 1020, 1548 1110, 1496 1196 C 1444 1282, 1244 1242, 1196 1154 C 1148 1066, 1110 840, 1156 724 C 1186 650, 1238 610, 1272 612 Z" stroke="#7E8E66" strokeWidth="1" opacity="0.09" />

            {/* Presencia minima superior-izquierda — integrada con la reticula, muy tenue */}
            <path d="M -110 -40 C -40 -50, 10 -10, 20 50 C 30 110, 0 160, -60 155 C -120 150, -180 110, -185 40 C -190 -30, -150 -36, -110 -40 Z" stroke="#7E8E66" strokeWidth="1" opacity="0.05" />
            <path d="M -100 -70 C -20 -85, 40 -30, 55 55 C 70 140, 30 200, -45 195 C -120 190, -190 140, -195 55 C -200 -30, -150 -64, -100 -70 Z" stroke="#7E8E66" strokeWidth="1" opacity="0.06" />
            <path d="M -90 -105 C 0 -125, 75 -55, 92 60 C 109 175, 62 245, -28 238 C -118 231, -200 172, -206 70 C -212 -32, -150 -94, -90 -105 Z" stroke="#96A678" strokeWidth="1.25" opacity="0.08" />
            <path d="M -80 -140 C 20 -165, 110 -80, 130 65 C 150 210, 95 290, -10 282 C -115 274, -210 204, -216 85 C -222 -34, -150 -124, -80 -140 Z" stroke="#7E8E66" strokeWidth="1" opacity="0.05" />
          </g>
        </svg>
      </div>

      {/* Subtle glows */}
      <div className="hero-glow" aria-hidden="true">
        <div className="hero-glow-a" />
        <div className="hero-glow-b" />
      </div>

      {/* Content — stable, no parallax */}
      <div className="relative" style={{ zIndex: 10 }}>
        {children}
      </div>

      <style>{`
        .hero-parallax {
          position: relative;
          overflow: hidden;
          isolation: isolate;
          --hero-p: 0;
          background: var(--color-dark-bg);
        }
        .hero-grid {
          position: absolute;
          inset: 0;
          right: 58%;
          z-index: 0;
          pointer-events: none;
          opacity: calc(0.12 + var(--hero-p) * 0.04);
          transform: translateY(calc(var(--hero-p) * 22px));
          will-change: transform, opacity;
          -webkit-mask-image: linear-gradient(to right, black 52%, transparent 100%);
          mask-image: linear-gradient(to right, black 52%, transparent 100%);
        }
        .hero-grid-svg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
        }
        .hero-topo-main {
          position: absolute;
          inset: -10% -6% -10% 0%;
          z-index: 1;
          pointer-events: none;
          opacity: calc(0.85 + var(--hero-p) * 0.15);
          transform: translateY(calc(var(--hero-p) * -40px)) scale(calc(1 + var(--hero-p) * 0.03));
          will-change: transform, opacity;
          /* Proteger centro (titulo, parrafo, botones, metricas) con degradado radial amplio */
          -webkit-mask-image: radial-gradient(130% 120% at 50% 44%, transparent 0%, transparent 24%, black 52%, black 80%, transparent 100%);
          mask-image: radial-gradient(130% 120% at 50% 44%, transparent 0%, transparent 24%, black 52%, black 80%, transparent 100%);
        }
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
          right: 10%;
          width: 520px;
          height: 520px;
          border-radius: 9999px;
          background: var(--color-primary);
          opacity: calc(0.09 + var(--hero-p) * 0.04);
          filter: blur(90px);
          transform: translateY(calc(var(--hero-p) * -18px));
          will-change: transform, opacity;
        }
        .hero-glow-b {
          position: absolute;
          bottom: 8%;
          left: 6%;
          width: 380px;
          height: 380px;
          border-radius: 9999px;
          background: var(--color-secondary);
          opacity: calc(0.07 + var(--hero-p) * 0.03);
          filter: blur(80px);
          transform: translateY(calc(var(--hero-p) * 12px));
          will-change: transform, opacity;
        }

        /* Light mode — tonos mas contrastados sobre fondo claro */
        [data-theme="light"] .hero-grid { opacity: calc(0.10 + var(--hero-p) * 0.04); }
        [data-theme="light"] .hero-topo-main { opacity: calc(0.5 + var(--hero-p) * 0.1); }
        [data-theme="light"] .hero-glow-a { opacity: calc(0.06 + var(--hero-p) * 0.03); }
        [data-theme="light"] .hero-glow-b { opacity: calc(0.04 + var(--hero-p) * 0.02); }

        @media (prefers-reduced-motion: reduce) {
          .hero-grid, .hero-topo-main, .hero-glow-a, .hero-glow-b {
            transform: none !important;
          }
          .hero-parallax {
            --hero-p: 0 !important;
          }
          .hero-grid { opacity: 0.12 !important; }
          .hero-topo-main { opacity: 0.85 !important; }
        }

        @media (max-width: 768px) {
          .hero-grid {
            right: 42%;
            opacity: calc(0.08 + var(--hero-p) * 0.03);
            -webkit-mask-image: linear-gradient(to right, black 60%, transparent 100%);
            mask-image: linear-gradient(to right, black 60%, transparent 100%);
          }
          .hero-topo-main {
            left: 6%;
            right: -10%;
            opacity: calc(0.5 + var(--hero-p) * 0.12);
            transform: translateY(calc(var(--hero-p) * -24px)) scale(calc(1 + var(--hero-p) * 0.02));
          }
          .hero-glow-a { width: 340px; height: 340px; filter: blur(70px); }
          .hero-glow-b { width: 260px; height: 260px; filter: blur(60px); }
        }
      `}</style>
    </div>
  )
}
