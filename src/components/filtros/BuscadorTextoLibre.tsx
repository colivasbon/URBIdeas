"use client"

import { useState, useEffect, useRef, useId } from "react"
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

type NormalizedNormativa = NormativaResult

export default function BuscadorTextoLibre() {
  const [query, setQuery] = useState("")
  const [municipios, setMunicipios] = useState<NormalizedMunicipio[]>([])
  const [normativa, setNormativa] = useState<NormalizedNormativa[]>([])
  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputId = useId()

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (query.trim().length < 2) {
      // Limpia los resultados al vaciar la consulta para no mostrar datos obsoletos.
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
    <div className="flex flex-col gap-4">
      <div className="relative">
        <label htmlFor={inputId} className="sr-only">Buscar municipios o legislación</label>
        <input
          id={inputId}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Busque un municipio o una norma"
          className="input pr-10"
        />
        {loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" role="status" aria-label="Buscando">
            <span className="spinner" aria-hidden="true" />
          </span>
        )}
      </div>

      {hasSearched && !loading && !hasResults && (
        <p className="text-sm text-[var(--text-muted)]">
          Sin resultados para «{query}». Pruebe con otro nombre o con menos letras.
        </p>
      )}

      {hasResults && (
        <div className="flex max-h-96 flex-col gap-6 overflow-y-auto">
          {municipios.length > 0 && (
            <section>
              <h4 className="type-label text-[var(--text-secondary)]">Municipios</h4>
              <ul className="mt-2 border-t border-[var(--border-subtle)]">
                {municipios.map((mun) => (
                  <li key={mun.id}>
                    <Link href={`/municipio/${mun.slug || mun.codigo_ine}`} className="flex min-h-11 flex-col justify-center gap-0.5 border-b border-[var(--border-subtle)] px-1 py-2.5 text-sm transition-colors hover:bg-[var(--action-secondary-hover-bg)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">
                      <span className="font-medium text-[var(--text-link)]">{mun.nombre}</span>
                      <span className="tnum text-xs text-[var(--text-muted)]">
                        {mun.provincias?.nombre ? `${mun.provincias.nombre}, ` : ""}INE {mun.codigo_ine}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {normativa.length > 0 && (
            <section>
              <h4 className="type-label text-[var(--text-secondary)]">Legislación</h4>
              <ul className="mt-2 border-t border-[var(--border-subtle)]">
                {normativa.map((norm) => (
                  <li key={norm.id}>
                    <Link href={`/normativa/${norm.slug || norm.id}`} className="flex min-h-11 flex-col justify-center gap-0.5 border-b border-[var(--border-subtle)] px-1 py-2.5 text-sm transition-colors hover:bg-[var(--action-secondary-hover-bg)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">
                      <span className="font-medium text-[var(--text-link)]">{norm.titulo}</span>
                      {norm.tipo && <span className="text-xs text-[var(--text-muted)]">{norm.tipo}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
