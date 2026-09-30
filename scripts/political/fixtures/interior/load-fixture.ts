// Empaqueta los extractos LITERALES de un paquete APLIEXTR (esta carpeta) en
// un ZIP temporal con la misma estructura que el oficial, para ejercitar el
// adaptador sin red. Los .DAT no se modifican; `mutate` permite a un test
// alterar líneas EN MEMORIA (p. ej. truncar una línea para probar el error).

import { createHash } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import type { DownloadedFile } from '../../adapter'
import type { ElectionType } from '../../../../src/lib/socideas-secciones-political'
import { INTERIOR_AUTHORITY, INTERIOR_LICENCE, INTERIOR_SOURCE_ID } from '../../adapters/interior/index'

export const FIXTURE_DIR = join(__dirname)

export function fixtureLines(code: string, file: string): string[] {
  return readFileSync(join(FIXTURE_DIR, code, file)).toString('latin1').split('\n').filter((l) => l.length > 0)
}

export async function fixturePackage(
  code: '04202305' | '02202307' | '02201911',
  type: ElectionType,
  date: string,
  mutate?: (file: string, lines: string[]) => string[],
): Promise<DownloadedFile> {
  const zip = new JSZip()
  for (const f of readdirSync(join(FIXTURE_DIR, code)).filter((x) => x.endsWith('.DAT'))) {
    let lines = fixtureLines(code, f)
    if (mutate) lines = mutate(f, lines)
    zip.file(f, Buffer.from(lines.join('\n') + '\n', 'latin1'))
  }
  const buf = await zip.generateAsync({ type: 'nodebuffer' })
  const dir = mkdtempSync(join(tmpdir(), 'political-fixture-'))
  const path = join(dir, `${code}_MESA.zip`)
  writeFileSync(path, buf)
  const sha256 = createHash('sha256').update(buf).digest('hex')
  return {
    descriptor: {
      sourceId: INTERIOR_SOURCE_ID,
      electionType: type,
      electionDate: date,
      territoryCode: null,
      url: `https://infoelectoral.interior.gob.es/estaticos/docxl/apliextr/${code}_MESA.zip`,
      fileName: `${code}_MESA.zip`,
      expectedSha256: null,
      format: 'zip',
      licence: INTERIOR_LICENCE,
      authority: INTERIOR_AUTHORITY,
      definitive: true,
    },
    path,
    sha256,
    bytes: buf.length,
    httpStatus: 200,
    contentType: 'application/zip',
    state: 'unchanged',
    retrievedAt: '2026-09-29T00:00:00.000Z',
  }
}
