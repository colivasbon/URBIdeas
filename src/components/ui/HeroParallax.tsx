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
            {/* Loma principal — foco (1250,540), masa subida y redimensionada, visible desde media altura al borde inferior */}
            <path d="M 1248 526 C 1266 528, 1278 534, 1280 548 C 1282 562, 1280 590, 1268 606 C 1256 622, 1226 616, 1214 600 C 1202 584, 1200 556, 1208 542 C 1216 528, 1234 524, 1248 526 Z" stroke="#7E8E66" strokeWidth="1" opacity="0.10" />
            <path d="M 1244 516 C 1272 518, 1292 530, 1296 552 C 1300 576, 1292 618, 1274 636 C 1256 654, 1212 646, 1196 622 C 1180 598, 1178 556, 1190 540 C 1202 524, 1226 514, 1244 516 Z" stroke="#7E8E66" strokeWidth="1" opacity="0.11" />
            <path d="M 1240 508 C 1280 510, 1306 528, 1312 556 C 1318 586, 1306 636, 1284 656 C 1262 676, 1206 668, 1186 642 C 1166 616, 1162 562, 1176 542 C 1190 522, 1220 506, 1240 508 Z" stroke="#7E8E66" strokeWidth="1" opacity="0.12" />
            <path d="M 1236 500 C 1288 502, 1320 526, 1328 562 C 1336 600, 1320 656, 1294 680 C 1268 704, 1200 694, 1176 664 C 1152 634, 1146 568, 1162 544 C 1178 520, 1214 498, 1236 500 Z" stroke="#96A678" strokeWidth="1.25" opacity="0.20" />
            <path d="M 1232 492 C 1296 494, 1334 524, 1344 568 C 1354 614, 1334 676, 1304 704 C 1274 732, 1194 720, 1166 686 C 1138 652, 1130 574, 1148 546 C 1166 518, 1208 490, 1232 492 Z" stroke="#7E8E66" strokeWidth="1" opacity="0.11" />
            <path d="M 1228 484 C 1304 486, 1348 522, 1360 574 C 1372 628, 1348 696, 1314 728 C 1280 760, 1188 746, 1156 708 C 1124 670, 1114 580, 1134 548 C 1154 516, 1202 482, 1228 484 Z" stroke="#7E8E66" strokeWidth="1" opacity="0.12" />
            <path d="M 1224 476 C 1312 478, 1362 520, 1376 580 C 1390 642, 1362 716, 1324 752 C 1286 788, 1182 772, 1146 730 C 1110 688, 1098 586, 1120 550 C 1142 514, 1196 474, 1224 476 Z" stroke="#7E8E66" strokeWidth="1" opacity="0.13" />
            <path d="M 1220 468 C 1320 470, 1376 518, 1392 586 C 1408 656, 1376 736, 1334 776 C 1292 816, 1176 798, 1136 752 C 1096 706, 1082 592, 1106 552 C 1130 512, 1190 466, 1220 468 Z" stroke="#96A678" strokeWidth="1.25" opacity="0.21" />
            <path d="M 1216 460 C 1328 462, 1390 516, 1408 592 C 1426 670, 1390 756, 1344 800 C 1298 844, 1170 824, 1126 774 C 1082 724, 1066 598, 1092 554 C 1118 510, 1184 458, 1216 460 Z" stroke="#7E8E66" strokeWidth="1" opacity="0.12" />
            <path d="M 1212 452 C 1336 454, 1404 514, 1424 598 C 1444 684, 1404 776, 1354 824 C 1304 872, 1164 850, 1116 796 C 1068 742, 1050 604, 1078 556 C 1106 508, 1178 450, 1212 452 Z" stroke="#7E8E66" strokeWidth="1" opacity="0.11" />
            <path d="M 1210 444 C 1344 446, 1418 512, 1440 604 C 1462 698, 1418 796, 1364 848 C 1310 900, 1158 876, 1106 818 C 1054 760, 1034 610, 1064 558 C 1094 506, 1172 442, 1210 444 Z" stroke="#7E8E66" strokeWidth="1" opacity="0.13" />
            <path d="M 1208 436 C 1352 438, 1432 510, 1456 610 C 1480 712, 1432 816, 1374 872 C 1316 928, 1152 902, 1096 840 C 1040 778, 1018 616, 1050 560 C 1082 504, 1166 434, 1208 436 Z" stroke="#96A678" strokeWidth="1.25" opacity="0.22" />

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
