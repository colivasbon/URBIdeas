// Fase 3 — Conector PRTR (depuradoras ≥100.000 e-h, actividad 5.f).
//
// Vía parcial honesta: el PRTR no ofrece bulk municipal; se consulta el
// buscador por municipio y se conserva la ficha (con coordenadas cuando la
// trae). Lo que no aparece queda como sin_cobertura, nunca como ausencia.

export interface EdarPrtr {
  nombre: string | null;
  municipio: string | null;
  provincia: string | null;
  lat: number | null;
  lon: number | null;
  estado: string | null;
  url_ficha: string;
}

import { coincideMunicipio } from "../../../../src/lib/incideas/fase3/nombres";

const UA = "INCideas-Fase3/0.1";


/** Busca complejos 5.f (tratamiento aguas residuales urbanas) por municipio. */
export async function cargarDepuradoras(
  municipio: string
): Promise<{ objetos: EdarPrtr[]; edicion: string; nota: string }> {
  // (mun eliminado: coincideMunicipio cubre las variantes con barra).
  // Búsqueda PRTR por nombre de complejo/municipio (GET con parámetros de la
  // aplicación de consulta; si cambia, el estado lo refleja, no se rodea).
  const q = new URLSearchParams({ texto: municipio, buscar: "1" });
  const url = `https://prtr-es.miteco.gob.es/Informes/BuscarComplejos.aspx?${q.toString()}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    let html = "";
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA }, signal: controller.signal });
      html = await r.text();
    } finally {
      clearTimeout(timer);
    }
    const fichas = [...html.matchAll(/fichacomplejo\.aspx\?Id_Complejo=(\d+)/gi)].map((m) => m[1]);
    const unicas = [...new Set(fichas)].slice(0, 10);
    const objetos: EdarPrtr[] = [];
    for (const id of unicas) {
      const furl = `https://prtr-es.miteco.gob.es/Informes/fichacomplejo.aspx?Id_Complejo=${id}`;
      try {
        const rf = await fetch(furl, { headers: { "User-Agent": UA } });
        const t = await rf.text();
        const plano = t.replace(/\s+/g, " ");
        const campo = (re: RegExp): string | null => {
          const m = plano.match(re);
          return m ? m[1].trim().slice(0, 200) : null;
        };
        const nombre = campo(/Nombre[^<]{0,50}?<\/[^>]+>\s*([^<]{2,120})/i) ?? campo(/<title>([^<]{2,160})<\/title>/i);
        const fMun = campo(/Municipio[^<]{0,80}?>([^<]{2,80})/i);
        if (fMun && !coincideMunicipio(fMun, municipio)) continue;
        const latM = plano.match(/Latitud[^0-9-]*(-?\d+[,.]\d+)/i);
        const lonM = plano.match(/Longitud[^0-9-]*(-?\d+[,.]\d+)/i);
        objetos.push({
          nombre,
          municipio: fMun,
          provincia: campo(/Provincia[^<]{0,80}?>([^<]{2,80})/i),
          lat: latM ? Number(latM[1].replace(",", ".")) : null,
          lon: lonM ? Number(lonM[1].replace(",", ".")) : null,
          estado: campo(/Estado[^<]{0,80}?>([^<]{2,60})/i),
          url_ficha: furl,
        });
      } catch {
        continue;
      }
      if (objetos.length >= 5) break;
    }
    return {
      objetos,
      edicion: "2024",
      nota: `PRTR parcial (>=100k e-h): ${objetos.length} fichas compatibles con «${municipio}». Sin bulk municipal; el resto por agregación CCAA (pendiente).`,
    };
  } catch (e: unknown) {
    return { objetos: [], edicion: "", nota: `PRTR inaccesible: ${String(e instanceof Error ? e.message : e).slice(0, 150)} (fuente_caida, se conserva lo último válido).` };
  }
}
