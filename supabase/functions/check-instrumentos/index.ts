import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // Mark instruments not verified in 6 months
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  const { data, error } = await supabase
    .from('fuentes_geoportales')
    .update({ activo: false })
    .lt('ultima_actualizacion', sixMonthsAgo.toISOString())
    .eq('activo', true)
    .select()

  return new Response(JSON.stringify({ 
    marked_stale: data?.length || 0,
    cutoff_date: sixMonthsAgo.toISOString()
  }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
