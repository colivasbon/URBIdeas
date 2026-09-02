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
            {/* Main focus — large irregular concentric at ~880,520 */}
            <path d="M 640 520 C 670 380, 780 290, 890 300 C 1010 310, 1085 400, 1040 500 C 990 600, 860 630, 740 590 C 660 560, 610 600, 640 520 Z" stroke="#3E665C" strokeWidth="1.3" />
            <path d="M 675 510 C 695 405, 785 330, 875 335 C 965 340, 1020 415, 985 485 C 945 555, 850 575, 760 545 C 695 520, 650 545, 675 510 Z" stroke="#5A7A52" strokeWidth="0.95" />
            <path d="M 710 500 C 725 425, 795 365, 860 370 C 925 375, 965 425, 940 470 C 910 515, 840 525, 770 500 C 725 485, 695 515, 710 500 Z" stroke="#86B73D" strokeWidth="0.75" />
            <path d="M 750 492 C 760 445, 805 395, 852 400 C 895 405, 920 440, 900 465 C 875 490, 825 490, 775 470 C 745 455, 735 485, 750 492 Z" stroke="#3E665C" strokeWidth="0.6" />
            <path d="M 785 485 C 790 460, 815 425, 845 430 C 875 435, 885 455, 872 470 C 855 485, 820 482, 790 470 Z" stroke="#5A7A52" strokeWidth="0.45" />
            <path d="M 815 478 C 818 465, 828 445, 842 448 C 856 451, 860 462, 852 472 C 842 478, 822 476, 815 478 Z" stroke="#86B73D" strokeWidth="0.35" />

            {/* Secondary focus — top right, subtle */}
            <path d="M 1080 110 C 1100 70, 1145 45, 1190 70 C 1235 95, 1245 145, 1210 180 C 1170 210, 1100 195, 1080 150 Z" stroke="#3E665C" strokeWidth="0.85" />
            <path d="M 1105 125 C 1118 95, 1150 80, 1180 98 C 1210 116, 1215 150, 1190 170 C 1160 188, 1115 175, 1105 145 Z" stroke="#5A7A52" strokeWidth="0.6" />
            <path d="M 1130 138 C 1138 118, 1158 105, 1175 118 C 1192 131, 1190 152, 1175 162 C 1155 172, 1132 160, 1130 138 Z" stroke="#86B73D" strokeWidth="0.4" />

            {/* Secondary focus — behind central lower, very subtle */}
            <path d="M 380 580 C 410 540, 470 520, 520 545 C 570 570, 580 615, 540 640 C 490 665, 410 650, 380 600 Z" stroke="#3E665C" strokeWidth="0.7" />
            <path d="M 410 588 C 430 560, 470 545, 505 562 C 540 579, 545 610, 520 625 C 485 640, 430 628, 410 595 Z" stroke="#5A7A52" strokeWidth="0.5" />
            <path d="M 440 595 C 452 575, 475 565, 495 575 C 515 585, 515 605, 500 615 C 480 625, 450 615, 440 595 Z" stroke="#86B73D" strokeWidth="0.38" />

            {/* Valley connectors — dashed */}
            <path d="M 420 580 Q 520 610, 620 570" stroke="#3E665C" strokeWidth="0.55" strokeDasharray="7 6" opacity="0.9" />
            <path d="M 400 610 Q 510 650, 610 610" stroke="#5A7A52" strokeWidth="0.4" strokeDasharray="5 5" opacity="0.7" />

            {/* Hachures on steep slopes */}
            <g stroke="#5A7A52" strokeWidth="0.55" opacity="1">
              <path d="M 700 340 L 710 328" />
              <path d="M 730 315 L 740 302" />
              <path d="M 970 340 L 982 326" />
              <path d="M 995 385 L 1007 370" />
              <path d="M 990 450 L 1002 438" />
              <path d="M 940 530 L 952 518" />
            </g>
          </g>
        </svg>
      </div>

      {/* Topo secondary — very slow, blurred */}
      <div className="hero-topo-sec" aria-hidden="true">
        <svg viewBox="0 0 1440 700" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
          <g fill="none" stroke="#3E665C" strokeLinecap="round" strokeLinejoin="round">
            <path d="M 560 500 C 600 400, 700 340, 800 360 C 900 380, 940 460, 890 530 C 830 600, 680 610, 560 520 Z" strokeWidth="1" />
            <path d="M 600 495 C 630 425, 710 375, 790 390 C 870 405, 895 465, 855 515 C 810 565, 690 570, 600 510 Z" strokeWidth="0.7" />
            <path d="M 1060 120 C 1085 85, 1130 65, 1170 90 C 1210 115, 1215 155, 1185 180 C 1150 205, 1080 190, 1060 135 Z" strokeWidth="0.6" />
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
          right: 62%;
          z-index: 0;
          pointer-events: none;
          opacity: calc(0.10 + var(--hero-p) * 0.05);
          transform: translateY(calc(var(--hero-p) * 22px));
          will-change: transform, opacity;
          -webkit-mask-image: linear-gradient(to right, black 58%, transparent 100%);
          mask-image: linear-gradient(to right, black 58%, transparent 100%);
        }
        .hero-grid-svg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
        }
        .hero-topo-main {
          position: absolute;
          inset: -6% -2% -6% 32%;
          z-index: 1;
          pointer-events: none;
          opacity: calc(0.11 + var(--hero-p) * 0.16);
          transform: translateY(calc(var(--hero-p) * -48px)) scale(calc(1 + var(--hero-p) * 0.035));
          will-change: transform, opacity;
        }
        .hero-topo-sec {
          position: absolute;
          inset: -4% -2% -4% 28%;
          z-index: 1;
          pointer-events: none;
          opacity: calc(0.05 + var(--hero-p) * 0.07);
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
          opacity: calc(0.07 + var(--hero-p) * 0.03);
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
          opacity: calc(0.05 + var(--hero-p) * 0.02);
          filter: blur(80px);
          transform: translateY(calc(var(--hero-p) * 12px));
          will-change: transform, opacity;
        }

        @media (prefers-reduced-motion: reduce) {
          .hero-grid, .hero-topo-main, .hero-topo-sec, .hero-glow-a, .hero-glow-b {
            transform: none !important;
          }
          .hero-parallax {
            --hero-p: 0 !important;
          }
          .hero-grid { opacity: 0.09 !important; }
          .hero-topo-main { opacity: 0.11 !important; }
          .hero-topo-sec { opacity: 0.05 !important; }
        }

        @media (max-width: 768px) {
          .hero-grid {
            right: 45%;
            opacity: calc(0.06 + var(--hero-p) * 0.02);
            -webkit-mask-image: linear-gradient(to right, black 65%, transparent 100%);
            mask-image: linear-gradient(to right, black 65%, transparent 100%);
          }
          .hero-topo-main {
            left: 18%;
            right: -8%;
            opacity: calc(0.07 + var(--hero-p) * 0.08);
            transform: translateY(calc(var(--hero-p) * -28px)) scale(calc(1 + var(--hero-p) * 0.02));
          }
          .hero-topo-sec {
            left: 30%;
            opacity: calc(0.03 + var(--hero-p) * 0.04);
          }
          .hero-glow-a { width: 340px; height: 340px; filter: blur(70px); }
          .hero-glow-b { width: 260px; height: 260px; filter: blur(60px); }
        }
      `}</style>
    </div>
  )
}
