import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase-server'

/**
 * GET /api/territorio?lat=..&lng=.. — resuelve CCAA + municipio del centroide
 * con PostGIS (exacto o vecino próximo <10 km). El cruce de /mapa se acota a
 * este territorio: nunca pregunta a CCAA ajenas.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const lat = parseFloat(searchParams.get('lat') || '')
  const lng = parseFloat(searchParams.get('lng') || '')
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ data: null, error: 'lat/lng no válidos' }, { status: 400 })
  }
  try {
    const supabase = createSupabaseServer()
    const { data, error } = await supabase.rpc('resolver_territorio', { p_lng: lng, p_lat: lat })
    if (error) throw error
    const r = Array.isArray(data) ? data[0] : data
    if (!r) return NextResponse.json({ data: null, error: 'Sin municipio en 10 km' }, { status: 404 })
    return NextResponse.json({ data: r, error: null })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error interno'
    return NextResponse.json({ data: null, error: msg }, { status: 500 })
  }
}
