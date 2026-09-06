import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'

// Buscador municipal de SOCideas (servidor).
// - codigo_ine: coincidencia exacta (rápida, sin caché).
// - provincia_id: todos los municipios de la provincia (cascada).
// - q o provincia: búsqueda insensible a acentos sobre nombre de municipio
//   Y de provincia, más alias oficiales (araba, vizcaya…). Ningún municipio
//   se llama "Álava": sin esto, buscar la provincia no devolvía nada.
// Respuesta: { data, error, count } con provincia y comunidad autónoma.

interface CacheRow {
  codigo_ine: string
  nombre: string
  poblacion: number | null
  provincia_id: string
  provincia: string
  prov_ine: string
  ccaa: string
}

// CDN Edge: la lista/catálogo de municipios es estable (8.130 filas en caché
// de memoria + respuestas de búsqueda). s-maxage 24h + SWR 7 días evita
// volver a consultar memoria del serverless en cada navegación.
const CDN_HEADERS = {
  'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
}

let cache: { filas: CacheRow[]; ts: number } | null = null
const CACHE_MS = 3600_000

// Variantes oficiales de topónimos que la normalización no resuelve.
const ALIAS_PROVINCIA: Record<string, string[]> = {
  araba: ['01'],
  alacant: ['03'],
  vizcaya: ['48'],
  guipuzcoa: ['20'],
  gerona: ['17'],
  lerida: ['25'],
  orense: ['32'],
}

function normaliza(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

async function cargarCache(supabase: ReturnType<typeof createSupabaseServer>): Promise<CacheRow[]> {
  if (cache && Date.now() - cache.ts < CACHE_MS) return cache.filas
  const filas: CacheRow[] = []
  // PostgREST devuelve como máximo 1000 filas por petición: paginar de 1000.
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('municipios')
      .select('codigo_ine, nombre, poblacion, provincia_id, provincia:provincias!inner(codigo_ine, nombre, comunidad_autonoma:comunidades_autonomas!inner(nombre))')
      .order('codigo_ine')
      .range(from, from + PAGE - 1)
    if (error) throw error
    const page = ((data ?? []) as unknown as {
      codigo_ine: string
      nombre: string
      poblacion: number | null
      provincia_id: string
      provincia: { codigo_ine: string; nombre: string; comunidad_autonoma: { nombre: string } }
    }[])
    filas.push(
      ...page.map((m) => ({
        codigo_ine: m.codigo_ine,
        nombre: m.nombre,
        poblacion: m.poblacion,
        provincia_id: m.provincia_id,
        provincia: m.provincia.nombre,
        prov_ine: m.provincia.codigo_ine,
        ccaa: m.provincia.comunidad_autonoma.nombre,
      })),
    )
    if (page.length < PAGE) break
  }
  cache = { filas, ts: Date.now() }
  return cache.filas
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') ?? '').trim()
  const provincia = (searchParams.get('provincia') ?? '').trim()
  const provinciaId = (searchParams.get('provincia_id') ?? '').trim()
  const codigoIne = (searchParams.get('codigo_ine') ?? '').trim()
  const maxLimit = provinciaId ? 500 : 50
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10) || 20, 1), maxLimit)

  if (!q && !provincia && !provinciaId && !codigoIne) {
    return NextResponse.json({ data: [], error: null, count: 0 }, { headers: CDN_HEADERS })
  }
  if (provinciaId && !/^[0-9a-f-]{36}$/i.test(provinciaId)) {
    return NextResponse.json({ data: null, error: 'provincia_id inválido', count: 0 }, { status: 400 })
  }

  try {
    const supabase = createSupabaseServer()

    // Vías exactas (sin caché).
    if (codigoIne || provinciaId) {
      const join = ''
      let query = supabase
        .from('municipios')
        .select(
          `codigo_ine, nombre, poblacion, provincia:provincias${join}(nombre, comunidad_autonoma:comunidades_autonomas(nombre))`,
        )
        .limit(limit)
      if (codigoIne) query = query.eq('codigo_ine', codigoIne)
      else query = query.eq('provincia_id', provinciaId).order('nombre')
      const { data, error } = await query
      if (error) throw error
      return NextResponse.json({ data: data ?? [], error: null, count: (data ?? []).length }, { headers: CDN_HEADERS })
    }

    // Búsqueda textual: insensible a acentos, municipio y provincia.
    const termino = normaliza(q || provincia)
    if (termino.length < 2) {
      return NextResponse.json({ data: [], error: null, count: 0 }, { headers: CDN_HEADERS })
    }
    const filas = await cargarCache(supabase)
    const aliasProvs = new Set<string>()
    for (const [alias, codes] of Object.entries(ALIAS_PROVINCIA)) {
      if (termino.includes(alias)) codes.forEach((c) => aliasProvs.add(c))
    }
    const scored: { m: CacheRow; orden: number }[] = []
    for (const m of filas) {
      const nom = normaliza(m.nombre)
      const prov = normaliza(m.provincia)
      let orden = -1
      if (nom.startsWith(termino)) orden = 0
      else if (nom.includes(termino)) orden = 1
      else if (prov === termino || prov.startsWith(termino)) orden = 2
      else if (prov.includes(termino)) orden = 3
      else {
        if (aliasProvs.has(m.prov_ine)) orden = 2
      }
      if (orden >= 0) scored.push({ m, orden })
    }
    // El prov_ine interno no sale en la respuesta.
    scored.sort(
      (a, b) => a.orden - b.orden || a.m.nombre.localeCompare(b.m.nombre, 'es'),
    )
    const data = scored.slice(0, limit).map(({ m }) => ({
      codigo_ine: m.codigo_ine,
      nombre: m.nombre,
      poblacion: m.poblacion,
      provincia: { nombre: m.provincia, comunidad_autonoma: { nombre: m.ccaa } },
    }))
    return NextResponse.json({ data, error: null, count: data.length }, { headers: CDN_HEADERS })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ data: null, error: message, count: 0 }, { status: 500 })
  }
}
