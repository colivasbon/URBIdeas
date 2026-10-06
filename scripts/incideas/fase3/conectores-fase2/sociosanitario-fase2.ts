// Fase 2 (agente-fase2) — Sociosanitario: centros sociales y asistenciales.
//
// Fuente verificada con descarga real 2026-10-06:
// - GVA Centros inclusivos (RECESSO): CSV vía WFS terramapas
//   (https://terramapas.icv.gva.es/19_RECESSO_wfs?...typename=CentrosInclusivos&outputformat=csv;
//   muestra 680 238 B con columnas WKT,id,ni_centro,tipo_centro,nombre,
//   entidad,domici,cod_ine_mun,provincia,municipio,...,x_25830,y_25830).
//   Coordenadas UTM 30N (WKT + x/y) → lon/lat. Filtro por municipio.
// - Navarra: solo zonificación SSB/áreas (IDENA SOCIAL_Pol_*), sin registro
//   de centros verificado → nota. Tenerife: sin resultados → nota.
// Sin escritura.

import {
  descargarTexto,
  esError,
  parseCsv,
  indiceCab,
  numEs,
  sleep,
  coincideMunicipio,
  normalizar,
  utm30NaLonLat,
  type ResultadoBloque,
} from "./comun-fase2";

const GVA_URL =
  "https://terramapas.icv.gva.es/19_RECESSO_wfs?request=GetFeature&service=WFS&version=2.0.0&typename=CentrosInclusivos&outputformat=csv";

function esCV(provincia: string): boolean {
  const p = normalizar(provincia);
  return p.includes("alicante") || p.includes("alacant") || p.includes("valencia") || p.includes("castell");
}

/** Centros sociales/asistenciales del municipio (lon/lat desde UTM 30N). */
export async function cargarSociosanitario(municipio: string, provincia: string): Promise<ResultadoBloque> {
  if (!esCV(provincia)) {
    return {
      objetos: [],
      edicion: "",
      nota: `Sin registro de centros sociosanitarios verificado para «${provincia}» (verificado: CV Centros inclusivos; Navarra solo zonificación SSB; Tenerife sin resultados).`,
    };
  }
  const d = await descargarTexto(GVA_URL, 8 * 1024 * 1024, 180000);
  await sleep(800);
  if (esError(d)) return { objetos: [], edicion: "", nota: `GVA centros inclusivos: ${d.error}.` };
  const { cab, filas } = parseCsv(d.texto);
  const iTipo = indiceCab(cab, [/^tipo_centro$/]);
  const iNom = indiceCab(cab, [/^nombre$/]);
  const iEnt = indiceCab(cab, [/^entidad$/]);
  const iDir = indiceCab(cab, [/^domici$/]);
  const iMun = indiceCab(cab, [/^municipio$/]);
  const iIne = indiceCab(cab, [/^cod_ine_mun$/]);
  const iX = indiceCab(cab, [/^x_25830$/]);
  const iY = indiceCab(cab, [/^y_25830$/]);
  if (iMun < 0) return { objetos: [], edicion: "", nota: "GVA centros inclusivos: sin columna de municipio." };
  const objetos: Record<string, unknown>[] = [];
  for (const f of filas) {
    if (!coincideMunicipio(f[iMun] ?? "", municipio)) continue;
    const este = iX >= 0 ? numEs(f[iX]) : null;
    const norte = iY >= 0 ? numEs(f[iY]) : null;
    const g = este !== null && norte !== null ? utm30NaLonLat(este, norte) : null;
    objetos.push({
      tipo_centro: iTipo >= 0 ? f[iTipo] || null : null,
      nombre: iNom >= 0 ? f[iNom] || null : null,
      entidad: iEnt >= 0 ? f[iEnt] || null : null,
      direccion: iDir >= 0 ? f[iDir] || null : null,
      municipio: f[iMun] || null,
      cod_ine_mun: iIne >= 0 ? f[iIne] || null : null,
      lon: g ? Math.round(g.lon * 1000000) / 1000000 : null,
      lat: g ? Math.round(g.lat * 1000000) / 1000000 : null,
      fuente: "gva-centros-inclusivos",
    });
    if (objetos.length >= 300) break;
  }
  return {
    objetos,
    edicion: "verificada 2026-10-06",
    nota: `${filas.length} centros inclusivos en CV; ${objetos.length} del municipio.`,
  };
}
