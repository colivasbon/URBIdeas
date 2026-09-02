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

      {/* Topo main — center-right bottom, medium speed */}
      <div className="hero-topo-main" aria-hidden="true">
        <svg viewBox="0 0 1440 700" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            {/* Main focus — relieve real con vaguadas y espolones */}
            <path d="M 602 502 C 608 438, 648 348, 698 302 C 732 272, 788 252, 848 268 C 908 284, 968 322, 1022 372 C 1068 418, 1092 482, 1068 538 C 1044 594, 976 632, 902 642 C 828 652, 718 632, 642 576 C 602 532, 586 522, 602 502 Z" stroke="#2F4A3A" strokeWidth="1" opacity="0.92" />
            {/* Entrante de vaguada SE */}
            <path d="M 978 372 C 1002 398, 1038 432, 1042 472 C 1046 512, 1022 552, 980 580 C 1008 542, 1020 498, 1008 454 C 996 410, 968 378, 940 368 Z" stroke="#2F4A3A" strokeWidth="0.55" opacity="0.42" />
            <path d="M 634 492 C 642 434, 678 358, 724 318 C 762 284, 812 270, 868 284 C 924 298, 972 332, 1018 378 C 1052 418, 1066 474, 1042 524 C 1018 574, 956 610, 884 618 C 812 626, 694 606, 632 552 C 604 522, 618 514, 634 492 Z" stroke="#3E665C" strokeWidth="0.88" opacity="0.84" />
            <path d="M 668 482 C 676 432, 706 366, 748 332 C 782 304, 824 290, 872 304 C 920 318, 962 350, 996 390 C 1028 430, 1036 478, 1010 518 C 984 558, 928 584, 862 586 C 796 588, 688 562, 660 512 C 648 488, 658 502, 668 482 Z" stroke="#4A6B52" strokeWidth="0.74" opacity="0.76" />
            {/* Espolon NE */}
            <path d="M 882 298 C 898 282, 928 270, 952 282 C 976 294, 988 318, 978 340 C 962 332, 940 312, 918 310 C 896 308, 878 314, 868 322 Z" stroke="#4A6B52" strokeWidth="0.42" opacity="0.38" />
            <path d="M 700 472 C 708 428, 734 376, 772 344 C 804 316, 838 304, 878 316 C 918 328, 952 360, 978 398 C 1004 436, 1002 478, 974 510 C 946 542, 898 558, 840 554 C 782 550, 694 522, 688 482 C 684 462, 692 488, 700 472 Z" stroke="#5A7E52" strokeWidth="0.62" opacity="0.68" />
            <path d="M 732 462 C 740 430, 762 392, 794 368 C 822 348, 852 336, 884 348 C 916 360, 938 386, 948 414 C 958 442, 940 470, 910 486 C 880 502, 832 500, 778 480 C 748 468, 724 478, 732 462 Z" stroke="#3E665C" strokeWidth="0.52" opacity="0.6" />
            <path d="M 762 452 C 768 430, 786 400, 812 388 C 838 376, 864 382, 882 402 C 900 422, 900 448, 880 464 C 860 480, 824 480, 786 464 C 764 454, 754 462, 762 452 Z" stroke="#6A8A5E" strokeWidth="0.42" opacity="0.52" />
            <path d="M 790 444 C 794 430, 808 412, 826 408 C 844 404, 860 418, 862 436 C 864 454, 848 466, 826 464 C 804 462, 782 448, 790 444 Z" stroke="#3E665C" strokeWidth="0.34" opacity="0.44" />
            <path d="M 812 440 C 815 430, 824 418, 834 418 C 844 418, 850 430, 846 440 C 842 450, 826 450, 814 442 Z" stroke="#5A7E52" strokeWidth="0.3" opacity="0.38" />

            {/* Secundario sup. derecha — 3 niveles con forma de loma alargada */}
            <path d="M 1072 108 C 1088 72, 1132 44, 1186 62 C 1232 82, 1254 124, 1230 168 C 1206 212, 1142 228, 1092 200 C 1068 188, 1062 140, 1072 108 Z" stroke="#2F4A3A" strokeWidth="0.68" opacity="0.58" />
            <path d="M 1098 122 C 1110 94, 1144 76, 1176 92 C 1208 108, 1218 140, 1194 166 C 1168 190, 1122 184, 1100 158 C 1090 144, 1092 134, 1098 122 Z" stroke="#4A6B52" strokeWidth="0.5" opacity="0.48" />
            <path d="M 1126 134 C 1134 116, 1154 104, 1172 116 C 1190 128, 1190 148, 1174 160 C 1156 170, 1132 160, 1126 136 Z" stroke="#6A8A5E" strokeWidth="0.34" opacity="0.4" />

            {/* Secundario central inferior — vaguada suave */}
            <path d="M 374 584 C 400 544, 462 516, 516 540 C 570 564, 584 608, 544 636 C 496 664, 412 648, 376 602 Z" stroke="#2F4A3A" strokeWidth="0.56" opacity="0.46" />
            <path d="M 404 592 C 424 564, 466 544, 502 560 C 538 576, 546 604, 524 620 C 492 636, 432 624, 406 596 Z" stroke="#4A6B52" strokeWidth="0.4" opacity="0.38" />
            <path d="M 438 598 C 448 580, 470 568, 490 578 C 510 588, 512 604, 498 614 C 480 624, 450 614, 438 598 Z" stroke="#5A7E52" strokeWidth="0.3" opacity="0.32" />

            {/* Curvas auxiliares sueltas — dan sensacion de territorio mas amplio */}
            <path d="M 120 620 Q 220 600, 320 615 Q 420 630, 520 610" stroke="#3E665C" strokeWidth="0.38" opacity="0.28" strokeDasharray="8 7" />
            <path d="M 1080 520 Q 1160 540, 1240 520 Q 1320 500, 1400 515" stroke="#4A6B52" strokeWidth="0.32" opacity="0.24" strokeDasharray="6 6" />
          </g>
        </svg>
      </div>

      {/* Topo secondary — muy lento, difuminado */}
      <div className="hero-topo-sec" aria-hidden="true">
        <svg viewBox="0 0 1440 700" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M 560 502 C 595 410, 698 338, 798 358 C 898 378, 942 458, 892 528 C 832 598, 678 608, 562 518 Z" stroke="#2F4A3A" strokeWidth="0.85" />
            <path d="M 600 496 C 628 428, 708 376, 788 390 C 868 404, 894 462, 854 512 C 808 562, 688 568, 600 508 Z" stroke="#3E665C" strokeWidth="0.58" />
            <path d="M 1060 118 C 1084 84, 1128 64, 1168 88 C 1208 112, 1214 152, 1184 178 C 1148 202, 1080 188, 1060 132 Z" stroke="#4A6B52" strokeWidth="0.48" />
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
          opacity: calc(0.22 + var(--hero-p) * 0.18);
          transform: translateY(calc(var(--hero-p) * -48px)) scale(calc(1 + var(--hero-p) * 0.035));
          will-change: transform, opacity;
        }
        .hero-topo-sec {
          position: absolute;
          inset: -4% -2% -4% 26%;
          z-index: 1;
          pointer-events: none;
          opacity: calc(0.10 + var(--hero-p) * 0.10);
          transform: translateY(calc(var(--hero-p) * -16px)) scale(calc(1 + var(--hero-p) * 0.015));
          filter: blur(0.7px);
          will-change: transform, opacity;
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
        [data-theme="light"] .hero-topo-main { opacity: calc(0.18 + var(--hero-p) * 0.14); }
        [data-theme="light"] .hero-topo-sec { opacity: calc(0.08 + var(--hero-p) * 0.08); }
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
          .hero-topo-main { opacity: 0.22 !important; }
          .hero-topo-sec { opacity: 0.10 !important; }
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
            opacity: calc(0.14 + var(--hero-p) * 0.10);
            transform: translateY(calc(var(--hero-p) * -28px)) scale(calc(1 + var(--hero-p) * 0.02));
          }
          .hero-topo-sec {
            left: 28%;
            opacity: calc(0.06 + var(--hero-p) * 0.06);
          }
          .hero-glow-a { width: 340px; height: 340px; filter: blur(70px); }
          .hero-glow-b { width: 260px; height: 260px; filter: blur(60px); }
        }
      `}</style>
    </div>
  )
}
