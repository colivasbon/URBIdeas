// Verifica un JSON municipal v2: demografía intacta + bloque económico.
// Uso: npx tsx scripts/verify-economia.ts 02069
import { config } from 'dotenv'

config({ path: '.env.local' })

async function main(): Promise<void> {
  const codigo = process.argv[2]
  const base = process.env.NEXT_PUBLIC_SOCIDEAS_R2_BASE
  const env = (await (await fetch(`${base}/socideas/v2/municipios/${codigo}.json`)).json()) as {
    version: number
    codigo_ine: string
    indicators: { slug: string }[]
    sources: { slug: string }[]
    valores: unknown[]
  }
  console.log('version:', env.version, 'bytes:', JSON.stringify(env).length)
  console.log('sources:', env.sources.map((s) => s.slug).join(','))
  const bySlug = new Map<string, number>()
  const tuplas = env.valores as [number, number, number | null, string | null, number, number, string | null, string | null, string][]
  for (const t of tuplas) {
    const slug = env.indicators[t[0]]?.slug ?? '?'
    bySlug.set(slug, (bySlug.get(slug) ?? 0) + 1)
  }
  console.log('filas totales:', tuplas.length)
  for (const [slug, n] of [...bySlug.entries()].sort()) console.log(`  ${slug}: ${n}`)
  // Demografía de referencia: total municipal 2025 La Roda = 15643.
  const idx = env.indicators.findIndex((i) => i.slug === 'population_total')
  const tot = tuplas.filter((t) => t[0] === idx && (env as unknown as { dimensiones: Record<string, string>[] }).dimensiones[t[4]]?.ambito === 'municipio')
  console.log('population_total municipio años:', tot.length, 'ultimo:', JSON.stringify(tot[tot.length - 1]?.slice(1, 3)))
}
void main()
