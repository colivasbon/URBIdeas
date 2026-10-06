// Fase 2 (agente-fase2) — Núcleos habitados: entidades de población.
//
// Fuentes verificadas con descarga real 2026-10-06:
// - Navarra: guía de entidades locales CSV (2025-municipios.csv; columnas
//   Denominación,Tipo entidad —«Municipio simple» frente a «Entidad Singular
//   de Población»/concejos—, Código REELL, Población...) + Nomenclátor
//   IDENA ESTADI_Pol_EntidadPob.zip (2 615 694 B, PK; polígonos UTM 30N).
// - GVA DA7-LOTUP: urbanizaciones/núcleos en zona forestal (WMS+GPKG;
//   subconjunto forestal, no censo de núcleos): solo nota.
// Fuera de Navarra: centroide de encuadre (Nominatim) como núcleo principal
// aproximado, marcado como tal. Sin escritura (SHP en memoria).

import {
  descargarTexto,
  esError,
  parseCsv,
  indiceCab,
  sleep,
  coincideMunicipio,
  normalizar,
  bboxNominatim,
  cargarShpZip,
  bboxDeCoords,
  seSolapan,
  centroideAprox,
  utm30NaLonLat,
  propsMencionanMunicipio,
  type ResultadoBloque,
} from "./comun-fase2";

const NAVARRA_GUIA =
  "https://datosabiertos.navarra.es/dataset/ebce4d71-a914-46ed-b7c6-d7e73046b511/resource/621b149e-4410-4353-b7d1-b08e3ff5d1e2/download/2025-municipios.csv";
const NAVARRA_NOMEN = "https://idena.navarra.es/descargas/ESTADI_Pol_EntidadPob.zip";

function esNavarra(provincia: string): boolean {
  return normalizar(provincia).includes("navarra");
}

/** Entidades de población del municipio (lon/lat cuando hay geometría). */
export async function cargarNucleos(municipio: string, provincia: string): Promise<ResultadoBloque> {
  const objetos: Record<string, unknown>[] = [];
  const notas: string[] = [];
  if (esNavarra(provincia)) {
    const d = await descargarTexto(NAVARRA_GUIA, 3 * 1024 * 1024, 120000);
    await sleep(800);
    if (esError(d)) {
      notas.push(`Navarra guía entidades: ${d.error}.`);
    } else {
      const { cab, filas } = parseCsv(d.texto);
      const iDen = indiceCab(cab, [/denominaci.*es/]);
      const iTipo = indiceCab(cab, [/tipo entidad.*es/]);
      const iPob = indiceCab(cab, [/poblaci/]);
      if (iDen < 0) {
        notas.push("Navarra guía: sin columna de denominación.");
      } else {
        // Municipio buscado + sus entidades singulares: comparten la raíz
        // del topónimo municipal en la denominación o mención directa.
        for (const f of filas) {
          const den = f[iDen] ?? "";
          if (!coincideMunicipio(den, municipio) && !normalizar(den).includes(normalizar(municipio))) continue;
          objetos.push({
            denominacion: den || null,
            tipo_entidad: iTipo >= 0 ? f[iTipo] || null : null,
            poblacion: iPob >= 0 ? f[iPob] || null : null,
            lon: null,
            lat: null,
            fuente: "navarra-guia-entidades-locales",
          });
          if (objetos.length >= 200) break;
        }
        notas.push(`Navarra guía 2025: ${objetos.length} entidades relacionadas (sin coordenadas en el CSV).`);
      }
    }
    const bb = await bboxNominatim(municipio, provincia);
    await sleep(800);
    const r = await cargarShpZip(NAVARRA_NOMEN, 15 * 1024 * 1024);
    if (esError(r)) {
      notas.push(`IDENA Nomenclátor: ${r.error}.`);
    } else {
      let n = 0;
      for (const f of r.features) {
        if (!f.geometry) continue;
        const menciona = propsMencionanMunicipio(f.properties, municipio);
        let cerca = false;
        if (!menciona && bb) {
          const nat = bboxDeCoords(f.geometry.coordinates);
          if (nat) {
            const c1 = utm30NaLonLat(nat.minLon, nat.minLat);
            const c2 = utm30NaLonLat(nat.maxLon, nat.maxLat);
            cerca = seSolapan(
              { minLon: Math.min(c1.lon, c2.lon), minLat: Math.min(c1.lat, c2.lat), maxLon: Math.max(c1.lon, c2.lon), maxLat: Math.max(c1.lat, c2.lat) },
              bb
            );
          }
        }
        if (!menciona && !cerca) continue;
        const c = centroideAprox(f.geometry.coordinates);
        const g = c ? utm30NaLonLat(c.x, c.y) : null;
        const nombreDe = (k: string): string | null => {
          const v = f.properties[k];
          return typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, 200) : null;
        };
        const nombreProps = nombreDe("NOMBRE") ?? nombreDe("Nombre") ?? nombreDe("TOPONIMO");
        objetos.push({
          denominacion: nombreProps,
          tipo_entidad: "entidad de población (IDENA)",
          lon: g ? Math.round(g.lon * 1000000) / 1000000 : null,
          lat: g ? Math.round(g.lat * 1000000) / 1000000 : null,
          fuente: "idena-nomenclator-entidadpob",
        });
        n++;
        if (objetos.length >= 300) break;
      }
      notas.push(`IDENA Nomenclátor: ${r.features.length} entidades; ${n} con solape/mención.`);
    }
    return { objetos, edicion: "2026-06-10", nota: notas.join(" ") };
  }
  // Fuera de Navarra: núcleo principal aproximado (centroide de encuadre).
  const bb = await bboxNominatim(municipio, provincia);
  await sleep(800);
  if (bb) {
    objetos.push({
      denominacion: municipio,
      tipo_entidad: "núcleo principal aproximado (centroide de encuadre, sin fuente censal verificada)",
      lon: Math.round(((bb.minLon + bb.maxLon) / 2) * 1000000) / 1000000,
      lat: Math.round(((bb.minLat + bb.maxLat) / 2) * 1000000) / 1000000,
      fuente: "nominatim-encuadre",
    });
  }
  notas.push(
    "GVA DA7-LOTUP solo cubre núcleos en zona forestal (no censo). Sin Nomenclátor autonómico verificado para esta provincia: núcleo aproximado."
  );
  return { objetos, edicion: "", nota: notas.join(" ") };
}
