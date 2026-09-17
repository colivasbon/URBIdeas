"use client"

import { createContext, useContext, useEffect, useState, ReactNode } from "react"

type Theme = "dark" | "light"

const ThemeContext = createContext<{
  theme: Theme
  toggle: () => void
}>({ theme: "light", toggle: () => {} })

export function useTheme() {
  return useContext(ThemeContext)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light")
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const saved = localStorage.getItem("urbideas-theme") as Theme | null
    if (saved) {
      setTheme(saved)
      document.documentElement.setAttribute("data-theme", saved)
    } else {
      // Corporativo: Hueso como base por defecto, salvo preferencia oscura explícita
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
      const initial: Theme = prefersDark ? "dark" : "light"
      setTheme(initial)
      document.documentElement.setAttribute("data-theme", initial)
    }
  }, [])

  function toggle() {
    const next = theme === "dark" ? "light" : "dark"
    setTheme(next)
    localStorage.setItem("urbideas-theme", next)
    document.documentElement.setAttribute("data-theme", next)
  }

  if (!mounted) {
    return <>{children}</>
  }

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}
