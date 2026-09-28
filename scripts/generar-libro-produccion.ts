import { assembleSocideasBookV2 } from '../src/lib/socideas-book-blocks'
import { buildSocideasBookXlsx } from '../src/lib/socideas-xlsx'
import { createSupabaseServerSafe } from '../src/lib/supabase-server'
import { getPerfilDemografico } from '../src/lib/socideas-perfil'
import { getPerfilEconomico } from '../src/lib/socideas-economia'
import { readDemographicPresentation } from '../src/lib/socideas-demographic-summary'
import { readMigrationPresentation } from '../src/lib/socideas-migration-summary'
import { readMunicipalIneLayers } from '../src/lib/socideas-ine-layers'
import { readMunicipalStructureWithBenchmarks } from '../src/lib/socideas-population-runtime'
import { readElectoralProvincial } from '../src/lib/socideas-electoral-provincial-store'
import { readAsociacionesMunicipio } from '../src/lib/socideas-asociaciones'
import { readGalMunicipio } from '../src/lib/socideas-gal'
import { readWikipediaEnrichment } from '../src/lib/wikipedia-enrichment'
import { writeFileSync } from 'fs'

async function main() {
  const codigoINE = process.argv[2] ?? '02007'
  const supabase = createSupabaseServerSafe()
  if (!supabase) { console.error('no supabase'); process.exit(1) }

  const [demo, eco, demoExtra, migracion, ineLayers, populationStructure] = await Promise.all([
    getPerfilDemografico(supabase, codigoINE, {}),
    getPerfilEconomico(supabase, codigoINE),
    readDemographicPresentation(codigoINE).catch(() => null),
    readMigrationPresentation(codigoINE).catch(() => null),
    readMunicipalIneLayers(codigoINE).catch(() => null),
    readMunicipalStructureWithBenchmarks(codigoINE).catch(() => null),
  ])

  const provinciaCodigo = demo?.municipio?.provincia_codigo_ine ?? eco?.municipio?.provincia_codigo_ine ?? null
  const [electoralProvincial, asociaciones, gal, wikipedia] = await Promise.all([
    provinciaCodigo ? readElectoralProvincial(provinciaCodigo.slice(0, 2)).catch(() => null) : Promise.resolve(null),
    readAsociacionesMunicipio(supabase, codigoINE).catch(() => null),
    readGalMunicipio(supabase, codigoINE).catch(() => null),
    readWikipediaEnrichment(codigoINE).catch(() => null),
  ])

  const book = assembleSocideasBookV2({
    municipio: demo?.municipio?.nombre ?? eco?.municipio?.nombre ?? codigoINE,
    codigoINE,
    provincia: demo?.municipio?.provincia ?? eco?.municipio?.provincia ?? 'No disponible',
    comunidadAutonoma: demo?.municipio?.comunidad_autonoma ?? eco?.municipio?.comunidad_autonoma ?? 'No disponible',
    fechaGeneracion: new Date().toISOString().slice(0, 10),
    perfilDemografia: demo?.status === 'ok' || demo?.status === 'empty' ? demo.perfil : null,
    perfilEconomia: eco?.status === 'ok' || eco?.status === 'empty' ? eco.perfil : null,
    ineLayers: ineLayers ?? null,
    demoExtra,
    migracion,
    populationStructure: populationStructure ?? null,
    congresoProvincia: electoralProvincial?.congreso ?? null,
    autonomicasCircunscripcion: electoralProvincial?.autonomicas ?? null,
    senadoCircunscripcion: electoralProvincial?.senado ?? null,
    asociaciones: asociaciones ?? null,
    gal: gal ?? null,
    wikipedia: wikipedia ?? null,
  })

  const buffer = await buildSocideasBookXlsx(book)
  const out = `tmp/produccion-${codigoINE}.xlsx`
  writeFileSync(out, buffer)
  console.log('Libro generado:', buffer.length, 'bytes →', out)
}
main().catch(e => { console.error(e); process.exit(1) })
