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
            {/* Cumbre principal — 7 curvas coherentes, mismo patron de vaguadas/espolones */}
            <path d="M 588 502 C 594 418, 646 322, 714 284 C 782 250, 864 260, 934 300 C 1004 340, 1068 410, 1072 484 C 1076 558, 1022 620, 944 646 C 866 672, 732 642, 648 584 C 598 544, 574 524, 588 502 Z" stroke="#2F4A3A" strokeWidth="1" opacity="0.92" />
            <path d="M 618 494 C 624 424, 668 336, 730 302 C 790 268, 862 280, 924 316 C 986 352, 1042 418, 1042 480 C 1042 544, 994 598, 924 620 C 854 642, 724 616, 648 562 C 614 530, 604 514, 618 494 Z" stroke="#3E665C" strokeWidth="0.86" opacity="0.82" />
            <path d="M 648 484 C 654 418, 688 350, 742 318 C 796 286, 856 298, 914 332 C 972 366, 1014 422, 1010 480 C 1006 538, 962 582, 898 600 C 834 618, 712 592, 656 538 C 628 510, 634 502, 648 484 Z" stroke="#4A6B52" strokeWidth="0.72" opacity="0.74" />
            <path d="M 678 474 C 684 422, 708 362, 754 330 C 798 298, 848 312, 900 342 C 952 372, 984 424, 976 476 C 968 528, 926 566, 868 576 C 810 586, 700 562, 670 516 C 658 492, 668 492, 678 474 Z" stroke="#5A7E52" strokeWidth="0.6" opacity="0.66" />
            <path d="M 708 464 C 714 424, 730 372, 768 344 C 804 318, 842 324, 888 354 C 934 384, 954 426, 942 468 C 930 510, 890 536, 838 538 C 786 540, 692 514, 698 474 C 702 458, 700 478, 708 464 Z" stroke="#3E665C" strokeWidth="0.5" opacity="0.58" />
            <path d="M 738 454 C 742 428, 758 394, 786 374 C 814 354, 842 348, 876 368 C 910 388, 924 418, 912 444 C 900 470, 866 482, 816 478 C 766 474, 726 452, 738 454 Z" stroke="#6A8A5E" strokeWidth="0.4" opacity="0.5" />
            <path d="M 768 446 C 772 430, 784 408, 806 396 C 828 384, 850 390, 866 410 C 882 430, 880 450, 862 462 C 844 474, 814 472, 774 454 C 766 450, 762 450, 768 446 Z" stroke="#3E665C" strokeWidth="0.33" opacity="0.42" />
            {/* Vaguada SE — coherente en todas las cotas, trazo auxiliar */}
            <path d="M 978 352 C 1000 378, 1032 414, 1040 454 C 1048 494, 1026 532, 988 560" stroke="#2F4A3A" strokeWidth="0.42" opacity="0.32" strokeDasharray="6 5" />

            {/* Secundario sup. derecha — 3 niveles coherentes alargados */}
            <path d="M 1072 108 C 1088 72, 1132 44, 1186 62 C 1232 82, 1254 124, 1230 168 C 1206 212, 1142 228, 1092 200 C 1068 188, 1062 140, 1072 108 Z" stroke="#2F4A3A" strokeWidth="0.68" opacity="0.58" />
            <path d="M 1098 122 C 1110 94, 1144 76, 1176 92 C 1208 108, 1218 140, 1194 166 C 1168 190, 1122 184, 1100 158 C 1090 144, 1092 134, 1098 122 Z" stroke="#4A6B52" strokeWidth="0.5" opacity="0.48" />
            <path d="M 1126 134 C 1134 116, 1154 104, 1172 116 C 1190 128, 1190 148, 1174 160 C 1156 170, 1132 160, 1126 136 Z" stroke="#6A8A5E" strokeWidth="0.34" opacity="0.4" />

            {/* Secundario central inferior — 3 niveles coherentes */}
            <path d="M 374 584 C 400 544, 462 516, 516 540 C 570 564, 584 608, 544 636 C 496 664, 412 648, 376 602 Z" stroke="#2F4A3A" strokeWidth="0.56" opacity="0.46" />
            <path d="M 404 592 C 424 564, 466 544, 502 560 C 538 576, 546 604, 524 620 C 492 636, 432 624, 406 596 Z" stroke="#4A6B52" strokeWidth="0.4" opacity="0.38" />
            <path d="M 438 598 C 448 580, 470 568, 490 578 C 510 588, 512 604, 498 614 C 480 624, 450 614, 438 598 Z" stroke="#5A7E52" strokeWidth="0.3" opacity="0.32" />
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
