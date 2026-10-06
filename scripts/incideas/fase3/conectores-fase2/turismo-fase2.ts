// Fase 2 (agente-fase2) — Turismo: alojamientos y equipamientos hosteleros.
//
// Fuentes verificadas con descarga real 2026-10-06:
// - Tenerife: alojamientos-turisticos-de-tenerife.csv (columnas
//   municipio,modalidad,tipo,nombre,direccion,codigo_postal,categoria,...;
//   SIN coordenadas en origen).
// - GVA: lista-de-casas-rurales.csv (245 923 B; separador `;`, columnas
//   categoria;...;municipio;nombre;...;provincia;...; SIN coordenadas).
// - Navarra: DOTACI_Sym_AlojTur.zip (IDENA, 204 822 B, PK; puntos de
//   alojamientos turísticos; coordenadas UTM 30N en el SHP).
// Filtro por municipio. Sin escritura (SHP en memoria vía jszip+shpjs).

import {
  descargarTexto,
  esError,
  parseCsv,
  indiceCab,
  sleep,
  coincideMunicipio,
  normalizar,
  cargarShpZip,
  bboxDeCoords,
  seSolapan,
  centroideAprox,
  utm30NaLonLat,
  propsMencionanMunicipio,
  propPublica,
  type Bbox,
  type ResultadoBloque,
} from "./comun-fase2";

const TENERIFE_URL =
  "https://datos.tenerife.es/ckan/dataset/253d5bb2-c6ec-4b9c-a02c-397ba128ad59/resource/4c045ca7-e1be-48cf-b3e9-dbd9dce58212/download/alojamientos-turisticos-de-tenerife.csv";
const GVA_URL =
  "https://dadesobertes.gva.es/dataset/981cda16-b6a5-428e-920a-729cb153f9b8/resource/6b31800d-f2e8-4e99-ad4d-913aa71ad1dc/download/lista-de-casas-rurales.csv";
const NAVARRA_ZIP = "https://idena.navarra.es/descargas/DOTACI_Sym_AlojTur.zip";

function esCV(provincia: string): boolean {
  const p = normalizar(provincia);
  return p.includes("alicante") || p.includes("alacant") || p.includes("valencia") || p.includes("castell");
}

function esNavarra(provincia: string): boolean {
  return normalizar(provincia).includes("navarra");
}

function esTenerife(provincia: string): boolean {
  const p = normalizar(provincia);
  return p.includes("tenerife") || p.includes("santa cruz");
}

/** Alojamientos turísticos del municipio (lon/lat solo Navarra-IDENA). */
export async function cargarTurismo(
  municipio: string,
  provincia: string,
  bbox: Bbox | null = null
): Promise<ResultadoBloque> {
  if (esTenerife(provincia)) {
    const d = await descargarTexto(TENERIFE_URL, 6 * 1024 * 1024, 120000);
    await sleep(800);
    if (esError(d)) return { objetos: [], edicion: "", nota: `Tenerife turismo: ${d.error}.` };
    const { cab, filas } = parseCsv(d.texto);
    const iNom = indiceCab(cab, [/^nombre$/]);
    const iMun = indiceCab(cab, [/^municipio$/]);
    const iMod = indiceCab(cab, [/^modalidad$/]);
    const iTipo = indiceCab(cab, [/^tipo$/]);
    const iDir = indiceCab(cab, [/^direccion$/]);
    const iCat = indiceCab(cab, [/^categoria$/]);
    if (iMun < 0) return { objetos: [], edicion: "", nota: "Tenerife turismo: sin columna de municipio." };
    const objetos: Record<string, unknown>[] = [];
    for (const f of filas) {
      if (!coincideMunicipio(f[iMun] ?? "", municipio)) continue;
      objetos.push({
        nombre: iNom >= 0 ? f[iNom] || null : null,
        modalidad: iMod >= 0 ? f[iMod] || null : null,
        tipo: iTipo >= 0 ? f[iTipo] || null : null,
        direccion: iDir >= 0 ? f[iDir] || null : null,
        categoria: iCat >= 0 ? f[iCat] || null : null,
        municipio: f[iMun] || null,
        lon: null,
        lat: null,
        fuente: "tenerife-alojamientos-turisticos",
      });
      if (objetos.length >= 400) break;
    }
    return {
      objetos,
      edicion: "2026-09-30",
      nota: `${filas.length} alojamientos en Tenerife; ${objetos.length} del municipio (fuente sin coordenadas).`,
    };
  }
  if (esCV(provincia)) {
    const d = await descargarTexto(GVA_URL, 4 * 1024 * 1024, 120000);
    await sleep(800);
    if (esError(d)) return { objetos: [], edicion: "", nota: `GVA turismo: ${d.error}.` };
    const { cab, filas } = parseCsv(d.texto, ";");
    const iNom = indiceCab(cab, [/^nombre$/]);
    const iMun = indiceCab(cab, [/^municipio$/]);
    const iMod = indiceCab(cab, [/^modalidad$/]);
    const iPlazas = indiceCab(cab, [/^plazas_totales$/, /plazas/]);
    const iEstado = indiceCab(cab, [/^estado$/]);
    if (iMun < 0) return { objetos: [], edicion: "", nota: "GVA turismo: sin columna de municipio." };
    const objetos: Record<string, unknown>[] = [];
    for (const f of filas) {
      if (!coincideMunicipio(f[iMun] ?? "", municipio)) continue;
      objetos.push({
        nombre: iNom >= 0 ? f[iNom] || null : null,
        modalidad: iMod >= 0 ? f[iMod] || null : null,
        plazas: iPlazas >= 0 ? f[iPlazas] || null : null,
        estado: iEstado >= 0 ? f[iEstado] || null : null,
        municipio: f[iMun] || null,
        lon: null,
        lat: null,
        fuente: "gva-casas-rurales",
      });
      if (objetos.length >= 400) break;
    }
    return {
      objetos,
      edicion: "2024-12-29",
      nota: `${filas.length} casas rurales en CV; ${objetos.length} del municipio (fuente sin coordenadas).`,
    };
  }
  if (esNavarra(provincia)) {
    const r = await cargarShpZip(NAVARRA_ZIP, 10 * 1024 * 1024);
    await sleep(800);
    if (esError(r)) return { objetos: [], edicion: "", nota: `Navarra turismo: ${r.error}.` };
    const objetos: Record<string, unknown>[] = [];
    for (const f of r.features) {
      if (!f.geometry) continue;
      const menciona = propsMencionanMunicipio(f.properties, municipio);
      let cerca = false;
      if (!menciona && bbox) {
        const nativa = bboxDeCoords(f.geometry.coordinates);
        if (nativa) {
          const c1 = utm30NaLonLat(nativa.minLon, nativa.minLat);
          const c2 = utm30NaLonLat(nativa.maxLon, nativa.maxLat);
          cerca = seSolapan(
            { minLon: Math.min(c1.lon, c2.lon), minLat: Math.min(c1.lat, c2.lat), maxLon: Math.max(c1.lon, c2.lon), maxLat: Math.max(c1.lat, c2.lat) },
            bbox
          );
        }
      }
      if (!menciona && !cerca) continue;
      const c = centroideAprox(f.geometry.coordinates);
      const g = c ? utm30NaLonLat(c.x, c.y) : null;
      const campos: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(f.properties)) campos[k] = propPublica(v);
      objetos.push({
        ...campos,
        lon: g ? Math.round(g.lon * 1000000) / 1000000 : null,
        lat: g ? Math.round(g.lat * 1000000) / 1000000 : null,
        fuente: "idena-alojamientos-turisticos",
      });
      if (objetos.length >= 300) break;
    }
    return {
      objetos,
      edicion: "verificada 2026-10-06",
      nota: `IDENA AlojTur: ${r.features.length} puntos en Navarra; ${objetos.length} del municipio (mención o solape bbox).`,
    };
  }
  return {
    objetos: [],
    edicion: "",
    nota: `Sin fuente de turismo verificada para «${provincia}» (verificadas: Tenerife, CV, Navarra).`,
  };
}
