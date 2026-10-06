// Fase 2 (agente-fase2) — Deporte: instalaciones y centros deportivos.
//
// Fuentes verificadas con descarga real 2026-10-06:
// - Navarra: instalacionesdeportivas2025.csv (257 175 B; columnas
//   NombreInstalacion,Poblacion,Provincia,Dirección,CP,...,ClasesInstalacion;
//   SIN coordenadas en origen).
// - Tenerife: centros-deportivos-y-de-ocio-en-tenerife.csv (247 216 B;
//   columnas municipio_codigo,municipio_nombre,...,longitud,latitud).
// Filtro por municipio (coincidencia de nombres con variantes). Sin escritura.

import {
  descargarTexto,
  esError,
  parseCsv,
  indiceCab,
  numEs,
  sleep,
  coincideMunicipio,
  normalizar,
  type ResultadoBloque,
} from "./comun-fase2";

const NAVARRA_URL =
  "https://datosabiertos.navarra.es/dataset/74bb8291-272e-4d49-bb42-79ac75918d41/resource/a0b99523-6b7a-48aa-ad56-1753a52a2f0d/download/instalacionesdeportivas2025.csv";
const TENERIFE_URL =
  "https://datos.tenerife.es/ckan/dataset/9778eb26-533c-438a-8528-c6302c359d42/resource/ae03c796-ca25-42fe-8a7a-d54dc015a437/download/centros-deportivos-y-de-ocio-en-tenerife.csv";

function esNavarra(provincia: string): boolean {
  return normalizar(provincia).includes("navarra");
}

function esTenerife(provincia: string): boolean {
  const p = normalizar(provincia);
  return p.includes("tenerife") || p.includes("santa cruz");
}

/** Instalaciones deportivas del municipio (lon/lat solo cuando la fuente las trae). */
export async function cargarDeporte(municipio: string, provincia: string): Promise<ResultadoBloque> {
  if (esNavarra(provincia)) {
    const d = await descargarTexto(NAVARRA_URL, 3 * 1024 * 1024, 120000);
    await sleep(800);
    if (esError(d)) return { objetos: [], edicion: "", nota: `Navarra deporte: ${d.error}.` };
    const { cab, filas } = parseCsv(d.texto);
    const iNom = indiceCab(cab, [/nombreinstalacion/, /^nombre/]);
    const iMun = indiceCab(cab, [/^poblacion$/, /^municipio/]);
    const iDir = indiceCab(cab, [/direcci/]);
    const iCp = indiceCab(cab, [/^cp$/, /codigo postal/]);
    const iClase = indiceCab(cab, [/clasesinstalacion/, /tipo/]);
    if (iMun < 0) return { objetos: [], edicion: "", nota: "Navarra deporte: sin columna de municipio." };
    const objetos: Record<string, unknown>[] = [];
    for (const f of filas) {
      if (!coincideMunicipio(f[iMun] ?? "", municipio)) continue;
      objetos.push({
        nombre: iNom >= 0 ? f[iNom] || null : null,
        municipio: f[iMun] || null,
        direccion: iDir >= 0 ? f[iDir] || null : null,
        cp: iCp >= 0 ? f[iCp] || null : null,
        clases: iClase >= 0 ? f[iClase] || null : null,
        lon: null,
        lat: null,
        fuente: "navarra-instalaciones-deportivas-2025",
      });
      if (objetos.length >= 300) break;
    }
    return {
      objetos,
      edicion: "2026-06-09",
      nota: `${filas.length} instalaciones en Navarra; ${objetos.length} del municipio (fuente sin coordenadas: objetos administrativos).`,
    };
  }
  if (esTenerife(provincia)) {
    const d = await descargarTexto(TENERIFE_URL, 3 * 1024 * 1024, 120000);
    await sleep(800);
    if (esError(d)) return { objetos: [], edicion: "", nota: `Tenerife deporte: ${d.error}.` };
    const { cab, filas } = parseCsv(d.texto);
    const iNom = indiceCab(cab, [/^nombre$/]);
    const iMun = indiceCab(cab, [/municipio_nombre/, /^municipio/]);
    const iDir = indiceCab(cab, [/direccion_nombre_via/, /direccion/]);
    const iLon = indiceCab(cab, [/^longitud$/, /^lng$/]);
    const iLat = indiceCab(cab, [/^latitud$/, /^lat$/]);
    if (iMun < 0) return { objetos: [], edicion: "", nota: "Tenerife deporte: sin columna de municipio." };
    const objetos: Record<string, unknown>[] = [];
    for (const f of filas) {
      if (!coincideMunicipio(f[iMun] ?? "", municipio)) continue;
      objetos.push({
        nombre: iNom >= 0 ? f[iNom] || null : null,
        municipio: f[iMun] || null,
        direccion: iDir >= 0 ? f[iDir] || null : null,
        lon: iLon >= 0 ? numEs(f[iLon]) : null,
        lat: iLat >= 0 ? numEs(f[iLat]) : null,
        fuente: "tenerife-centros-deportivos",
      });
      if (objetos.length >= 300) break;
    }
    return {
      objetos,
      edicion: "2026-05-31",
      nota: `${filas.length} centros en Tenerife; ${objetos.length} del municipio.`,
    };
  }
  return {
    objetos: [],
    edicion: "",
    nota: `Sin fuente de deporte verificada para «${provincia}» (verificadas: Navarra, Tenerife).`,
  };
}
