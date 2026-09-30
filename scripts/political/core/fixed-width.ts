// Lectura de registros de ancho fijo (ficheros .DAT de Interior y similares).
//
// Posiciones 1-based e inclusivas, tal como las publica la especificación
// oficial (FICHEROS.doc del paquete APLIEXTR). Nada se "adivina":
//   - una línea de longitud distinta a la del registro es un ERROR (truncada o
//     corrupta) y aborta la lectura: no se publica nada de un fichero roto;
//   - un campo numérico que no sea exclusivamente dígitos es un ERROR;
//   - los códigos se devuelven como TEXTO (conservan ceros a la izquierda).
//
// La especificación dice CR+LF como separador de registro; los paquetes reales
// usan LF en la mayoría de ficheros (verificado 2026-09-29: 09/10/03/05/06/11
// de 04202305 con LF; 12 con CR+LF). Se aceptan ambos.

export interface FieldSpec {
  name: string
  start: number
  end: number
  type: 'num' | 'alf'
}

export interface RecordSpec {
  /** Prefijo nn del fichero (03, 05, 09…). */
  file: string
  description: string
  length: number
  fields: FieldSpec[]
}

export class FixedWidthError extends Error {
  readonly file: string
  readonly lineNumber: number
  readonly line: string
  constructor(message: string, file: string, lineNumber: number, line: string) {
    super(`${file}:${lineNumber}: ${message}`)
    this.name = 'FixedWidthError'
    this.file = file
    this.lineNumber = lineNumber
    this.line = line
  }
}

/** Decodifica bytes ANSI (Windows-1252, un byte = un carácter). */
export function decodeAnsi(bytes: Uint8Array): string {
  return new TextDecoder('windows-1252').decode(bytes)
}

/** Separa en líneas (CR+LF o LF). Descarta sólo la última línea vacía. */
export function splitRecords(text: string): string[] {
  const lines = text.split(/\r?\n/)
  if (lines.length && lines[lines.length - 1] === '') lines.pop()
  return lines
}

/** Valida la coherencia interna de una especificación (sin huecos ni solapes). */
export function assertSpec(spec: RecordSpec): void {
  let expected = 1
  for (const f of spec.fields) {
    if (f.start !== expected) throw new Error(`Especificación ${spec.file}: ${f.name} empieza en ${f.start}, esperado ${expected}`)
    if (f.end < f.start) throw new Error(`Especificación ${spec.file}: ${f.name} fin < inicio`)
    expected = f.end + 1
  }
  if (expected - 1 !== spec.length) {
    throw new Error(`Especificación ${spec.file}: longitud ${spec.length}, campos cubren ${expected - 1}`)
  }
}

export type RawRecord = Record<string, string>

/** Corta una línea según la especificación. Lanza FixedWidthError si no cuadra. */
export function parseLine(line: string, spec: RecordSpec, lineNumber: number, fileName = spec.file): RawRecord {
  if (line.length !== spec.length) {
    throw new FixedWidthError(
      `longitud ${line.length} ≠ ${spec.length} (registro truncado o corrupto)`,
      fileName,
      lineNumber,
      line,
    )
  }
  const out: RawRecord = {}
  for (const f of spec.fields) {
    const v = line.slice(f.start - 1, f.end)
    if (f.type === 'num' && !/^\d+$/.test(v)) {
      throw new FixedWidthError(`campo numérico ${f.name} (${f.start}-${f.end}) no numérico: "${v}"`, fileName, lineNumber, line)
    }
    out[f.name] = v
  }
  return out
}

/** Lee todas las líneas de un fichero. */
export function parseRecords(text: string, spec: RecordSpec, fileName = spec.file): RawRecord[] {
  const lines = splitRecords(text)
  const out: RawRecord[] = new Array(lines.length)
  for (let i = 0; i < lines.length; i++) out[i] = parseLine(lines[i] as string, spec, i + 1, fileName)
  return out
}

/** Entero de un campo numérico ya validado. */
export function int(v: string): number {
  return Number.parseInt(v, 10)
}
