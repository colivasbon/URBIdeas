// Conversión puntual Fase 2A.2: reescribe los JSON v1 de R2 en formato v2
// compacto (misma clave lógica, prefijo v2). Sin llamadas al INE: lee v1,
// compacta y escribe v2. Idempotente (sobrescribe).
//
// Uso:
//   npx tsx scripts/convert-r2-v1-to-v2.ts --go [--limit 50]
//
// Requiere en .env.local: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
// R2_SECRET_ACCESS_KEY, R2_BUCKET.
import { config } from 'dotenv'
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'

config({ path: '.env.local' })

async function main() {
  const argv = process.argv.slice(2)
  const go = argv.includes('--go')
  const li = argv.indexOf('--limit')
  const limit = li >= 0 ? parseInt(argv[li + 1], 10) : undefined

  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    console.error('ERROR: faltan R2_* en .env.local')
    process.exit(1)
  }
  const { toV2Envelope, putMunicipioJson, R2_KEY_PREFIX_V1 } = await import('../src/lib/socideas-r2')

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })
  const keys: string[] = []
  let token: string | undefined
  do {
    const res = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: `${R2_KEY_PREFIX_V1}/`, ContinuationToken: token, MaxKeys: 1000 }),
    )
    for (const o of res.Contents ?? []) {
      if (o.Key?.endsWith('.json')) keys.push(o.Key)
    }
    token = res.NextContinuationToken
  } while (token)
  const lista = limit ? keys.slice(0, limit) : keys
  console.log(`Objetos v1: ${keys.length} | a convertir: ${lista.length}`)
  if (!go) {
    console.log('DRY-RUN: sin --go no se escribe nada.')
    return
  }

  // Monkey-patch temporal: getMunicipioJsonRaw lee la ruta v2 por defecto;
  // aquí leemos v1 directamente con el cliente.
  const { GetObjectCommand } = await import('@aws-sdk/client-s3')
  let ok = 0
  let fallos = 0
  let bytesAntes = 0
  let bytesDespues = 0
  for (let i = 0; i < lista.length; i++) {
    const key = lista[i]
    const ine = key.split('/').pop()?.replace('.json', '') ?? ''
    try {
      const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
      const text = (await res.Body?.transformToString()) ?? ''
      const v1 = JSON.parse(text) as {
        codigo_ine: string
        generado_en: string
        valores: {
          indicator: { slug: string; nombre: string; unidad: string | null }
          source: { slug: string; organismo: string; nombre: string }
          anio_referencia: number | null
          valor_numerico: number | null
          unidad: string | null
          dimensiones: Record<string, string>
          source_url: string | null
          source_table_id: string | null
          source_series_id?: string | null
          estado_validacion: string
        }[]
      }
      bytesAntes += text.length
      const v2 = toV2Envelope(v1.codigo_ine, v1.generado_en, v1.valores)
      const outKey = await putMunicipioJson(v1.codigo_ine, v2)
      bytesDespues += JSON.stringify(v2).length
      ok++
      if ((i + 1) % 200 === 0 || i === lista.length - 1) {
        console.log(`[${i + 1}/${lista.length}] ${ine} → ${outKey}`)
      }
    } catch (err) {
      fallos++
      console.log(`[${i + 1}/${lista.length}] ${ine}: ERROR ${err instanceof Error ? err.message : err}`)
    }
  }
  const pct = bytesAntes > 0 ? Math.round((bytesDespues / bytesAntes) * 100) : 0
  console.log(
    `FIN: ok=${ok} fallos=${fallos} bytes ${bytesAntes} → ${bytesDespues} (${pct}% del original)`,
  )
}

main().catch((err) => {
  console.error('FATAL', err instanceof Error ? err.message : err)
  process.exit(1)
})
