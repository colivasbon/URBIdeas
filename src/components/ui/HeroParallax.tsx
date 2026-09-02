"use client"

import { useEffect, useRef, useState } from "react"

export default function HeroParallax({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollProgress, setScrollProgress] = useState(0)

  useEffect(() => {
    let ticking = false

    function onScroll() {
      if (!ticking) {
        requestAnimationFrame(() => {
          const el = containerRef.current
          if (!el) { ticking = false; return }
          const rect = el.getBoundingClientRect()
          const vh = window.innerHeight
          if (rect.bottom < 0) { ticking = false; return }
          const progress = Math.max(0, Math.min(1, (vh - rect.top) / (vh + rect.height)))
          setScrollProgress(progress)
          ticking = false
        })
        ticking = true
      }
    }

    window.addEventListener("scroll", onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const gridOpacity = Math.max(0, 0.08 - scrollProgress * 0.12)
  const topoOpacity = Math.min(0.2, scrollProgress * 0.35)
  const glowY = scrollProgress * -80

  return (
    <div ref={containerRef} className="relative">
      {/* Background layers */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
        {/* Grid layer — fades out on scroll */}
        <svg
          className="absolute inset-0 w-full h-full"
          style={{ opacity: gridOpacity }}
        >
          <defs>
            <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 60" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-[var(--color-border-subtle)]" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {/* Topo contour layer — fades in on scroll */}
        <svg
          className="absolute inset-0 w-full h-full"
          style={{ opacity: topoOpacity, transform: `translateY(${glowY}px)` }}
          viewBox="0 0 1200 800"
          preserveAspectRatio="xMidYMid slice"
        >
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            {/* Mountain cluster — left */}
            <path d="M-50 650 L80 600 L150 560 L200 580 L280 520 L340 545 L420 490 L490 510 L560 460 L640 485 L720 440 L800 460 L880 420 L960 445 L1040 400 L1120 420 L1250 390" stroke="var(--color-secondary)" strokeWidth="1.5" />
            <path d="M-50 670 L70 625 L140 590 L190 608 L270 555 L330 575 L410 525 L480 542 L550 498 L630 518 L710 478 L790 495 L870 460 L950 480 L1030 445 L1110 462 L1250 435" stroke="var(--color-secondary)" strokeWidth="0.8" />
            <path d="M-50 688 L65 648 L135 618 L185 632 L265 588 L325 605 L405 560 L475 574 L545 535 L625 552 L705 516 L785 530 L865 498 L945 514 L1025 484 L1105 498 L1250 475" stroke="var(--color-primary)" strokeWidth="0.5" />

            {/* Central ridge */}
            <path d="M300 500 L380 420 L430 380 L480 350 L530 310 L580 280 L630 260 L680 240 L730 270 L780 310 L830 350 L880 390 L940 420 L1000 450 L1060 480 L1150 500" stroke="var(--color-secondary)" strokeWidth="1.8" />
            <path d="M310 520 L390 448 L440 412 L490 385 L540 348 L590 322 L640 305 L690 288 L740 312 L790 345 L840 380 L890 415 L950 442 L1010 468 L1050 492 L1140 518" stroke="var(--color-secondary)" strokeWidth="0.9" />
            <path d="M320 538 L398 472 L448 442 L498 418 L548 388 L598 365 L648 350 L698 336 L748 355 L798 382 L848 412 L898 440 L958 462 L1018 484 L1045 506 L1130 532" stroke="var(--color-primary)" strokeWidth="0.5" />
            <path d="M335 555 L408 498 L458 472 L508 452 L558 428 L608 408 L658 395 L708 384 L758 400 L808 422 L858 445 L908 465 L968 482 L1028 500 L1040 518 L1120 548" stroke="var(--color-primary)" strokeWidth="0.35" />

            {/* Small peak — right */}
            <path d="M850 520 L900 470 L940 440 L980 420 L1020 400 L1060 425 L1100 455 L1140 480 L1200 510" stroke="var(--color-secondary)" strokeWidth="1.2" />
            <path d="M855 538 L905 495 L945 468 L985 452 L1025 438 L1065 458 L1105 482 L1145 502 L1195 525" stroke="var(--color-primary)" strokeWidth="0.6" />

            {/* Valley floor lines */}
            <path d="M-50 720 L100 712 L250 700 L400 708 L550 695 L700 703 L850 692 L1000 700 L1150 690 L1250 698" stroke="var(--color-primary)" strokeWidth="0.3" />
            <path d="M-50 740 L120 735 L280 728 L440 733 L600 725 L760 730 L920 723 L1080 728 L1250 720" stroke="var(--color-secondary)" strokeWidth="0.25" />

            {/* Upper contour — small hill */}
            <path d="M150 280 L200 240 L250 210 L300 190 L350 210 L400 240 L450 260" stroke="var(--color-primary)" strokeWidth="0.6" />
            <path d="M155 295 L205 260 L255 238 L305 222 L355 238 L405 260 L445 278" stroke="var(--color-secondary)" strokeWidth="0.35" />
          </g>
        </svg>

        {/* Glow orbs — move with parallax */}
        <div
          className="absolute top-[5%] right-[8%] w-[500px] h-[500px] rounded-full blur-[120px] bg-[var(--color-primary)]"
          style={{ opacity: 0.08, transform: `translateY(${glowY * 0.6}px)` }}
        />
        <div
          className="absolute bottom-[15%] left-[0%] w-[400px] h-[400px] rounded-full blur-[100px] bg-[var(--color-secondary)]"
          style={{ opacity: 0.06, transform: `translateY(${glowY * 0.4}px)` }}
        />
      </div>

      {/* Content */}
      <div className="relative" style={{ zIndex: 1 }}>
        {children}
      </div>
    </div>
  )
}
