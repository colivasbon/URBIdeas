"use client"

import { useEffect, useRef } from "react"

export default function HeroParallax({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const topoRef = useRef<HTMLDivElement>(null)
  const glowRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let ticking = false

    function onScroll() {
      if (!ticking) {
        requestAnimationFrame(() => {
          const el = containerRef.current
          const grid = gridRef.current
          const topo = topoRef.current
          const glow = glowRef.current
          const content = contentRef.current
          if (!el || !grid || !topo || !glow || !content) { ticking = false; return }

          const rect = el.getBoundingClientRect()
          const vh = window.innerHeight
          if (rect.bottom < 0 || rect.top > vh) { ticking = false; return }

          // progress 0 at top of viewport, 1 when hero is scrolled past
          const progress = Math.max(0, Math.min(1, (vh - rect.top) / (vh + rect.height)))

          // Grid fades OUT, topo fades IN
          grid.style.opacity = String(Math.max(0, 0.14 - progress * 0.14))
          topo.style.opacity = String(0.14 + progress * 0.22)

          // Parallax: different speeds
          grid.style.transform = `translateY(${progress * 60}px)`
          topo.style.transform = `translateY(${progress * -90}px)`
          glow.style.transform = `translateY(${progress * -40}px)`
          content.style.transform = `translateY(${progress * 24}px)`

          ticking = false
        })
        ticking = true
      }
    }

    window.addEventListener("scroll", onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <div ref={containerRef} className="relative overflow-hidden">
      {/* Grid layer — always visible, fades out on scroll */}
      <div
        ref={gridRef}
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 0, opacity: 0.14 }}
      >
        <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
          <defs>
            <pattern id="heroGrid" width="72" height="72" patternUnits="userSpaceOnUse">
              <path d="M 72 0 H 0 V 72" fill="none" stroke="#3A4A38" strokeWidth="1" />
              <circle cx="0" cy="0" r="1.2" fill="#86B73D" opacity="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#heroGrid)" />
        </svg>
      </div>

      {/* Topo layer — top-down contour map, fades in on scroll */}
      <div
        ref={topoRef}
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 1, opacity: 0.14 }}
      >
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1440 800" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            {/* Peak A — left, 5 contour levels */}
            <path d="M 90 360 C 120 250, 230 190, 350 230 C 460 270, 490 400, 410 500 C 310 560, 120 520, 90 360 Z" stroke="#86B73D" strokeWidth="1.6" opacity="0.9" />
            <path d="M 130 365 C 150 285, 235 235, 335 265 C 410 295, 430 390, 375 455 C 305 495, 160 465, 130 365 Z" stroke="#3E665C" strokeWidth="1.1" opacity="0.8" />
            <path d="M 175 372 C 185 315, 245 270, 318 295 C 365 320, 380 385, 340 425 C 285 450, 200 420, 175 372 Z" stroke="#86B73D" strokeWidth="0.8" opacity="0.7" />
            <path d="M 215 380 C 220 345, 255 305, 300 325 C 335 345, 335 390, 310 410 C 270 425, 230 400, 215 380 Z" stroke="#3E665C" strokeWidth="0.6" opacity="0.6" />
            <path d="M 252 382 C 256 365, 274 345, 292 355 C 308 365, 306 385, 292 394 C 275 400, 258 392, 252 382 Z" stroke="#86B73D" strokeWidth="0.5" opacity="0.5" />

            {/* Peak B — center-right, largest */}
            <path d="M 580 460 C 620 320, 760 230, 900 260 C 1040 290, 1100 410, 1020 520 C 920 620, 660 620, 580 460 Z" stroke="#86B73D" strokeWidth="1.8" opacity="0.95" />
            <path d="M 630 455 C 660 350, 765 285, 885 305 C 985 325, 1030 415, 970 490 C 895 560, 690 560, 630 455 Z" stroke="#3E665C" strokeWidth="1.2" opacity="0.85" />
            <path d="M 680 452 C 700 380, 775 325, 870 345 C 945 365, 975 430, 930 475 C 875 515, 725 510, 680 452 Z" stroke="#86B73D" strokeWidth="0.9" opacity="0.7" />
            <path d="M 730 450 C 740 405, 785 360, 855 375 C 910 390, 925 435, 895 460 C 850 480, 760 475, 730 450 Z" stroke="#3E665C" strokeWidth="0.65" opacity="0.6" />
            <path d="M 780 450 C 785 430, 810 400, 845 410 C 875 420, 880 440, 865 452 C 840 462, 795 460, 780 450 Z" stroke="#86B73D" strokeWidth="0.45" opacity="0.5" />

            {/* Peak C — top-right, small */}
            <path d="M 1040 150 C 1060 90, 1120 50, 1180 80 C 1240 110, 1250 180, 1200 220 C 1140 250, 1060 220, 1040 150 Z" stroke="#3E665C" strokeWidth="1" opacity="0.75" />
            <path d="M 1075 155 C 1088 110, 1125 85, 1170 105 C 1210 125, 1215 175, 1180 200 C 1140 220, 1090 200, 1075 155 Z" stroke="#86B73D" strokeWidth="0.7" opacity="0.6" />
            <path d="M 1110 162 C 1118 135, 1138 115, 1162 128 C 1185 141, 1184 168, 1166 180 C 1142 192, 1118 178, 1110 162 Z" stroke="#3E665C" strokeWidth="0.5" opacity="0.5" />

            {/* Valley / saddle between peaks */}
            <path d="M 420 580 Q 520 620, 600 580 Q 680 540, 780 560" stroke="#3E665C" strokeWidth="0.7" opacity="0.5" strokeDasharray="8 6" />
            <path d="M 400 620 Q 510 665, 600 625 Q 700 585, 800 605" stroke="#86B73D" strokeWidth="0.5" opacity="0.4" strokeDasharray="6 5" />

            {/* Isolated hill — bottom */}
            <path d="M 80 680 C 110 630, 170 610, 220 640 C 270 670, 260 720, 210 740 C 150 750, 80 720, 80 680 Z" stroke="#86B73D" strokeWidth="0.7" opacity="0.5" />
            <path d="M 115 682 C 130 655, 165 640, 195 658 C 225 676, 220 705, 195 716 C 160 724, 115 705, 115 682 Z" stroke="#3E665C" strokeWidth="0.5" opacity="0.4" />

            {/* Wide area contours — bottom */}
            <path d="M -20 740 Q 200 720, 400 735 Q 650 755, 900 730 Q 1150 705, 1460 730" stroke="#3E665C" strokeWidth="0.5" opacity="0.35" />
            <path d="M -20 770 Q 250 750, 500 765 Q 750 785, 1000 760 Q 1250 735, 1460 760" stroke="#86B73D" strokeWidth="0.35" opacity="0.3" />

            {/* Elevation ticks — short hachures on steep slopes */}
            <g stroke="#86B73D" strokeWidth="0.6" opacity="0.4">
              <path d="M 380 270 L 390 260" />
              <path d="M 400 285 L 412 274" />
              <path d="M 420 310 L 432 298" />
              <path d="M 430 340 L 442 328" />
              <path d="M 930 310 L 940 298" />
              <path d="M 960 340 L 972 327" />
              <path d="M 980 380 L 992 366" />
              <path d="M 960 450 L 972 438" />
            </g>
          </g>
        </svg>
      </div>

      {/* Glow orbs */}
      <div
        ref={glowRef}
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 2 }}
      >
        <div className="absolute top-[8%] right-[6%] w-[520px] h-[520px] rounded-full blur-[110px] bg-[var(--color-primary)] opacity-[0.09]" />
        <div className="absolute bottom-[12%] left-[2%] w-[420px] h-[420px] rounded-full blur-[100px] bg-[var(--color-secondary)] opacity-[0.07]" />
        <div className="absolute top-[45%] left-[42%] w-[300px] h-[300px] rounded-full blur-[90px] bg-[var(--color-secondary)] opacity-[0.04]" />
      </div>

      {/* Content */}
      <div ref={contentRef} className="relative" style={{ zIndex: 10 }}>
        {children}
      </div>
    </div>
  )
}
