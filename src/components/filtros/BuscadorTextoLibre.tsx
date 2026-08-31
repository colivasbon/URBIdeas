"use client"

import { useState, useEffect, useRef } from "react"
import { supabase } from "@/lib/supabase"
import Link from "next/link"

interface MunicipioResult {
  id: number
  nombre: string
  codigo_ine: string
  slug: string | null
  provincias: { nombre: string } | null
}

interface NormativaResult {
  id: number
  titulo: string
  tipo: string | null
  municipio_id: number | null
  slug: string | null
}

interface NormalizedMunicipio extends MunicipioResult {
  provincias: { nombre: string } | null
}

interface NormalizedNormativa extends NormativaResult {}

export default function BuscadorTextoLibre() {
  const [query, setQuery] = useState("")
  const [municipios, setMunicipios] = useState<NormalizedMunicipio[]>([])
  const [normativa, setNormativa] = useState<NormalizedNormativa[]>([])
  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (query.trim().length < 2) {
      setMunicipios([])
      setNormativa([])
      setHasSearched(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      setHasSearched(true)

      const searchTerm = query.trim()

      const [municipiosRes, normativaRes] = await Promise.all([
        supabase
          .from("municipios")
          .select("id, nombre, codigo_ine, slug, provincias(nombre)")
          .ilike("nombre", `%${searchTerm}%`)
          .limit(10),
        supabase
          .from("normativa_vigente")
          .select("id, titulo, tipo, municipio_id, slug")
          .ilike("titulo", `%${searchTerm}%`)
          .limit(10),
      ])

      if (!municipiosRes.error && municipiosRes.data) {
        const mapped = municipiosRes.data.map((m) => ({
          ...m,
          provincias: Array.isArray(m.provincias) ? m.provincias[0] : m.provincias,
        })) as NormalizedMunicipio[]
        setMunicipios(mapped)
      }

      if (!normativaRes.error && normativaRes.data) {
        setNormativa(normativaRes.data as NormalizedNormativa[])
      }

      setLoading(false)
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  const hasResults = municipios.length > 0 || normativa.length > 0

  return (
    <div className="flex flex-col gap-3">
      {/* Search input */}
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar municipios o legislación..."
          className="w-full pl-9 pr-3 py-2 text-sm text-[var(--color-text-primary)] bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)] focus:outline-none focus:ring-2 focus:ring-[var(--color-secondary)] placeholder:text-[var(--color-text-secondary)]"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <span className="animate-spin inline-block w-4 h-4 border-2 border-[var(--color-text-secondary)] border-t-transparent rounded-full" />
          </div>
        )}
      </div>

      {/* Results */}
      {hasSearched && !loading && !hasResults && (
        <p className="text-sm text-[var(--color-text-secondary)] py-2">
          No se encontraron resultados para &quot;{query}&quot;
        </p>
      )}

      {hasResults && (
        <div className="flex flex-col gap-4 max-h-96 overflow-y-auto">
          {/* Municipios */}
          {municipios.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-secondary)] mb-2">
                Municipios
              </h4>
              <ul className="flex flex-col gap-1">
                {municipios.map((mun) => (
                  <li key={mun.id}>
                    <Link
                      href={`/municipio/${mun.slug || mun.codigo_ine}`}
                      className="flex items-center justify-between px-3 py-2 text-sm text-[var(--color-text-primary)] bg-[var(--color-card-bg)] hover:bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)] transition-colors"
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">{mun.nombre}</span>
                        <span className="text-xs text-[var(--color-text-secondary)]">
                          {mun.provincias?.nombre} · INE: {mun.codigo_ine}
                        </span>
                      </div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-text-secondary)]">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Legislación / Normativa */}
          {normativa.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-accent)] mb-2">
                Legislación
              </h4>
              <ul className="flex flex-col gap-1">
                {normativa.map((norm) => (
                  <li key={norm.id}>
                    <Link
                      href={`/normativa/${norm.slug || norm.id}`}
                      className="flex items-center justify-between px-3 py-2 text-sm text-[var(--color-text-primary)] bg-[var(--color-card-bg)] hover:bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-[var(--border-radius)] transition-colors"
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">{norm.titulo}</span>
                        {norm.tipo && (
                          <span className="text-xs text-[var(--color-text-secondary)]">
                            {norm.tipo}
                          </span>
                        )}
                      </div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-text-secondary)]">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
