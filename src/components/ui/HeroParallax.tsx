"use client"

import { useEffect, useRef } from "react"

export default function HeroParallax({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const bgRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let ticking = false

    function onScroll() {
      if (!ticking) {
        requestAnimationFrame(() => {
          const el = containerRef.current
          const bg = bgRef.current
          const content = contentRef.current
          if (!el || !bg || !content) { ticking = false; return }

          const rect = el.getBoundingClientRect()
          const vh = window.innerHeight
          if (rect.bottom < 0) { ticking = false; return }

          const progress = Math.max(0, Math.min(1, (vh - rect.top) / (vh + rect.height)))
          const offset = progress * 200

          bg.style.opacity = String(0.04 + progress * 0.16)
          bg.style.transform = `translateY(${-offset * 0.5}px)`
          content.style.transform = `translateY(${offset * 0.3}px)`

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
    <div ref={containerRef} className="relative">
      {/* Background layers */}
      <div
        ref={bgRef}
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 0, opacity: 0.04 }}
      >
        {/* Grid — fades in from 0.04 base */}
        <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="heroGrid" width="80" height="80" patternUnits="userSpaceOnUse">
              <path d="M 80 0 L 0 0 0 80" fill="none" stroke="#86B73D" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#heroGrid)" />
        </svg>

        {/* Topographic contour lines — top-down view */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1400 900" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
          <g fill="none" strokeLinecap="round">
            {/* Peak 1 — left area, concentric ovals */}
            <ellipse cx="280" cy="350" rx="220" ry="140" stroke="#3E665C" strokeWidth="1.2" transform="rotate(-15 280 350)" />
            <ellipse cx="280" cy="350" rx="170" ry="105" stroke="#86B73D" strokeWidth="0.9" transform="rotate(-12 280 350)" />
            <ellipse cx="280" cy="350" rx="120" ry="72" stroke="#3E665C" strokeWidth="0.7" transform="rotate(-10 280 350)" />
            <ellipse cx="280" cy="350" rx="70" ry="40" stroke="#86B73D" strokeWidth="0.5" transform="rotate(-8 280 350)" />
            <ellipse cx="280" cy="350" rx="30" ry="16" stroke="#3E665C" strokeWidth="0.4" transform="rotate(-5 280 350)" />

            {/* Peak 2 — center-right, larger */}
            <ellipse cx="850" cy="420" rx="280" ry="180" stroke="#86B73D" strokeWidth="1.4" transform="rotate(8 850 420)" />
            <ellipse cx="850" cy="420" rx="220" ry="140" stroke="#3E665C" strokeWidth="1" transform="rotate(6 850 420)" />
            <ellipse cx="850" cy="420" rx="160" ry="100" stroke="#86B73D" strokeWidth="0.7" transform="rotate(4 850 420)" />
            <ellipse cx="850" cy="420" rx="100" ry="60" stroke="#3E665C" strokeWidth="0.5" transform="rotate(3 850 420)" />
            <ellipse cx="850" cy="420" rx="50" ry="28" stroke="#86B73D" strokeWidth="0.4" />

            {/* Peak 3 — top right, small */}
            <ellipse cx="1150" cy="200" rx="140" ry="90" stroke="#3E665C" strokeWidth="0.9" transform="rotate(20 1150 200)" />
            <ellipse cx="1150" cy="200" rx="95" ry="58" stroke="#86B73D" strokeWidth="0.6" transform="rotate(18 1150 200)" />
            <ellipse cx="1150" cy="200" rx="50" ry="30" stroke="#3E665C" strokeWidth="0.4" transform="rotate(15 1150 200)" />

            {/* Valley ridge connecting peaks */}
            <path d="M120 550 Q300 580 500 530 Q700 480 850 520 Q1000 560 1200 510 Q1350 480 1450 500" stroke="#3E665C" strokeWidth="0.6" />
            <path d="M100 600 Q280 630 480 590 Q680 540 830 580 Q980 620 1180 570 Q1330 540 1450 555" stroke="#86B73D" strokeWidth="0.4" />
            <path d="M80 650 Q260 675 460 645 Q660 605 810 640 Q960 675 1160 630 Q1310 605 1450 615" stroke="#3E665C" strokeWidth="0.3" />

            {/* Small depression — bottom left */}
            <ellipse cx="150" cy="720" rx="100" ry="60" stroke="#86B73D" strokeWidth="0.5" transform="rotate(-10 150 720)" />
            <ellipse cx="150" cy="720" rx="55" ry="30" stroke="#3E665C" strokeWidth="0.35" transform="rotate(-8 150 720)" />
          </g>
        </svg>
      </div>

      {/* Content — moves down with parallax */}
      <div ref={contentRef} className="relative" style={{ zIndex: 1 }}>
        {children}
      </div>
    </div>
  )
}
