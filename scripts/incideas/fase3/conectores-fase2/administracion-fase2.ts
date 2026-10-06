// Fase 2 (agente-fase2) — Administración: ayuntamiento y edificios locales.
//
// Fuente verificada con descarga real 2026-10-06:
// - Tenerife: administraciones-y-servicios-publicos-en-tenerife.csv
//   (238 679 B; actividad_tipo con 27 «administracion publica casa
//   consistorial», 61 policía, 127 juzgados...; columnas
//   actividad_tipo,nombre,...,municipio_codigo,municipio_nombre,...,
//   longitud,latitud).
// Filtro: municipio + actividad_tipo que empieza por «administracion
// publica» (incluye casa consistorial). Sin escritura.

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

const TENERIFE_URL =
  "https://datos.tenerife.es/ckan/dataset/5277a556-81f2-46e5-8a22-8024bfddd387/resource/897f0d4e-6e93-4281-89b0-f63cbee5f330/download/administraciones-y-servicios-publicos-en-tenerife.csv";

function esTenerife(provincia: string): boolean {
  const p = normalizar(provincia);
  return p.includes("tenerife") || p.includes("santa cruz");
}

/** Sedes de la administración local del municipio (lon/lat de la fuente). */
export async function cargarAdministracion(municipio: string, provincia: string): Promise<ResultadoBloque> {
  if (!esTenerife(provincia)) {
    return {
      objetos: [],
      edicion: "",
      nota: `Sin directorio de sedes administrativas verificado para «${provincia}» (verificado: Tenerife; DIR3 nacional pendiente).`,
    };
  }
  const d = await descargarTexto(TENERIFE_URL, 3 * 1024 * 1024, 120000);
  await sleep(800);
  if (esError(d)) return { objetos: [], edicion: "", nota: `Tenerife administración: ${d.error}.` };
  const { cab, filas } = parseCsv(d.texto);
  const iAct = indiceCab(cab, [/^actividad_tipo$/]);
  const iNom = indiceCab(cab, [/^nombre$/]);
  const iMun = indiceCab(cab, [/municipio_nombre/, /^municipio/]);
  const iDir = indiceCab(cab, [/direccion_nombre_via/, /direccion/]);
  const iLon = indiceCab(cab, [/^longitud$/, /^lng$/]);
  const iLat = indiceCab(cab, [/^latitud$/, /^lat$/]);
  if (iMun < 0 || iAct < 0) return { objetos: [], edicion: "", nota: "Tenerife administración: columnas inesperadas." };
  const objetos: Record<string, unknown>[] = [];
  for (const f of filas) {
    if (!normalizar(f[iAct] ?? "").startsWith("administracion publica")) continue;
    if (!coincideMunicipio(f[iMun] ?? "", municipio)) continue;
    objetos.push({
      actividad: f[iAct] || null,
      nombre: iNom >= 0 ? f[iNom] || null : null,
      municipio: f[iMun] || null,
      direccion: iDir >= 0 ? f[iDir] || null : null,
      lon: iLon >= 0 ? numEs(f[iLon]) : null,
      lat: iLat >= 0 ? numEs(f[iLat]) : null,
      fuente: "tenerife-administraciones",
    });
    if (objetos.length >= 300) break;
  }
  return {
    objetos,
    edicion: "2026-05-31",
    nota: `${filas.length} sedes en Tenerife; ${objetos.length} de administración pública del municipio.`,
  };
}
