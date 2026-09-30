// Normalización de listas de códigos recibidas por la CLI.
// PowerShell convierte "02003" en 2003 si no va entre comillas: se rellenan
// ceros a la izquierda hasta la longitud del código (5 municipio, 2 provincia).
// Un código con más dígitos de los esperados o con letras es un error.

export function normalizeCode(raw: string, width: number): string {
  const x = raw.trim()
  if (!/^\d+$/.test(x) || x.length > width) throw new Error(`código inválido "${raw}" (se esperan ${width} dígitos)`)
  return x.padStart(width, '0')
}

export function normalizeCodeList(raw: string, width: number): Set<string> {
  return new Set(
    raw
      .split(/[,\s;]+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => normalizeCode(x, width)),
  )
}
