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
            {/* Cumbre principal — curvas con vaguadas y espolones coherentes, trazado quebrado */}
            <path d="M 588 505 C 594 448, 612 382, 648 332 C 672 300, 712 268, 768 252 C 824 236, 888 254, 944 292 C 1000 330, 1054 384, 1078 444 C 1102 504, 1078 566, 1028 608 C 978 650, 894 666, 810 648 C 726 630, 640 582, 590 524 C 578 508, 584 518, 588 505 Z" stroke="#2F4A3A" strokeWidth="0.95" opacity="0.88" />
            {/* Vaguada SE entrante — se repite coherente */}
            <path d="M 1002 360 C 1018 388, 1036 422, 1042 458 C 1048 494, 1032 528, 994 556" stroke="#2F4A3A" strokeWidth="0.4" opacity="0.28" strokeDasharray="6 5" />
            <path d="M 620 496 C 626 446, 646 384, 678 336 C 706 298, 744 268, 796 256 C 848 244, 900 266, 950 304 C 1000 342, 1046 394, 1056 450 C 1066 506, 1042 560, 994 596 C 946 632, 864 648, 750 628 C 664 608, 602 554, 620 496 Z" stroke="#3E665C" strokeWidth="0.82" opacity="0.80" />
            <path d="M 650 486 C 656 440, 674 386, 704 342 C 732 306, 768 276, 814 268 C 860 260, 908 282, 952 316 C 996 350, 1032 400, 1034 452 C 1036 504, 1006 550, 958 580 C 910 610, 830 622, 718 598 C 642 574, 632 512, 650 486 Z" stroke="#4A6B52" strokeWidth="0.70" opacity="0.72" />
            <path d="M 680 476 C 686 436, 702 386, 730 346 C 758 312, 790 286, 832 284 C 874 282, 916 306, 954 340 C 992 374, 1010 418, 998 462 C 986 506, 946 542, 892 556 C 838 570, 700 548, 672 494 C 664 476, 672 490, 680 476 Z" stroke="#5A7E52" strokeWidth="0.58" opacity="0.64" />
            <path d="M 710 466 C 716 432, 730 392, 756 362 C 782 332, 808 312, 838 314 C 868 316, 900 336, 928 368 C 956 400, 962 436, 944 464 C 926 492, 888 510, 834 510 C 780 510, 696 484, 710 466 Z" stroke="#3E665C" strokeWidth="0.48" opacity="0.56" />
            <path d="M 740 456 C 744 432, 760 400, 784 380 C 808 360, 834 350, 862 364 C 890 378, 906 404, 904 430 C 902 456, 876 472, 836 470 C 796 468, 728 444, 740 456 Z" stroke="#6A8A5E" strokeWidth="0.38" opacity="0.48" />
            <path d="M 770 448 C 773 432, 786 410, 806 398 C 826 386, 846 392, 862 410 C 878 428, 876 448, 860 460 C 844 472, 812 470, 772 450 Z" stroke="#3E665C" strokeWidth="0.32" opacity="0.40" />

            {/* Secundario sup. derecha — loma alargada coherente */}
            <path d="M 1070 110 C 1086 74, 1130 46, 1184 64 C 1230 82, 1252 124, 1230 168 C 1206 212, 1144 228, 1094 200 C 1070 186, 1062 140, 1070 110 Z" stroke="#2F4A3A" strokeWidth="0.64" opacity="0.54" />
            <path d="M 1096 124 C 1108 96, 1142 78, 1174 94 C 1206 110, 1216 140, 1194 164 C 1168 186, 1122 180, 1100 156 Z" stroke="#4A6B52" strokeWidth="0.46" opacity="0.44" />
            <path d="M 1124 136 C 1132 118, 1152 106, 1170 118 C 1188 130, 1188 148, 1172 160 C 1154 170, 1130 160, 1124 136 Z" stroke="#6A8A5E" strokeWidth="0.32" opacity="0.36" />

            {/* Secundario central inferior — cubeta suave coherente */}
            <path d="M 372 586 C 398 546, 460 518, 514 542 C 568 566, 582 610, 542 638 C 494 664, 410 648, 374 602 Z" stroke="#2F4A3A" strokeWidth="0.52" opacity="0.42" />
            <path d="M 402 594 C 422 566, 464 546, 500 562 C 536 578, 544 604, 522 620 C 490 634, 430 622, 404 596 Z" stroke="#4A6B52" strokeWidth="0.36" opacity="0.34" />
            <path d="M 436 600 C 446 582, 468 570, 488 580 C 508 590, 510 604, 496 612 C 478 622, 448 612, 436 600 Z" stroke="#5A7E52" strokeWidth="0.28" opacity="0.28" />
          </g>
        </svg>
      </div>

      {/* Topo secondary — muy lento, difuminado, coherente con principal */}
      <div className="hero-topo-sec" aria-hidden="true">
        <svg viewBox="0 0 1440 700" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M 570 508 C 578 418, 628 328, 698 286 C 768 244, 850 250, 930 290 C 1010 330, 1070 400, 1080 470 C 1090 540, 1038 602, 958 630 C 878 658, 722 632, 632 574 C 586 534, 562 522, 570 508 Z" stroke="#2F4A3A" strokeWidth="0.78" />
            <path d="M 610 498 C 618 430, 658 350, 714 308 C 770 266, 842 268, 912 308 C 982 348, 1034 412, 1038 472 C 1042 532, 990 584, 916 608 C 842 632, 700 606, 622 552 C 596 526, 600 514, 610 498 Z" stroke="#3E665C" strokeWidth="0.54" />
            <path d="M 1070 112 C 1086 76, 1130 48, 1184 66 C 1230 84, 1250 126, 1226 168 C 1202 210, 1140 226, 1090 198 C 1068 186, 1060 142, 1070 112 Z" stroke="#4A6B52" strokeWidth="0.44" />
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
