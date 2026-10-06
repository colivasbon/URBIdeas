// Fase 2 (agente-fase2) — Cultura y patrimonio: BIC, relevancia local, recursos.
//
// Fuentes verificadas con descarga real 2026-10-06:
// - GVA: bienes_inmuebles_interes_cultural.csv (171 492 B; Benidorm: Torre
//   Morales, Punta del Cavall, Tossal de la Cala) y
//   bienes_inmuebles_relevancia_local.csv (849 355 B; Benidorm: San Jaime,
//   Masía Media Legua, Almudena). Separador `;`, columnas
//   igpcv;denominacion;provincia;municipio;utmeste;utmnorte;... con el ORDEN
//   este/norte CRUZADO entre ficheros (BIC trae norte,este): se ordena por
//   magnitud (valor >2M = norte). UTM 30N → lon/lat.
// - Tenerife: recursos_socioculturales.csv (columnas nmun,municipio,...,lng,lat).
// - Navarra: opendata_resultados_pm_es.csv (20 079 B; NombreLocalidad +
//   GEORR_X/GEORR_Y en UTM 30N).
// Filtro por municipio. Sin escritura.

import {
  descargarTexto,
  esError,
  parseCsv,
  indiceCab,
  numEs,
  sleep,
  coincideMunicipio,
  normalizar,
  ordenarEsteNorte,
  utm30NaLonLat,
  type ResultadoBloque,
} from "./comun-fase2";

const GVA_BIC =
  "https://dadesobertes.gva.es/dataset/da443c69-9c66-4e25-bdd7-8fdb8fe7cda9/resource/2271efdd-d0cc-4126-a9a0-dd11d56acbde/download/bienes_inmuebles_interes_cultural.csv";
const GVA_BRL =
  "https://dadesobertes.gva.es/dataset/da443c69-9c66-4e25-bdd7-8fdb8fe7cda9/resource/0619adb1-e458-4b2a-ae6a-6bad5f00b6c9/download/bienes_inmuebles_relevancia_local.csv";
const TENERIFE_URL =
  "https://datos.tenerife.es/ckan/dataset/1e520430-85ec-4cca-b3d7-385781627022/resource/78bbcb64-857e-40db-913f-4fe2fe2604ab/download/recursos_socioculturales.csv";
const NAVARRA_URL =
  "https://datosabiertos.navarra.es/dataset/a782ae27-84a3-4209-a35a-4a0899db2fe4/resource/894305b9-2ea8-4620-9cf5-065ebbf35c66/download/opendata_resultados_pm_es.csv";

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

function filaGva(cab: string[], f: string[], municipio: string, clase: string): Record<string, unknown> | null {
  const iDen = indiceCab(cab, [/denominacion/, /^nombre/]);
  const iMun = indiceCab(cab, [/^municipio$/]);
  const iA = indiceCab(cab, [/^utmeste$/]);
  const iB = indiceCab(cab, [/^utmnorte$/]);
  const iCat = indiceCab(cab, [/^categoria$/]);
  if (iMun < 0 || !coincideMunicipio(f[iMun] ?? "", municipio)) return null;
  const orden = ordenarEsteNorte(iA >= 0 ? numEs(f[iA]) : null, iB >= 0 ? numEs(f[iB]) : null);
  const g = orden ? utm30NaLonLat(orden.este, orden.norte) : null;
  return {
    denominacion: iDen >= 0 ? f[iDen] || null : null,
    municipio: f[iMun] || null,
    categoria: iCat >= 0 ? f[iCat] || null : clase,
    lon: g ? Math.round(g.lon * 1000000) / 1000000 : null,
    lat: g ? Math.round(g.lat * 1000000) / 1000000 : null,
    fuente: `gva-${clase}`,
  };
}

/** Bienes culturales del municipio (lon/lat desde UTM 30N). */
export async function cargarCultura(municipio: string, provincia: string): Promise<ResultadoBloque> {
  const objetos: Record<string, unknown>[] = [];
  const notas: string[] = [];
  if (esCV(provincia)) {
    for (const [url, clase] of [[GVA_BIC, "bic"], [GVA_BRL, "relevancia-local"]] as const) {
      const d = await descargarTexto(url, 4 * 1024 * 1024, 120000);
      await sleep(800);
      if (esError(d)) {
        notas.push(`GVA ${clase}: ${d.error}.`);
        continue;
      }
      const { cab, filas } = parseCsv(d.texto, ";");
      let n = 0;
      for (const f of filas) {
        const o = filaGva(cab, f, municipio, clase);
        if (!o) continue;
        objetos.push(o);
        n++;
        if (objetos.length >= 300) break;
      }
      notas.push(`GVA ${clase}: ${n}/${filas.length} bienes (${d.bytes} B).`);
    }
    return { objetos, edicion: "2026-10-03", nota: notas.join(" ") };
  }
  if (esTenerife(provincia)) {
    const d = await descargarTexto(TENERIFE_URL, 4 * 1024 * 1024, 120000);
    await sleep(800);
    if (esError(d)) return { objetos: [], edicion: "", nota: `Tenerife cultura: ${d.error}.` };
    const { cab, filas } = parseCsv(d.texto);
    const iNom = indiceCab(cab, [/^nombre$/]);
    const iMun = indiceCab(cab, [/^municipio$/]);
    const iAct = indiceCab(cab, [/^actividad$/]);
    const iLon = indiceCab(cab, [/^lng$/, /^longitud/]);
    const iLat = indiceCab(cab, [/^lat$/, /^latitud/]);
    if (iMun < 0) return { objetos: [], edicion: "", nota: "Tenerife cultura: sin columna de municipio." };
    for (const f of filas) {
      if (!coincideMunicipio(f[iMun] ?? "", municipio)) continue;
      objetos.push({
        nombre: iNom >= 0 ? f[iNom] || null : null,
        actividad: iAct >= 0 ? f[iAct] || null : null,
        municipio: f[iMun] || null,
        lon: iLon >= 0 ? numEs(f[iLon]) : null,
        lat: iLat >= 0 ? numEs(f[iLat]) : null,
        fuente: "tenerife-recursos-socioculturales",
      });
      if (objetos.length >= 300) break;
    }
    return { objetos, edicion: "verificada 2026-10-06", nota: `${filas.length} recursos en Tenerife; ${objetos.length} del municipio.` };
  }
  if (esNavarra(provincia)) {
    const d = await descargarTexto(NAVARRA_URL, 2 * 1024 * 1024, 120000);
    await sleep(800);
    if (esError(d)) return { objetos: [], edicion: "", nota: `Navarra cultura: ${d.error}.` };
    const { cab, filas } = parseCsv(d.texto);
    const iNom = indiceCab(cab, [/^nombre$/]);
    const iLoc = indiceCab(cab, [/nombrelocalidad/, /localidad/]);
    const iTipo = indiceCab(cab, [/^tipo$/]);
    const iX = indiceCab(cab, [/^georr_x$/]);
    const iY = indiceCab(cab, [/^georr_y$/]);
    if (iLoc < 0) return { objetos: [], edicion: "", nota: "Navarra cultura: sin columna de localidad." };
    for (const f of filas) {
      if (!coincideMunicipio(f[iLoc] ?? "", municipio)) continue;
      const orden = ordenarEsteNorte(iX >= 0 ? numEs(f[iX]) : null, iY >= 0 ? numEs(f[iY]) : null);
      const g = orden ? utm30NaLonLat(orden.este, orden.norte) : null;
      objetos.push({
        nombre: iNom >= 0 ? f[iNom] || null : null,
        localidad: f[iLoc] || null,
        tipo: iTipo >= 0 ? f[iTipo] || null : null,
        lon: g ? Math.round(g.lon * 1000000) / 1000000 : null,
        lat: g ? Math.round(g.lat * 1000000) / 1000000 : null,
        fuente: "navarra-arte-monumentos",
      });
      if (objetos.length >= 300) break;
    }
    return { objetos, edicion: "verificada 2026-10-06", nota: `${filas.length} registros en Navarra; ${objetos.length} del municipio.` };
  }
  return {
    objetos: [],
    edicion: "",
    nota: `Sin fuente de cultura verificada para «${provincia}» (verificadas: CV-BIC/BRL, Tenerife, Navarra).`,
  };
}
