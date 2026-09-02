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

      {/* Topo main — llanura elevada asimetrica, curvas abiertas que entran desde bordes */}
      <div className="hero-topo-main" aria-hidden="true">
        <svg viewBox="0 0 1440 700" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            {/* Masa inferior-derecha — 14 lineas onduladas de terreno, abiertas en borde derecho */}
            <path className="tp-dense" d="M 1440 470 C 1330 455, 1220 465, 1140 480 C 1060 495, 1000 515, 960 540" stroke="#7E8E66" strokeWidth="1" opacity="0.12" />
            <path className="tp-dense" d="M 1440 486 C 1342 473, 1232 481, 1152 496 C 1072 511, 1008 529, 968 553" stroke="#7E8E66" strokeWidth="1" opacity="0.10" />
            <path className="tp-dense" d="M 1440 502 C 1350 490, 1240 496, 1162 510 C 1084 524, 1014 542, 974 564" stroke="#7E8E66" strokeWidth="1" opacity="0.13" />
            <path className="tp-dense tp-master" d="M 1440 518 C 1356 506, 1246 510, 1170 524 C 1092 538, 1022 554, 980 576" stroke="#96A678" strokeWidth="1.4" opacity="0.20" />
            <path className="tp-dense" d="M 1440 534 C 1362 522, 1252 524, 1177 538 C 1100 552, 1030 568, 990 590" stroke="#7E8E66" strokeWidth="1" opacity="0.11" />
            <path className="tp-dense" d="M 1440 550 C 1368 538, 1258 540, 1184 554 C 1107 568, 1038 584, 998 606" stroke="#7E8E66" strokeWidth="1" opacity="0.12" />
            <path className="tp-dense" d="M 1440 566 C 1372 554, 1264 556, 1192 570 C 1114 584, 1046 600, 1006 622" stroke="#7E8E66" strokeWidth="1" opacity="0.10" />
            <path className="tp-dense tp-master" d="M 1440 582 C 1378 570, 1270 572, 1198 586 C 1122 600, 1054 616, 1014 638" stroke="#96A678" strokeWidth="1.4" opacity="0.22" />
            <path className="tp-dense" d="M 1440 598 C 1384 586, 1276 588, 1204 602 C 1130 616, 1062 632, 1022 654" stroke="#7E8E66" strokeWidth="1" opacity="0.12" />
            <path className="tp-dense" d="M 1440 614 C 1388 602, 1282 604, 1210 618 C 1138 632, 1070 648, 1030 670" stroke="#7E8E66" strokeWidth="1" opacity="0.11" />
            <path className="tp-dense" d="M 1440 630 C 1392 618, 1288 620, 1216 634 C 1146 648, 1078 664, 1038 686" stroke="#7E8E66" strokeWidth="1" opacity="0.13" />
            <path className="tp-dense tp-master" d="M 1440 646 C 1396 634, 1294 636, 1222 650 C 1154 664, 1086 680, 1046 700" stroke="#96A678" strokeWidth="1.4" opacity="0.24" />
            <path className="tp-dense" d="M 1440 662 C 1400 650, 1300 652, 1228 666 C 1162 680, 1094 696, 1054 700" stroke="#7E8E66" strokeWidth="1" opacity="0.10" />
            <path className="tp-dense" d="M 1440 678 C 1404 666, 1306 668, 1234 682 C 1170 696, 1102 700, 1062 700" stroke="#7E8E66" strokeWidth="1" opacity="0.11" />

            {/* Masa tenue superior-derecha — 4 lineas amplias */}
            <path d="M 1440 150 C 1360 140, 1290 150, 1230 165 C 1180 178, 1140 195, 1110 215" stroke="#7E8E66" strokeWidth="1" opacity="0.08" />
            <path d="M 1440 168 C 1372 158, 1302 168, 1244 182 C 1194 194, 1154 210, 1126 228" stroke="#7E8E66" strokeWidth="1" opacity="0.09" />
            <path className="tp-master" d="M 1440 188 C 1384 178, 1314 188, 1258 201 C 1208 213, 1170 228, 1142 244" stroke="#96A678" strokeWidth="1.3" opacity="0.16" />
            <path d="M 1440 208 C 1396 198, 1326 208, 1272 221 C 1222 233, 1186 248, 1158 262" stroke="#7E8E66" strokeWidth="1" opacity="0.08" />

            {/* Fragmentos inferior-izquierda — escala grande, muy discretos */}
            <path d="M -20 520 C 60 505, 140 510, 200 522 C 250 532, 290 545, 320 560" stroke="#7E8E66" strokeWidth="1" opacity="0.07" />
            <path d="M -20 545 C 70 532, 150 536, 210 548 C 260 558, 300 570, 330 582" stroke="#7E8E66" strokeWidth="1" opacity="0.08" />
            <path className="tp-master" d="M -20 572 C 80 560, 160 562, 220 574 C 270 584, 310 596, 340 606" stroke="#96A678" strokeWidth="1.3" opacity="0.14" />

            {/* Etiquetas cartograficas — pequenas, discretas, orientadas a la curva */}
            <text x="150" y="556" fill="#96A678" fontSize="11" letterSpacing="2" opacity="0.5" transform="rotate(-4 150 556)">ALBACETE · CLM</text>
            <text x="1120" y="212" fill="#96A678" fontSize="10" letterSpacing="2" opacity="0.45" transform="rotate(-5 1120 212)">COTA 680 m</text>
            <text x="1020" y="660" fill="#96A678" fontSize="9" letterSpacing="1.5" opacity="0.4" transform="rotate(-78 1020 660)">38.99° N · 1.86° W</text>
          </g>
        </svg>
      </div>

      {/* Topo secondary — muy lento, difuminado, coherente con principal */}
      <div className="hero-topo-sec" aria-hidden="true">
        <svg viewBox="0 0 1440 700" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M 1440 470 C 1350 452, 1240 462, 1160 478 C 1080 494, 1010 514, 970 540" stroke="#7E8E66" strokeWidth="1.1" opacity="0.6" />
            <path d="M 1440 520 C 1370 508, 1260 510, 1186 524 C 1108 538, 1038 554, 998 576" stroke="#7E8E66" strokeWidth="1" opacity="0.5" />
            <path d="M 1440 578 C 1380 566, 1272 568, 1200 582 C 1124 596, 1056 612, 1016 634" stroke="#96A678" strokeWidth="1.3" opacity="0.55" />
            <path d="M 1440 200 C 1380 190, 1310 200, 1252 213 C 1202 225, 1164 240, 1136 256" stroke="#7E8E66" strokeWidth="1" opacity="0.5" />
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
          opacity: calc(0.18 + var(--hero-p) * 0.08);
          transform: translateY(calc(var(--hero-p) * 22px));
          will-change: transform, opacity;
          -webkit-mask-image: linear-gradient(to right, black 62%, transparent 100%);
          mask-image: linear-gradient(to right, black 62%, transparent 100%);
        }
        .hero-grid-svg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
        }
        .hero-topo-main {
          position: absolute;
          inset: -6% -2% -6% 30%;
          z-index: 1;
          pointer-events: none;
          opacity: calc(0.9 + var(--hero-p) * 0.1);
          transform: translateY(calc(var(--hero-p) * -48px)) scale(calc(1 + var(--hero-p) * 0.035));
          will-change: transform, opacity;
          -webkit-mask-image: radial-gradient(140% 110% at 30% 45%, transparent 0%, transparent 20%, black 42%, black 78%, transparent 100%);
          mask-image: radial-gradient(140% 110% at 30% 45%, transparent 0%, transparent 20%, black 42%, black 78%, transparent 100%);
        }
        .hero-topo-sec {
          position: absolute;
          inset: -4% -2% -4% 26%;
          z-index: 1;
          pointer-events: none;
          opacity: calc(0.75 + var(--hero-p) * 0.25);
          transform: translateY(calc(var(--hero-p) * -16px)) scale(calc(1 + var(--hero-p) * 0.015));
          filter: blur(0.7px);
          will-change: transform, opacity;
          -webkit-mask-image: radial-gradient(120% 90% at 30% 40%, transparent 0%, black 34%, black 62%, transparent 100%);
          mask-image: radial-gradient(120% 90% at 30% 40%, transparent 0%, black 34%, black 62%, transparent 100%);
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
        [data-theme="light"] .hero-grid { opacity: calc(0.14 + var(--hero-p) * 0.06); }
        [data-theme="light"] .hero-topo-main { opacity: calc(0.5 + var(--hero-p) * 0.08); }
        [data-theme="light"] .hero-topo-sec { opacity: calc(0.4 + var(--hero-p) * 0.06); }
        [data-theme="light"] .hero-glow-a { opacity: calc(0.06 + var(--hero-p) * 0.03); }
        [data-theme="light"] .hero-glow-b { opacity: calc(0.04 + var(--hero-p) * 0.02); }

        @media (prefers-reduced-motion: reduce) {
          .hero-grid, .hero-topo-main, .hero-topo-sec, .hero-glow-a, .hero-glow-b {
            transform: none !important;
          }
          .hero-parallax {
            --hero-p: 0 !important;
          }
          .hero-grid { opacity: 0.18 !important; }
          .hero-topo-main { opacity: 0.9 !important; }
          .hero-topo-sec { opacity: 0.75 !important; }
        }

        @media (max-width: 768px) {
          .hero-grid {
            right: 42%;
            opacity: calc(0.10 + var(--hero-p) * 0.04);
            -webkit-mask-image: linear-gradient(to right, black 65%, transparent 100%);
            mask-image: linear-gradient(to right, black 65%, transparent 100%);
          }
          .hero-topo-main {
            left: 16%;
            right: -8%;
            opacity: calc(0.55 + var(--hero-p) * 0.1);
            transform: translateY(calc(var(--hero-p) * -28px)) scale(calc(1 + var(--hero-p) * 0.02));
          }
          /* Reducir densidad de curvas en movil: ocultar lineas alternas */
          .hero-topo-main .tp-dense:nth-child(odd) { display: none; }
          .hero-topo-sec {
            left: 28%;
            opacity: calc(0.4 + var(--hero-p) * 0.06);
          }
          .hero-glow-a { width: 340px; height: 340px; filter: blur(70px); }
          .hero-glow-b { width: 260px; height: 260px; filter: blur(60px); }
        }
      `}</style>
    </div>
  )
}
