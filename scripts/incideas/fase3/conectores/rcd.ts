// Fase 3 — Conector RCD (centros docentes no universitarios).
//
// El RCD no ofrece bulk nacional: se consulta por CCAA/provincia y se filtra
// por municipio. Si la vía nacional no responde, se registra el estado y se
// deja la vía autonómica (p. ej. Navarra CSV) como alternativa con evidencia.

export interface CentroDocente {
  codigo: string | null;
  denominacion: string | null;
  municipio: string | null;
  provincia: string | null;
  domicilio: string | null;
  naturaleza: string | null;
  edicion: string;
}

import { coincideMunicipio } from "../../../../src/lib/incideas/fase3/nombres";

const UA = "INCideas-Fase3/0.1";

/** Intento acotado al buscador nacional; devuelve centros o el motivo. */
export async function cargarEducacion(
  municipio: string,
  provincia: string
): Promise<{ objetos: CentroDocente[]; edicion: string; fuente: string; nota: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    let html = "";
    try {
      // Buscador nacional por texto libre (vía documentada en la web del RCD).
      const q = new URLSearchParams({ textoLibre: municipio });
      const r = await fetch(`https://www.educacion.gob.es/centros/buscar?${q.toString()}`, {
        headers: { "User-Agent": UA },
        signal: controller.signal,
      });
      html = await r.text();
    } finally {
      clearTimeout(timer);
    }
    const plano = html.replace(/\s+/g, " ");
    // Fichas de centro enlazadas en el resultado.
    const enlaces = [...plano.matchAll(/centros\/ficha[^"'\s<>]{0,200}/gi)].map((m) => m[0]).slice(0, 40);
    const unicos = [...new Set(enlaces)];
    const objetos: CentroDocente[] = [];
    for (const e of unicos.slice(0, 15)) {
      try {
        const rf = await fetch(`https://www.educacion.gob.es/${e}`, { headers: { "User-Agent": UA } });
        const t = (await rf.text()).replace(/\s+/g, " ");
        const campo = (re: RegExp): string | null => {
          const m = t.match(re);
          return m ? m[1].trim().slice(0, 200) : null;
        };
        const fMun = campo(/Localidad|Municipio[^<]{0,60}?>([^<]{2,80})/i);
        if (fMun && !coincideMunicipio(fMun, municipio)) continue;
        objetos.push({
          codigo: campo(/digo[^<]{0,30}?>([^<]{2,30})/i),
          denominacion: campo(/<title>([^<]{2,160})<\/title>/i),
          municipio: fMun,
          provincia,
          domicilio: campo(/Domicilio[^<]{0,80}?>([^<]{2,160})/i),
          naturaleza: campo(/Naturaleza|Titularidad[^<]{0,80}?>([^<]{2,80})/i),
          edicion: "",
        });
      } catch {
        continue;
      }
      if (objetos.length >= 10) break;
    }
    if (unidadesVacias(html)) {
      return { objetos: [], edicion: "", fuente: "rcd", nota: "RCD sin resultados interpretables para el municipio (cero_resultados o vía no interpretada; no es ausencia)." };
    }
    return { objetos, edicion: new Date().toISOString().slice(0, 10), fuente: "rcd", nota: `RCD nacional: ${objetos.length} fichas compatibles. Sin bulk ni coordenadas; vía autonómica como alternativa.` };
  } catch (e: unknown) {
    return { objetos: [], edicion: "", fuente: "rcd", nota: `RCD inaccesible: ${String(e instanceof Error ? e.message : e).slice(0, 150)}.` };
  }
}

function unidadesVacias(html: string): boolean {
  return /no se han encontrado|sin resultados|0 resultados/i.test(html);
}
