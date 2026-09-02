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
            {/* Main focus — 8 niveles organicos, centro-derecha inferior */}
            <path d="M 612 498 C 618 412, 695 302, 812 278 C 928 254, 1038 318, 1072 412 C 1106 506, 1028 594, 918 628 C 808 662, 682 628, 618 560 C 588 522, 602 542, 612 498 Z" stroke="#2F4A3A" strokeWidth="1.05" opacity="0.95" />
            <path d="M 648 488 C 658 418, 718 332, 815 315 C 912 298, 998 348, 1022 422 C 1046 496, 980 562, 885 586 C 790 610, 678 580, 642 528 C 622 498, 638 522, 648 488 Z" stroke="#3E665C" strokeWidth="0.9" opacity="0.85" />
            <path d="M 682 478 C 690 420, 738 352, 812 340 C 886 328, 958 368, 975 428 C 992 488, 938 534, 860 548 C 782 562, 692 532, 672 492 C 662 472, 672 500, 682 478 Z" stroke="#4A6B52" strokeWidth="0.75" opacity="0.78" />
            <path d="M 715 470 C 722 430, 758 375, 810 368 C 862 361, 918 390, 930 432 C 942 474, 900 508, 838 514 C 776 520, 708 492, 702 468 C 698 452, 708 484, 715 470 Z" stroke="#5A7E52" strokeWidth="0.62" opacity="0.7" />
            <path d="M 745 462 C 750 435, 775 395, 812 390 C 849 385, 882 410, 888 438 C 894 466, 864 488, 820 490 C 776 492, 732 472, 735 452 C 738 438, 740 472, 745 462 Z" stroke="#3E665C" strokeWidth="0.52" opacity="0.62" />
            <path d="M 772 456 C 776 438, 792 410, 818 408 C 844 406, 862 426, 858 444 C 854 462, 830 472, 802 468 C 774 464, 762 452, 772 456 Z" stroke="#6A8A5E" strokeWidth="0.42" opacity="0.55" />
            <path d="M 798 452 C 800 440, 810 422, 825 422 C 840 422, 848 434, 844 446 C 840 458, 822 460, 804 452 C 798 448, 794 456, 798 452 Z" stroke="#3E665C" strokeWidth="0.36" opacity="0.48" />
            <path d="M 818 448 C 820 440, 826 430, 834 430 C 842 430, 846 438, 842 446 C 838 452, 824 452, 818 448 Z" stroke="#5A7E52" strokeWidth="0.32" opacity="0.42" />

            {/* Secundario sup. derecha — 3 niveles sutiles */}
            <path d="M 1078 108 C 1096 68, 1142 42, 1188 66 C 1234 90, 1248 142, 1212 178 C 1172 212, 1102 196, 1080 150 L 1078 108 Z" stroke="#2F4A3A" strokeWidth="0.72" opacity="0.62" />
            <path d="M 1102 122 C 1116 92, 1150 78, 1180 96 C 1210 114, 1216 148, 1190 168 C 1162 186, 1116 174, 1105 144 Z" stroke="#4A6B52" strokeWidth="0.52" opacity="0.52" />
            <path d="M 1130 136 C 1138 118, 1158 106, 1174 118 C 1190 130, 1188 150, 1172 160 C 1154 170, 1132 160, 1130 136 Z" stroke="#6A8A5E" strokeWidth="0.36" opacity="0.44" />

            {/* Secundario detras zona central inferior — 3 niveles muy sutiles */}
            <path d="M 378 582 C 406 542, 466 518, 518 542 C 570 566, 582 610, 542 638 C 494 664, 410 648, 380 600 Z" stroke="#2F4A3A" strokeWidth="0.58" opacity="0.48" />
            <path d="M 408 590 C 426 562, 468 544, 504 560 C 540 576, 546 606, 522 622 C 488 638, 430 626, 410 596 Z" stroke="#4A6B52" strokeWidth="0.42" opacity="0.4" />
            <path d="M 440 596 C 450 578, 472 566, 492 576 C 512 586, 514 604, 500 614 C 482 624, 452 614, 440 596 Z" stroke="#5A7E52" strokeWidth="0.32" opacity="0.34" />

            {/* Conectores de valle — discontinuos */}
            <path d="M 420 582 Q 520 612, 618 568" stroke="#3E665C" strokeWidth="0.45" strokeDasharray="7 6" opacity="0.42" />
            <path d="M 398 612 Q 508 652, 608 612" stroke="#4A6B52" strokeWidth="0.34" strokeDasharray="5 5" opacity="0.32" />
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
