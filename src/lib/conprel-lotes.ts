// Selección por lotes CONPREL — carga inicial en tandas pequeñas.
//
// La primera carga real NO debe ser de golpe (7.345 + 6.861 envelopes):
// se parte el conjunto de INEs en M lotes casi iguales (contiguos tras
// orden lexicográfico) y se procesa lote a lote (p. ej. --lote=1/20 …
// --lote=20/20), con read-back por lote y revalidación al final de cada
// lote. La partición es DETERMINISTA: mismos INEs de entrada → mismos
// lotes, así un lote posterior puede verificar los anteriores.
//
// Este módulo es puro (sin red ni FS): testeable en verify-conprel-loader.

/** Error de validación de lote (el loader sale con exit≠0). */
export class ConprelLoteError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConprelLoteError'
  }
}

export interface LoteArgs {
  /** Nº de lote actual, 1-based. null = sin partición. */
  lote: number | null
  /** Nº total de lotes. null = sin partición. */
  loteTotal: number | null
}

/**
 * Valida la pareja --lote=N --lote-total=M.
 * Reglas: ambos ausentes (sin lote) o ambos presentes; 1 ≤ N ≤ M;
 * M ≥ 2 (un lote único no es una partición útil pero se tolera M=1
 * solo si N=1 — se permite para scripts que siempre pasan la pareja).
 */
export function validarLoteArgs(args: LoteArgs): void {
  const { lote, loteTotal } = args
  if (lote === null && loteTotal === null) return
  if (lote === null || loteTotal === null) {
    throw new ConprelLoteError(
      `LOTE INCOMPLETO: se requieren --lote=N y --lote-total=M juntos (recibido lote=${String(lote)} total=${String(loteTotal)})`,
    )
  }
  if (!Number.isInteger(lote) || !Number.isInteger(loteTotal)) {
    throw new ConprelLoteError(`LOTE NO ENTERO: --lote=${lote} --lote-total=${loteTotal}`)
  }
  if (loteTotal < 1) throw new ConprelLoteError(`--lote-total debe ser ≥1 (recibido ${loteTotal})`)
  if (lote < 1 || lote > loteTotal) {
    throw new ConprelLoteError(`--lote fuera de rango: ${lote} ∉ [1, ${loteTotal}]`)
  }
}

/**
 * Particiona una lista YA ORDENADA en `total` tramos contiguos casi iguales
 * (los `rem` primeros tramos llevan un elemento extra). Determinista.
 */
export function particionLotes(sorted: readonly string[], total: number): string[][] {
  if (total < 1) throw new ConprelLoteError(`particionLotes: total ≥1 (recibido ${total})`)
  const n = sorted.length
  const base = Math.floor(n / total)
  const rem = n % total
  const out: string[][] = []
  let i = 0
  for (let k = 0; k < total; k++) {
    const size = base + (k < rem ? 1 : 0)
    out.push(sorted.slice(i, i + size))
    i += size
  }
  return out
}

/**
 * Aplica la partición de lote a una lista de INEs (se ordena primero para
 * que el resultado sea independiente del orden de entrada).
 * Devuelve el tramo del lote `args.lote` y la etiqueta de auditoría.
 */
export function aplicarLote(
  ines: readonly string[],
  args: LoteArgs,
): { ines: string[]; etiqueta: string | null; totalLotes: number | null } {
  validarLoteArgs(args)
  if (args.lote === null || args.loteTotal === null) {
    return { ines: [...ines], etiqueta: null, totalLotes: null }
  }
  const sorted = [...new Set(ines)].sort()
  const tramos = particionLotes(sorted, args.loteTotal)
  const tramo = tramos[args.lote - 1] ?? []
  return {
    ines: tramo,
    etiqueta: `lote_${args.lote}_de_${args.loteTotal}`,
    totalLotes: args.loteTotal,
  }
}
