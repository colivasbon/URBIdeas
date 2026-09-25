// Ingesta de los resultados oficiales 2023 de la circunscripción de Toledo (45):
//   (a) Autonómicas Castilla-La Mancha 28-M-2023 (votos, participación y escaños)
//   (b) Congreso 23-J-2023 (votos, escaños y participación) — reutiliza el fichero
//       existente tmp/audit/elecciones-congreso.xlsx (Infoelectoral).
//   (c) Senado 23-J-2023 (voto a candidatos, elegido S/N) — fichero fijo MIR.
//
// Escribe SOLO fixtures locales en tmp/audit/ (ignorados por git) y un manifiesto
// con URL + SHA-256 de cada fuente. No escribe R2/Supabase, no despliega.
//
// USO
//   npx tsx scripts/ingest-elections-toledo-2023.ts
//   npx tsx scripts/ingest-elections-toledo-2023.ts --offline   (usa caché tmp/ingesta)
//
// FUENTES (oficiales)
//   Senado:  https://infoelectoral.interior.gob.es/estaticos/docxl/apliextr/03202307_TOTA.zip
//   CLM:     https://datosabiertos.castillalamancha.es/sites/datosabiertos.castillalamancha.es/files/Resultados_CLM_2023.xlsx
//   DOCM:    https://docm.jccm.es/docm/descargarArchivo.do?ruta=2023%2F06%2F16%2Fpdf%2F2023_5411.pdf&tipo=rutaDocm
//   Congreso:https://descargas.interior.gob.es/datasets/resultados_electorales/Elecciones-Congreso.xlsx

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import JSZip from 'jszip'
import { readFile as xlsxReadFile, utils as xlsxUtils } from 'xlsx'
import {
  agregarClmCircunscripcion,
  parseSenadoTotaDat,
  normalizarSiglasElectoral,
  type AutonomicasCircunscripcionPayload,
  type CircunsCandidatura,
  type SenadoCircunscripcionPayload,
} from '../src/lib/socideas-electoral-provincial'

const INGESTA = path.join('tmp', 'ingesta')
const AUDIT = path.join('tmp', 'audit')
const PROV = '45'
const PROV_NOMBRE = 'Toledo'

const URL_SENADO = 'https://infoelectoral.interior.gob.es/estaticos/docxl/apliextr/03202307_TOTA.zip'
const URL_CLM = 'https://datosabiertos.castillalamancha.es/sites/datosabiertos.castillalamancha.es/files/Resultados_CLM_2023.xlsx'
const URL_DOCM = 'https://docm.jccm.es/docm/descargarArchivo.do?ruta=2023%2F06%2F16%2Fpdf%2F2023_5411.pdf&tipo=rutaDocm'
const URL_CONGRESO = 'https://descargas.interior.gob.es/datasets/resultados_electorales/Elecciones-Congreso.xlsx'

const F_SENADO_ZIP = path.join(INGESTA, '03202307_TOTA.zip')
const F_CLM = path.join(INGESTA, 'Resultados_CLM_2023.xlsx')
const F_DOCM = path.join(INGESTA, 'DOCM_2023_5411_resultados_Cortes_CLM_2023.pdf')
const F_CONGRESO = path.join(AUDIT, 'elecciones-congreso.xlsx')

const OFFLINE = process.argv.includes('--offline')

function sha256(file: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase()
}

async function descargar(url: string, destino: string): Promise<void> {
  if (fs.existsSync(destino) && OFFLINE) return
  if (fs.existsSync(destino)) {
    console.log(`[caché] ${path.basename(destino)}`)
    return
  }
  if (OFFLINE) throw new Error(`Falta ${destino} y se pidió --offline`)
  console.log(`[descarga] ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`)
  fs.mkdirSync(path.dirname(destino), { recursive: true })
  fs.writeFileSync(destino, Buffer.from(await res.arrayBuffer()))
}

function fechaISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function escribirJson(rel: string, data: unknown): void {
  const out = path.join(AUDIT, rel)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, JSON.stringify(data, null, 2) + '\n', 'utf8')
  console.log(`[fixture] ${out}`)
}

async function construirSenado(): Promise<SenadoCircunscripcionPayload> {
  const zip = await JSZip.loadAsync(fs.readFileSync(F_SENADO_ZIP))
  const leer = async (name: string): Promise<string[]> => {
    const f = zip.file(name)
    if (!f) return []
    const buf = await f.async('nodebuffer')
    return buf.toString('latin1').split(/\r?\n/).filter((l) => l.length > 0)
  }
  const dat = {
    candidaturas: await leer('03032307.DAT'),
    candidatos: await leer('04032307.DAT'),
    global: await leer('07032307.DAT'),
    candidatoVotos: await leer('08032307.DAT'),
  }
  const parsed = parseSenadoTotaDat(PROV, dat)
  return {
    anio: 2023,
    fecha: '2023-07-23',
    camara: 'Senado',
    circunscripcion: PROV_NOMBRE,
    censo: parsed.censo,
    nulos: parsed.nulos,
    blancos: parsed.blancos,
    votosACandidaturas: parsed.votosACandidaturas,
    candidatos: parsed.candidatos,
    fuenteLabel: 'Ministerio del Interior · Infoelectoral · Elecciones Generales 23-J-2023 (Senado)',
    fuenteUrl: URL_SENADO,
    fuenteLicencia: 'CC BY 4.0 (Infoelectoral, Ministerio del Interior)',
    fuenteSha256: sha256(F_SENADO_ZIP),
  }
}

/** Participación y escaños oficiales de la circunscripción (acuerdo JEC-CLM, DOCM 2023/5411). */
const DOCM_TOLEDO = {
  censo: 541628,
  votantes: 373620,
  validos: 367067,
  nulos: 6553,
  blancos: 4444,
  escanosTotal: 9,
  escanosPorSiglas: { PSOE: 5, PP: 3, VOX: 1 } as Record<string, number>,
}

function construirAutonomicas(): AutonomicasCircunscripcionPayload {
  const wb = xlsxReadFile(F_CLM)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = xlsxUtils.sheet_to_json<(string | number | null)[]>(ws, { header: 1, raw: true, defval: null })
  const candidaturas: CircunsCandidatura[] = agregarClmCircunscripcion(rows.slice(4), PROV).map((c) => ({
    ...c,
    escanos: DOCM_TOLEDO.escanosPorSiglas[normalizarSiglasElectoral(c.siglas)] ?? 0,
  }))
  return {
    anio: 2023,
    fecha: '2023-05-28',
    camara: 'Cortes de Castilla-La Mancha',
    circunscripcion: PROV_NOMBRE,
    censo: DOCM_TOLEDO.censo,
    votantes: DOCM_TOLEDO.votantes,
    validos: DOCM_TOLEDO.validos,
    nulos: DOCM_TOLEDO.nulos,
    blancos: DOCM_TOLEDO.blancos,
    escanosTotal: DOCM_TOLEDO.escanosTotal,
    candidaturas,
    fuenteLabel: 'Datos Abiertos de Castilla-La Mancha (votos) + Junta Electoral de CLM, DOCM 2023/5411 (participación y escaños)',
    fuenteUrl: URL_CLM,
    fuenteLicencia: 'CC BY-SA (Datos Abiertos CLM) · resultados oficiales JEC-CLM',
    fuenteSha256: sha256(F_CLM),
    notaCobertura: 'Manzaneque no tiene desglose autonómico municipal: los resultados son de la circunscripción de Toledo.',
  }
}

async function main(): Promise<void> {
  fs.mkdirSync(INGESTA, { recursive: true })
  fs.mkdirSync(AUDIT, { recursive: true })
  await descargar(URL_SENADO, F_SENADO_ZIP)
  await descargar(URL_CLM, F_CLM)
  await descargar(URL_DOCM, F_DOCM)

  const docs = { clm: 0, senado: 0, congreso: 0 }

  if (fs.existsSync(F_CONGRESO)) docs.congreso = 1
  else console.warn(`[aviso] falta ${F_CONGRESO}: el bloque de Congreso caerá a pendiente.`)

  // (a) Autonómicas CLM 2023 · circunscripción de Toledo
  const autonomicas = construirAutonomicas()
  escribirJson(path.join('elecciones-autonomicas-clm-2023-toledo.json'), autonomicas)
  docs.clm = autonomicas.candidaturas.length

  // (c) Senado 23-J-2023 · voto a candidatos en Toledo
  const senado = await construirSenado()
  escribirJson(path.join('elecciones-senado-2023-toledo.json'), senado)
  docs.senado = senado.candidatos.length

  // Manifiesto con URL + SHA-256
  const manifiesto = {
    generadoEl: fechaISO(),
    circunscripcion: { codigoINE: PROV, nombre: PROV_NOMBRE },
    fuentes: {
      autonomicasCLM2023: {
        url: URL_CLM,
        sha256: sha256(F_CLM),
        bytes: fs.statSync(F_CLM).size,
        nota: 'Votos por candidatura y municipio; agregado provincial para Toledo.',
      },
      docmJecClm2023: {
        url: URL_DOCM,
        sha256: sha256(F_DOCM),
        bytes: fs.statSync(F_DOCM).size,
        nota: 'Participación provincial y escaños por circunscripción (Toledo).',
      },
      senado2023: {
        url: URL_SENADO,
        sha256: sha256(F_SENADO_ZIP),
        bytes: fs.statSync(F_SENADO_ZIP).size,
        nota: 'Ficheros fijos MIR 03/04/07/08: candidato, votos y elegido.',
      },
      congreso2023: fs.existsSync(F_CONGRESO)
        ? {
            url: URL_CONGRESO,
            sha256: sha256(F_CONGRESO),
            bytes: fs.statSync(F_CONGRESO).size,
            nota: 'Reutilizado de tmp/audit/elecciones-congreso.xlsx (Infoelectoral).',
          }
        : null,
    },
    fixtures: {
      autonomicas: `elecciones-autonomicas-clm-2023-toledo.json (${docs.clm} candidaturas)`,
      senado: `elecciones-senado-2023-toledo.json (${docs.senado} candidatos)`,
      congreso: docs.congreso ? 'tmp/audit/elecciones-congreso.xlsx (reutilizado por QA)' : null,
    },
    prohibiciones: 'Sin escrituras R2/Supabase; sin commit/push/deploy.',
  }
  escribirJson('fuentes-electorales-toledo-2023.json', manifiesto)

  const sumaVotosClm = autonomicas.candidaturas.reduce((a, c) => a + (c.votos ?? 0), 0)
  const sumaEscanosClm = autonomicas.candidaturas.reduce((a, c) => a + (c.escanos ?? 0), 0)
  console.log(
    `OK · autonómicas ${docs.clm} candidaturas (votos=${sumaVotosClm}, escaños=${sumaEscanosClm}/${DOCM_TOLEDO.escanosTotal}) · senado ${docs.senado} candidatos`,
  )
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e))
  process.exit(1)
})
