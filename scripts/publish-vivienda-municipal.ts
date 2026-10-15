#!/usr/bin/env node
// Publicador del agregado MUNICIPAL de vivienda y hogares (Censo 2021) en R2
// `socideas/vivienda/v1/{ine}.json`, para que el libro SOCideas (hoja 06) lo lea.
//
// FUENTE: INE Censos 2021 "Indicadores para secciones censales"
//   https://www.ine.es/censos2021/C2021_Indicadores.csv  (ver licencia en el loader)
// REGLAS:
//   - Solo se SUMAN columnas absolutas (t18_viviendas, t19_princ/no-princ, t21_hogares,
//     t22_unipersonales) sobre las secciones PUBLICADAS. Secciones < 100 hab. vienen
//     suprimidas (todas las celdas vacías salvo t1_1) y se EXCLUYEN: el resultado es
//     cota inferior (`cotaInferior`).
//   - El fichero NO separa secundarias de vacías ni publica superficie/antigüedad:
//     esos campos viajan como null (ND), nunca 0.
//   - Nunca se derivan proporciones promediando porcentajes.
//
// USO:
//   npx tsx --env-file=.env.local scripts/publish-vivienda-municipal.ts --municipalities=45090,02003 --publish
//   (sin --publish: solo escribe local en tmp/vivienda/)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { parseIndicadoresCsv, SOURCE_URL, type ParsedRow, type Col } from './load-section-vivienda-hogares'

const arg = (name: string): string | null => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : null
}
const PUBLISH = process.argv.includes('--publish')
const DRY = process.argv.includes('--dry')
const LOCAL_CSV = resolve('tmp/audit/sections/probes/downloads/censos2021/C2021_Indicadores.csv')

const ABS: Record<string, Col> = {
  total: 't18_1',
  principales: 't19_1',
  noPrincipales: 't19_2',
  hogaresTotales: 't21_1',
  hogaresUnipersonales: 't22_1',
}

function r2(): S3Client | null {
  const account = process.env.R2_ACCOUNT_ID
  const key = process.env.R2_ACCESS_KEY_ID
  const secret = process.env.R2_SECRET_ACCESS_KEY
  if (!account || !key || !secret || !process.env.R2_BUCKET) return null
  return new S3Client({
    region: 'auto',
    endpoint: `https://${account}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: key, secretAccessKey: secret },
  })
}

async function ensureCsv(): Promise<string> {
  if (existsSync(LOCAL_CSV)) return readFileSync(LOCAL_CSV, 'utf8')
  console.log('Descargando', SOURCE_URL)
  const res = await fetch(SOURCE_URL, { headers: { 'User-Agent': 'SOCideas/1.0' } })
  if (!res.ok) throw new Error(`descarga ${res.status}`)
  const text = await res.text()
  mkdirSync(dirname(LOCAL_CSV), { recursive: true })
  writeFileSync(LOCAL_CSV, text)
  return text
}

interface Agregado {
  secciones: number
  suprimidas: number
  sums: Record<string, number>
}

function agregar(filas: ParsedRow[]): Agregado {
  const sums: Record<string, number> = {}
  let suprimidas = 0
  for (const f of filas) {
    if (f.suppressed) { suprimidas += 1; continue }
    for (const [field, col] of Object.entries(ABS)) {
      const v = f.cells[col]
      if (typeof v === 'number') sums[field] = (sums[field] ?? 0) + v
    }
  }
  return { secciones: filas.filter((f) => !f.suppressed).length, suprimidas, sums }
}

async function main() {
  const conMunis = process.argv.some((a) => a.startsWith('--municipalities='))
  const munis = conMunis ? (arg('municipalities') ?? '').split(',').map((s) => s.trim()).filter(Boolean) : []
  if (conMunis && munis.length === 0) { console.error('usa --municipalities=45090,02003'); process.exit(1) }
  const nacional = !conMunis
  const text = await ensureCsv()
  const { rows } = parseIndicadoresCsv(text)
  const porMuni = new Map<string, ParsedRow[]>()
  for (const r of rows) {
    if (!nacional && !munis.includes(r.municipalityCode)) continue
    const arr = porMuni.get(r.municipalityCode) ?? []
    arr.push(r)
    porMuni.set(r.municipalityCode, arr)
  }
  const targets = nacional ? [...porMuni.keys()].sort() : munis

  const client = PUBLISH ? r2() : null
  if (PUBLISH && !client) { console.error('Faltan credenciales R2 (R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET).'); process.exit(1) }

  let publicados = 0
  let omitidosSinDato = 0
  let fallidos = 0

  const putConReintento = async (key: string, body: string, ine: string): Promise<void> => {
    for (let intento = 1; intento <= 2; intento++) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (client as any).send(new PutObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: key,
          Body: body,
          ContentType: 'application/json',
          CacheControl: 'public, max-age=3600',
          Metadata: { domain: 'censo2021_vivienda_hogares', ine },
        }))
        return
      } catch (e) {
        if (intento === 2) throw e
      }
    }
  }

  const procesar = async (ine: string): Promise<void> => {
    const agg = agregar(porMuni.get(ine) ?? [])
    // Municipio con TODAS las secciones suprimidas: no se publica (el lector
    // devuelve null → el libro lo declara "pendiente"). ND, nunca 0.
    if (agg.sums.total === undefined) { omitidosSinDato++; return }
    const nota = `Agregado por ${agg.secciones} sección(es) censal(es) publicadas. ` +
      (agg.suprimidas > 0 ? `${agg.suprimidas} sección(es) suprimidas por secreto (< 100 hab.): el total es cota inferior. ` : '') +
      'El fichero de secciones no separa viviendas vacías ni secundarias (se incluyen en "no principales") ni publica superficie ni antigüedad: ND.'
    const payload = {
      schema_version: '1.0.0',
      domain: 'censo2021_vivienda_hogares',
      periodo: '2021',
      fuenteLabel: 'INE · Censo de Población y Viviendas 2021 · vivienda y hogares (agregado por secciones censales)',
      tableId: null,
      total: agg.sums.total,
      principales: agg.sums.principales ?? null,
      noPrincipales: agg.sums.noPrincipales ?? null,
      vacias: null,
      secundarias: null,
      hogaresTotales: agg.sums.hogaresTotales ?? null,
      hogaresUnipersonales: agg.sums.hogaresUnipersonales ?? null,
      superficieMediaM2: null,
      antiguedadMedia: null,
      secciones: agg.secciones,
      seccionesSuprimidas: agg.suprimidas,
      cotaInferior: agg.suprimidas > 0,
      notaAgregacion: nota,
    }
    const body = JSON.stringify(payload, null, 2)
    if (DRY) { publicados++; return }
    if (client) {
      await putConReintento(`socideas/vivienda/v1/${ine}.json`, body, ine)
    } else {
      mkdirSync(resolve('tmp/vivienda'), { recursive: true })
      writeFileSync(resolve(`tmp/vivienda/${ine}.json`), body)
    }
    publicados++
  }

  const LOTE = PUBLISH ? 25 : 200
  for (let i = 0; i < targets.length; i += LOTE) {
    const lote = targets.slice(i, i + LOTE)
    const res = await Promise.allSettled(lote.map((ine) => procesar(ine)))
    for (const r of res) if (r.status === 'rejected') { fallidos++; }
    if (nacional) console.log(`... ${Math.min(i + LOTE, targets.length)}/${targets.length}`)
  }
  console.log(`RESUMEN vivienda: ${targets.length} municipios · publicados=${publicados} · omitidosSinDato=${omitidosSinDato} · fallidos=${fallidos}`)
}
main().catch((e) => { console.error(e); process.exit(1) })
