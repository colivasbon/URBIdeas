import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export function createSupabaseServer() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/** Versión segura: devuelve null si faltan variables de entorno en vez de
 *  lanzar una excepción. Úsala en endpoints donde la ausencia de Supabase
 *  debe devolver un error HTTP controlado en vez de crashear la función. */
export function createSupabaseServerSafe(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}
