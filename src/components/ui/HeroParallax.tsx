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
          const scrollY = -rect.top
          if (rect.bottom < 0 || scrollY < 0) {
            ticking = false
            return
          }
          // Move background slower than scroll = parallax
          const offset = scrollY * 0.35
          bg!.style.transform = `translateY(${offset}px)`
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
    <div ref={ref} className="relative overflow-hidden">
      {/* Parallax background layer */}
      <div
        ref={bgRef}
        className="absolute inset-0 -top-20 -bottom-20 pointer-events-none will-change-transform"
        style={{ zIndex: 0 }}
      >
        {/* Topo contour pattern */}
        <div className="topo-pattern absolute inset-0" />
        {/* Gradient glows that move with parallax */}
        <div className="absolute top-[10%] right-[10%] w-[500px] h-[500px] bg-[var(--color-primary)]/8 rounded-full blur-[120px]" />
        <div className="absolute bottom-[10%] left-[5%] w-[400px] h-[400px] bg-[var(--color-secondary)]/5 rounded-full blur-[100px]" />
      </div>
      {/* Content layer */}
      <div className="relative" style={{ zIndex: 1 }}>
        {children}
      </div>
    </div>
  )
}
