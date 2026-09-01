import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SIU_URL = "https://mapas.fomento.gob.es/arcgis/rest/services/SIU/Planeamiento_Vigente/MapServer/1/query"
const BATCH_SIZE = 500

serve(async (_req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    )

    // Get total count
    const countRes = await fetch(`${SIU_URL}?where=1%3D1&returnCountOnly=true&f=json`)
    const countData = await countRes.json()
    const total = countData.count as number

    let offset = 0
    let inserted = 0
    let errors = 0

    while (offset < total) {
      // Fetch batch from SIU
      const params = new URLSearchParams({
        where: "1=1",
        outFields: "*",
        f: "json",
        resultRecordCount: String(BATCH_SIZE),
        resultOffset: String(offset),
        returnGeometry: "false"
      })

      const res = await fetch(`${SIU_URL}?${params.toString()}`)
      const data = await res.json()

      if (!data.features || data.features.length === 0) break

      // Map to our schema
      const records = data.features
        .map((f: { attributes: { ProvMunText: string; nombre: string; FiguraVigente: string; FechaFigura: number | null; observaciones: string; ComentarioVisor: string; textolink: string; UrlLink: string } }) => ({
          codigo_ine: f.attributes.ProvMunText?.trim() || "",
          municipio_nombre: f.attributes.nombre || "",
          figura_vigente: f.attributes.FiguraVigente || "",
          fecha_figura: f.attributes.FechaFigura || null,
          observaciones: f.attributes.observaciones || "",
          comentario_visor: f.attributes.ComentarioVisor || "",
          texto_link: f.attributes.textolink || "",
          url_link: f.attributes.UrlLink || "",
          fuente_datos: "SIU",
          ultima_sincronizacion: new Date().toISOString()
        }))
        .filter((r: { codigo_ine: string; municipio_nombre: string }) => r.codigo_ine && r.municipio_nombre && /^\d{5}$/.test(r.codigo_ine))

      if (records.length > 0) {
        const { error } = await supabase
          .from("siu_planeamiento")
          .upsert(records, { onConflict: "codigo_ine" })

        if (error) {
          errors += records.length
        } else {
          inserted += records.length
        }
      }

      offset += BATCH_SIZE
    }

    // Log sync job
    await supabase.from("sync_jobs").insert({
      source_type: "siu",
      source_name: "SIU Estatal - Edge Function",
      status: errors === 0 ? "success" : "partial",
      last_sync: new Date().toISOString(),
      changes_detected: inserted,
      details: { total, inserted, errors }
    })

    return new Response(JSON.stringify({ success: true, total, inserted, errors }), {
      headers: { "Content-Type": "application/json" }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    })
  }
})
