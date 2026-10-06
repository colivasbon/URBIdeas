// Nombres de municipio: variantes (barras, artículos) y coincidencia.
export function normalizar(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Variantes comparables: «Alicante/Alacant» → [«alicante alacant», «alicante», «alacant»]. */
export function variantes(nombre: string): string[] {
  const out = new Set<string>();
  const completo = normalizar(nombre);
  if (completo) out.add(completo);
  for (const parte of String(nombre ?? "").split("/")) {
    const n = normalizar(parte);
    if (n) out.add(n);
  }
  return [...out];
}

/** Coincidencia por variantes en ambas direcciones (igualdad o prefijo). */
export function coincideMunicipio(a: string, b: string): boolean {
  const va = variantes(a);
  const vb = variantes(b);
  for (const x of va) {
    for (const y of vb) {
      if (!x || !y) continue;
      if (x === y || x.startsWith(y) || y.startsWith(x)) return true;
    }
  }
  return false;
}
