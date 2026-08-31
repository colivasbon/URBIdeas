import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // Get all active WMS layers
  const { data: capas, error } = await supabase
    .from('capas_wms')
    .select('*')
    .eq('activo', true)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  const results = []
  for (const capa of capas || []) {
    try {
      const capsUrl = `${capa.url_servicio}?service=WMS&request=GetCapabilities`
      const response = await fetch(capsUrl, { signal: AbortSignal.timeout(15000) })
      const status = response.ok ? 'active' : 'error'
      results.push({ id: capa.id, nombre: capa.nombre_capa, status, httpStatus: response.status })
      
      // Update verification date if active
      if (response.ok) {
        await supabase
          .from('capas_wms')
          .update({ fecha_verificacion: new Date().toISOString() })
          .eq('id', capa.id)
      }
    } catch (e) {
      results.push({ id: capa.id, nombre: capa.nombre_capa, status: 'unreachable', error: String(e) })
    }
  }

  return new Response(JSON.stringify({ results }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
