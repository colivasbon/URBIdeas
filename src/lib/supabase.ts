import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Inicialización PEREZOSA: el cliente se crea en el primer acceso real (en el
// navegador), no al importar el módulo. Así el prerender de rutas que solo usan
// Supabase en useEffect/client no falla aunque las env vars no existan en build.
let client: SupabaseClient | null = null

function getClient(): SupabaseClient {
  if (client) return client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error('Supabase no configurado: faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }
  client = createClient(url, key)
  return client
}

// Proxy que conserva la API `supabase.from(...)` pero difiere la creación del
// cliente hasta el primer uso (runtime), evitando fallos en build/prerender.
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient() as object, prop, receiver)
  },
})
