#!/usr/bin/env node
// Publica las COMPARATIVAS territoriales ADRH por provincia en R2:
//   socideas/comparativas/v1/provincia/{prov2}.json
// para que la ficha muestre renta y desigualdad a ámbito provincia/CCAA/España
// sin duplicar filas en los ~8.000 envelopes municipales.
//
// FUENTE: INE · ADRH (Tempus3) — gini/p80_p20 (tabla 53688) y renta media
// neta/bruta por persona/hogar (tabla 53689). Nombres de territorio canónicos
// (mismos que la BD) tomados de los objetos de estructura de población ya
// publicados (provincia/ccaa). Nunca se inventan series ni años.
//
// USO:
//   npx tsx --env-file=.env.local scripts/publish-comparativas.ts --publish
//   (sin --publish: solo informa en consola, sin escribir)

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import {
  ADRH_COMPARATIVA,
  fetchAdrhTabla,
  matchAdrhSerie,
  adrhPuntos,
  type AdrhSerie,
  type AdrhIndicadorComparativa,
} from '../src/lib/ine-adrh'
import { PROVINCIA_TO_CCAA } from '../src/lib/socideas-population-runtime'
import { COMPARATIVAS_SCHEMA, COMPARATIVA_UNIDAD, comparativasKey } from '../src/lib/socideas-comparativas'

const PUBLISH = process.argv.includes('--publish')
const BASE = process.env.NEXT_PUBLIC_SOCIDEAS_R2_BASE || 'https://pub-ecf1b1fd05e54263b2c664384c92c7b4.r2.dev'
const SLUGS: AdrhIndicadorComparativa[] = [
  'gini', 'p80_p20',
  'renta_neta_media_persona', 'renta_neta_media_hogar',
  'renta_bruta_media_persona', 'renta_bruta_media_hogar',
]

function r2(): S3Client | null {
  const account = process.env.R2_ACCOUNT_ID
  const key = process.env.R2_ACCESS_KEY_ID
  const secret = process.env.R2_SECRET_ACCESS_KEY
  if (!account || !key || !secret || !process.env.R2_BUCKET) return null
  return new S3Client({ region: 'auto', endpoint: `https://${account}.r2.cloudflarestorage.com`, credentials: { accessKeyId: key, secretAccessKey: secret } })
}

async function nombreTerritorio(key: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/${key}`, { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const j = (await res.json()) as { territoryName?: string }
    return typeof j.territoryName === 'string' ? j.territoryName : null
  } catch {
    return null
  }
}

async function main() {
  const tablas = new Map<number, AdrhSerie[]>()
  for (const t of [53688, 53689]) {
    const { payload } = await fetchAdrhTabla(t)
    tablas.set(t, payload)
    console.log(`tabla ${t}: ${payload.length} series`)
  }
  const client = PUBLISH ? r2() : null
  if (PUBLISH && !client) {
    console.error('Faltan credenciales R2 (R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET).')
    process.exit(1)
  }
  let ok = 0
  let fallos = 0
  for (const prov of Object.keys(PROVINCIA_TO_CCAA).sort()) {
    const provName = await nombreTerritorio(`socideas/population-structure/v1/provincia/${prov}.json`)
    const ccaaCode = PROVINCIA_TO_CCAA[prov]
    const ccaaName = ccaaCode ? await nombreTerritorio(`socideas/population-structure/v1/ccaa/${ccaaCode}.json`) : null
    if (!provName || !ccaaName) {
      console.warn(`[skip] ${prov}: sin nombre canónico (prov=${provName} ccaa=${ccaaName})`)
      fallos++
      continue
    }
    const indicators: Record<string, { unit: string; provincia: unknown[]; ccaa: unknown[]; espana: unknown[] }> = {}
    for (const slug of SLUGS) {
      const cfg = ADRH_COMPARATIVA[slug]
      const payload = tablas.get(cfg.table)
      if (!payload) continue
      const bloque = { unit: COMPARATIVA_UNIDAD[slug], provincia: [] as unknown[], ccaa: [] as unknown[], espana: [] as unknown[] }
      for (const [terr, campo] of [[provName, 'provincia'], [ccaaName, 'ccaa'], ['Total Nacional', 'espana']] as [string, 'provincia' | 'ccaa' | 'espana'][]) {
        const s = matchAdrhSerie(payload, terr, cfg.want)
        if (s) bloque[campo] = adrhPuntos(s)
      }
      if (bloque.provincia.length || bloque.ccaa.length || bloque.espana.length) indicators[slug] = bloque
    }
    const objeto = {
      schema_version: COMPARATIVAS_SCHEMA,
      domain: 'adrh_comparativas',
      provincia: { code: prov, name: provName },
      ccaa: { name: ccaaName },
      source: {
        organism: 'INE · Atlas de Distribución de Renta de los Hogares (Tempus3 53688/53689)',
        url: 'https://www.ine.es/dyngs/INEbase/operacion.htm?c=Estadistica_C&cid=1254736177088',
        retrieved_at: new Date().toISOString(),
      },
      indicators,
    }
    const body = JSON.stringify(objeto, null, 2)
    if (client) {
      await client.send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: comparativasKey(prov),
        Body: body,
        ContentType: 'application/json',
        CacheControl: 'public, max-age=86400',
        Metadata: { domain: 'adrh_comparativas', prov },
      }))
    }
    console.log(`[${PUBLISH ? 'R2' : 'dry'}] ${prov} ${provName} · indicadores=${Object.keys(indicators).length} · renta prov=${indicators.renta_neta_media_persona?.provincia.length ?? 0}p ccaa=${indicators.renta_neta_media_persona?.ccaa.length ?? 0}p`)
    ok++
  }
  console.log(`RESUMEN comparativas: provincias=${ok} fallos=${fallos}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
