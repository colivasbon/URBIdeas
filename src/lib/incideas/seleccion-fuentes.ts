// Selección de fuente por subcategoría para la memoria (lógica pura, sin E/S).
import type { RegistroINCideas } from "./types";

/** 1 oficial · 2 municipal u operador · 3 colaborativa. Sin catálogo: 2. */
export function rangoTipoFuente(tipo: string | undefined): number {
  if (!tipo) return 2;
  if (tipo.startsWith("oficial_")) return 1;
  if (tipo === "colaborativa") return 3;
  return 2;
}

export interface SeleccionFuentes {
  /** Registros de la fuente de mayor rango disponible en cada subcategoría. */
  usados: RegistroINCideas[];
  /** Registros de otras fuentes en esas subcategorías: quedan para contraste. */
  alternativos: RegistroINCideas[];
}

/**
 * Para cada clave «categoria/subcategoria» se usa solo el grupo de fuentes de mayor rango
 * presente; el resto no se mezcla en la memoria (evita listar tres veces el mismo centro
 * desde la fuente oficial, la plantilla municipal y OSM) y se ofrece como contraste.
 */
export function seleccionarPorFuente(
  m: {
    porSubcategoria: Record<string, RegistroINCideas[]>;
    tiposFuente: Map<string, string>;
  },
  claves: string[]
): SeleccionFuentes {
  const usados: RegistroINCideas[] = [];
  const alternativos: RegistroINCideas[] = [];
  for (const clave of claves) {
    const regs = m.porSubcategoria[clave] ?? [];
    if (regs.length === 0) continue;
    const rango = (r: RegistroINCideas) => rangoTipoFuente(m.tiposFuente.get(r.fuente_principal));
    const mejor = Math.min(...regs.map(rango));
    for (const r of regs) (rango(r) === mejor ? usados : alternativos).push(r);
  }
  return { usados, alternativos };
}

function recuento(regs: RegistroINCideas[]): string {
  const n = new Map<string, number>();
  for (const r of regs) n.set(r.fuente_principal, (n.get(r.fuente_principal) ?? 0) + 1);
  return [...n.entries()].map(([f, c]) => `${f} (${c})`).join("; ");
}

/** Pie de fuente calculado a partir de los datos mostrados, con atribución ODbL si procede. */
export function pieFuentes(sel: SeleccionFuentes, nota?: string): string {
  if (sel.usados.length === 0) return nota ?? "";
  const partes = [`Fuente: ${recuento(sel.usados)}.`];
  if (sel.usados.some((r) => /openstreetmap/i.test(r.fuente_principal))) {
    partes.push("© OpenStreetMap contributors (ODbL), pendiente de revisión.");
  }
  if (sel.alternativos.length > 0) {
    partes.push(`Para contraste en la bandeja de revisión: ${recuento(sel.alternativos)}.`);
  }
  if (nota) partes.push(nota);
  return partes.join(" ");
}
