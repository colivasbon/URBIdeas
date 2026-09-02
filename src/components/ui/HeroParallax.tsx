"use client"

import { useEffect, useRef } from "react"

export default function HeroParallax({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const bgRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    const bg = bgRef.current
    if (!el || !bg) return

    let ticking = false

    function onScroll() {
      if (!ticking) {
        requestAnimationFrame(() => {
          const rect = el!.getBoundingClientRect()
          const viewportH = window.innerHeight
          if (rect.bottom < 0) {
            ticking = false
            return
          }
          const progress = Math.max(0, Math.min(1, (viewportH - rect.top) / (viewportH + rect.height)))
          const offset = progress * 150
          bg!.style.transform = `translateY(${-offset}px)`
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
    <div ref={ref} className="relative">
      {/* Parallax background layer — extends beyond container */}
      <div
        ref={bgRef}
        className="absolute left-0 right-0 pointer-events-none will-change-transform"
        style={{ top: '-100px', bottom: '-100px', zIndex: 0 }}
      >
        {/* Topo contour pattern */}
        <div className="topo-pattern absolute inset-0" />
        {/* Gradient glows that move with parallax */}
        <div className="absolute top-[5%] right-[5%] w-[500px] h-[500px] bg-[var(--color-primary)]/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[10%] left-[0%] w-[400px] h-[400px] bg-[var(--color-secondary)]/7 rounded-full blur-[100px]" />
      </div>
      {/* Content layer */}
      <div className="relative" style={{ zIndex: 1 }}>
        {children}
      </div>
    </div>
  )
}
