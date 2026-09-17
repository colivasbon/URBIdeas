/**
 * Dry-run de tablas INE candidatas para Fichas Socioeconómicas.
 *
 * Este script NO escribe en R2 ni en Supabase. Solo mide:
 * - Match territorial contra el catálogo de 8,130 municipios
 * - Tamaño de payload por tabla
 * - Supresiones detectadas
 * - Clasificación de destino (R2 vs Supabase)
 *
 * Ejecución: npx tsx scripts/dry-run-fichas-ine-tables.ts
 */

const INE_API_BASE = 'https://servicios.ine.es/wstempus/js/ES'

const TABLES = [
  {
    id: '69767',
    name: 'Movilidad migratoria (saldo total/interior/exterior)',
    expectedScale: 'municipal' as const,
    notes: 'Ya preflightada. Solo verificar que sigue accesible.',
  },
  {
    id: '69711',
    name: 'Emigración con destino al extranjero',
    expectedScale: 'municipal' as const,
    notes: 'Nueva. Requiere preflight completo.',
  },
  {
    id: '69743',
    name: 'Inmigraciones intermunicipales por municipio de destino',
    expectedScale: 'municipal' as const,
    notes: 'Nueva. Requiere preflight completo.',
  },
  {
    id: '69746',
    name: 'Emigraciones intermunicipales por municipio de procedencia',
    expectedScale: 'municipal' as const,
    notes: 'Nueva. Requiere preflight completo.',
  },
  {
    id: '2076',
    name: 'Hostelería (puntos turísticos)',
    expectedScale: 'limited' as const,
    notes: 'Solo ~107 puntos turísticos. Muchas supresiones.',
  },
] as const

interface TableResult {
  id: string
  name: string
  httpStatus: number
  responseBytes: number
  isJson: boolean
  sampleEntries: number
  municipalCodes: Set<string>
  suppressedCount: number
  totalSampled: number
  estimatedScale: 'municipal' | 'limited' | 'provincial' | 'unknown'
  destination: 'r2_lateral' | 'supabase' | 'pending_preflight' | 'not_available'
  notes: string
}

async function fetchTableMetadata(tableId: string): Promise<{
  httpStatus: number
  contentLength: number
  isJson: boolean
  bodyPreview: string
}> {
  const url = `${INE_API_BASE}/DATOS_TABLA/${tableId}?nult=1`
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(30000),
    })
    const contentType = response.headers.get('content-type') || ''
    const contentLength = parseInt(
      response.headers.get('content-length') || '0',
      10,
    )

    if (!response.ok) {
      return {
        httpStatus: response.status,
        contentLength: 0,
        isJson: false,
        bodyPreview: '',
      }
    }

    // Read only first 100KB for preview
    const reader = response.body?.getReader()
    if (!reader) {
      return {
        httpStatus: response.status,
        contentLength,
        isJson: contentType.includes('json'),
        bodyPreview: '',
      }
    }

    const chunks: Uint8Array[] = []
    let totalBytes = 0
    const MAX_PREVIEW = 100_000 // 100KB

    while (totalBytes < MAX_PREVIEW) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      totalBytes += value.length
    }

    // Consume rest to get full size
    let fullSize = totalBytes
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      fullSize += value.length
    }

    const previewBytes = new Uint8Array(
      chunks.reduce((acc, c) => acc + c.length, 0),
    )
    let offset = 0
    for (const chunk of chunks) {
      previewBytes.set(chunk, offset)
      offset += chunk.length
    }

    const bodyPreview = new TextDecoder().decode(previewBytes)

    return {
      httpStatus: response.status,
      contentLength: fullSize || contentLength,
      isJson: contentType.includes('json'),
      bodyPreview,
    }
  } catch (error) {
    return {
      httpStatus: 0,
      contentLength: 0,
      isJson: false,
      bodyPreview: `Error: ${error}`,
    }
  }
}

function extractMunicipalCodes(preview: string): {
  codes: Set<string>
  suppressed: number
  total: number
} {
  const codes = new Set<string>()
  let suppressed = 0
  let total = 0

  // Look for COD fields with 5-digit codes
  const codMatches = preview.matchAll(/"COD"\s*:\s*"([A-Z]{2,3})(\d{5})"/g)
  for (const match of codMatches) {
    codes.add(match[2])
    total++
  }

  // Count suppressed values
  const suppressedMatches = preview.matchAll(/"Secreto"\s*:\s*true/g)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for (const _match of suppressedMatches) {
    suppressed++
  }

  return { codes, suppressed, total }
}

async function main() {
  console.log('=== Dry-run de tablas INE para Fichas Socioeconómicas ===')
  console.log(`Fecha: ${new Date().toISOString()}`)
  console.log(`Tablas a analizar: ${TABLES.length}`)
  console.log()

  const results: TableResult[] = []

  for (const table of TABLES) {
    console.log(`--- Tabla ${table.id}: ${table.name} ---`)

    const meta = await fetchTableMetadata(table.id)
    console.log(`  HTTP: ${meta.httpStatus}`)
    console.log(`  Tamaño: ${(meta.contentLength / 1024 / 1024).toFixed(2)} MB`)
    console.log(`  JSON: ${meta.isJson}`)

    if (meta.httpStatus !== 200 || !meta.isJson) {
      console.log(`  DECISIÓN: NO DISPONIBLE (HTTP ${meta.httpStatus})`)
      results.push({
        id: table.id,
        name: table.name,
        httpStatus: meta.httpStatus,
        responseBytes: meta.contentLength,
        isJson: meta.isJson,
        sampleEntries: 0,
        municipalCodes: new Set(),
        suppressedCount: 0,
        totalSampled: 0,
        estimatedScale: 'unknown',
        destination: 'not_available',
        notes: `HTTP ${meta.httpStatus} o no JSON`,
      })
      console.log()
      continue
    }

    const { codes, suppressed, total } = extractMunicipalCodes(
      meta.bodyPreview,
    )
    console.log(`  Muestra: ${total} registros`)
    console.log(`  Códigos municipales únicos: ${codes.size}`)
    console.log(`  Supresiones en muestra: ${suppressed}`)

    // Estimate scale
    let estimatedScale: TableResult['estimatedScale'] = 'unknown'
    if (codes.size > 5000) {
      estimatedScale = 'municipal'
    } else if (codes.size > 100 && codes.size <= 5000) {
      estimatedScale = 'limited'
    } else if (codes.size <= 100) {
      estimatedScale = 'limited'
    }

    // Determine destination
    let destination: TableResult['destination'] = 'pending_preflight'
    if (table.id === '69767') {
      destination = 'r2_lateral' // Already preflighted
    } else if (estimatedScale === 'municipal' && meta.contentLength > 5_000_000) {
      destination = 'r2_lateral' // High volume → R2
    } else if (estimatedScale === 'limited' || meta.contentLength < 1_000_000) {
      destination = 'supabase' // Low volume → Supabase
    }

    console.log(`  Escala estimada: ${estimatedScale}`)
    console.log(`  Destino clasificación: ${destination}`)
    console.log(`  Notas: ${table.notes}`)

    results.push({
      id: table.id,
      name: table.name,
      httpStatus: meta.httpStatus,
      responseBytes: meta.contentLength,
      isJson: meta.isJson,
      sampleEntries: total,
      municipalCodes: codes,
      suppressedCount: suppressed,
      totalSampled: total,
      estimatedScale,
      destination,
      notes: table.notes,
    })
    console.log()
  }

  // Summary
  console.log('=== RESUMEN ===')
  console.log()
  console.log(
    '| Tabla | Nombre | HTTP | Tamaño | Escala | Destino |',
  )
  console.log(
    '|-------|--------|------|--------|--------|---------|',
  )
  for (const r of results) {
    console.log(
      `| ${r.id} | ${r.name.substring(0, 40)} | ${r.httpStatus} | ${(r.responseBytes / 1024 / 1024).toFixed(1)} MB | ${r.estimatedScale} | ${r.destination} |`,
    )
  }
  console.log()

  // Decision summary
  console.log('=== DECISIONES ===')
  console.log()
  for (const r of results) {
    const decision =
      r.destination === 'r2_lateral'
        ? '→ R2 lateral (volumen alto)'
        : r.destination === 'supabase'
          ? '→ Supabase datos_fichas (volumen bajo)'
          : r.destination === 'pending_preflight'
            ? '→ PENDIENTE de preflight completo'
            : '→ NO DISPONIBLE'
    console.log(`  ${r.id} (${r.name}): ${decision}`)
  }
}

main().catch(console.error)
