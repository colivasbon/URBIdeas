// B — Matriz de las 142 tablas del PTM: bloque, fase, vía y estado Fase 3.
// Genera docs/fase3-matriz-bloques.md (el contenido lo firma B; la estructura,
// el integrador). Reglas por sección documentadas abajo; lo ambiguo se marca.
import { readFileSync, writeFileSync } from "node:fs";

interface Tabla {
  indice: number;
  titulo_aproximado: string;
  n_filas: number;
  n_columnas: number;
  encabezados: string[];
  seccion: string;
}

interface Regla {
  bloque: string;
  fase: 1 | 2 | 3 | 4;
  via: string;
  estado: string;
}

const POR_PREFIJO: Array<[string, Regla]> = [
  ["2.1.", { bloque: "limites", fase: 1, via: "IGN AU", estado: "cargado (muestra)" }],
  ["2.2.2.", { bloque: "hidrografia", fase: 1, via: "IGN hidro", estado: "cargado (muestra)" }],
  ["2.3.1.", { bloque: "nucleos", fase: 2, via: "mixta", estado: "estructura lista" }],
  ["2.3.2.", { bloque: "vulnerables", fase: 4, via: "aportación (agregados)", estado: "pendiente_aportacion" }],
  ["2.3.", { bloque: "poblacion", fase: 1, via: "INE Tempus3", estado: "cargado (muestra)" }],
  ["2.4.1.", { bloque: "carreteras", fase: 2, via: "nacional/autonómica", estado: "estructura lista" }],
  ["2.4.2.", { bloque: "caminos", fase: 3, via: "mixta/débil", estado: "candidato con motivo" }],
  ["2.4.3.", { bloque: "ferrocarril", fase: 2, via: "nacional/autonómica", estado: "estructura lista" }],
  ["2.4.4.", { bloque: "autobus", fase: 2, via: "GTFS verificado", estado: "estructura lista" }],
  ["2.4.5.", { bloque: "puertos", fase: 3, via: "mixta/débil", estado: "candidato con motivo" }],
  ["2.4.6.", { bloque: "aeropuertos", fase: 3, via: "mixta/débil", estado: "candidato con motivo" }],
  ["2.6.1.", { bloque: "agua", fase: 3, via: "mixta (red por núcleo: F4)", estado: "candidato con motivo" }],
  ["2.6.2.", { bloque: "agua", fase: 3, via: "mixta", estado: "candidato con motivo" }],
  ["2.6.3.", { bloque: "agua", fase: 3, via: "mixta (red por núcleo: F4)", estado: "candidato con motivo" }],
  ["2.6.4.", { bloque: "depuradoras", fase: 1, via: "PRTR + CCAA", estado: "parcial (PRTR ≥100k; CCAA pendiente)" }],
  ["2.6.5.", { bloque: "hidrantes", fase: 4, via: "aportación (plantilla lista)", estado: "pendiente_aportacion" }],
  ["2.6.6.", { bloque: "residuos", fase: 3, via: "mixta/débil", estado: "candidato con motivo" }],
  ["2.6.7.", { bloque: "residuos", fase: 3, via: "mixta/débil", estado: "candidato con motivo" }],
  ["2.6.8.", { bloque: "agua", fase: 3, via: "red eléctrica: mixta", estado: "candidato con motivo" }],
  ["2.6.9.", { bloque: "subestaciones", fase: 3, via: "mixta/débil", estado: "candidato con motivo" }],
  ["2.6.10.", { bloque: "transformadores", fase: 4, via: "aportación operador (plantilla lista)", estado: "pendiente_aportacion" }],
  ["2.6.11.", { bloque: "agua", fase: 3, via: "red de gas: mixta", estado: "candidato con motivo" }],
  ["2.6.12.", { bloque: "combustible+recarga", fase: 1, via: "MINETUR + NAP", estado: "cargado (muestra)" }],
  ["2.6.13.", { bloque: "telecom", fase: 3, via: "mixta/débil", estado: "candidato con motivo" }],
  ["2.7.1.", { bloque: "educacion", fase: 1, via: "RCD/CCAA", estado: "parcial (CCAA verificadas; RCD sin bulk)" }],
  ["2.7.2.", { bloque: "deporte", fase: 2, via: "mixta", estado: "estructura lista" }],
  ["2.7.3.", { bloque: "sanidad+farmacias", fase: 1, via: "REGCESS(+CCAA)", estado: "cargado (muestra; farmacias sin coordenadas)" }],
  ["2.7.4.", { bloque: "sociosanitario", fase: 2, via: "mixta", estado: "estructura lista" }],
  ["2.7.5.", { bloque: "cultura", fase: 2, via: "mixta", estado: "estructura lista" }],
  ["2.7.6.", { bloque: "comercio", fase: 3, via: "mixta/débil", estado: "candidato con motivo" }],
  ["2.7.7.", { bloque: "turismo", fase: 2, via: "mixta", estado: "estructura lista" }],
  ["2.7.8.", { bloque: "religioso", fase: 3, via: "mixta/débil", estado: "candidato con motivo" }],
  ["2.7.9.", { bloque: "religioso", fase: 3, via: "cementerios: mixta", estado: "candidato con motivo" }],
  ["2.7.10.", { bloque: "cultura", fase: 2, via: "patrimonio: mixta", estado: "estructura lista" }],
  ["2.8.1.", { bloque: "administracion", fase: 2, via: "mixta", estado: "estructura lista" }],
  ["2.8.2.", { bloque: "administracion", fase: 2, via: "mixta", estado: "estructura lista" }],
  ["2.8.3.", { bloque: "organizacion", fase: 4, via: "aportación", estado: "pendiente_aportacion" }],
  ["2.8.4.", { bloque: "organizacion", fase: 4, via: "aportación", estado: "pendiente_aportacion" }],
  ["3.1.1.", { bloque: "incendios", fase: 2, via: "mixta (sin dataset verificado)", estado: "estructura lista" }],
  ["3.1.2.", { bloque: "inundabilidad", fase: 1, via: "SNCZI/PATRICOVA", estado: "cargado (muestra; contención vectorial pendiente)" }],
  ["3.1.4.", { bloque: "deslizamientos", fase: 3, via: "mixta/débil", estado: "candidato con motivo" }],
  ["3.1.6.", { bloque: "mercancias", fase: 3, via: "mixta/débil", estado: "candidato con motivo" }],
  ["3.1.8.", { bloque: "industrial", fase: 3, via: "mixta/débil", estado: "candidato con motivo" }],
  ["3.1.9.", { bloque: "eventos", fase: 4, via: "aportación", estado: "pendiente_aportacion" }],
  ["3.2.", { bloque: "planes", fase: 3, via: "mixta", estado: "candidato con motivo" }],
  ["4.", { bloque: "organizacion", fase: 4, via: "aportación", estado: "pendiente_aportacion" }],
  ["5.9.4.", { bloque: "organizacion", fase: 4, via: "aportación", estado: "pendiente_aportacion" }],
  ["5.9.5.", { bloque: "evacuacion", fase: 4, via: "aportación (plantilla lista; solo designado)", estado: "pendiente_aportacion" }],
  ["5.9.6.", { bloque: "evacuacion", fase: 4, via: "aportación", estado: "pendiente_aportacion" }],
  ["7.", { bloque: "organizacion", fase: 4, via: "documentación/plan", estado: "pendiente_aportacion" }],
  ["1. Niveles", { bloque: "inundabilidad", fase: 1, via: "SNCZI/PATRICOVA (niveles de afectación)", estado: "estructura lista" }],
  ["3. Prioriz", { bloque: "organizacion", fase: 4, via: "priorización operativa (aportación)", estado: "pendiente_aportacion" }],
  ["6. Atención", { bloque: "vulnerables", fase: 4, via: "aportación (agregados)", estado: "pendiente_aportacion" }],
  ["Planes de Autoprotección", { bloque: "autoproteccion", fase: 4, via: "aportación (plantilla lista)", estado: "pendiente_aportacion" }],
  ["Aprobación", { bloque: "organizacion", fase: 4, via: "documentación del plan", estado: "pendiente_aportacion" }],
  ["Centros de Albergue", { bloque: "evacuacion", fase: 4, via: "aportación (plantilla lista; solo designado)", estado: "pendiente_aportacion" }],
  ["Recursos Públicos", { bloque: "recursos", fase: 4, via: "aportación", estado: "pendiente_aportacion" }],
  ["Recursos Privados", { bloque: "recursos", fase: 4, via: "aportación con control de acceso", estado: "pendiente_aportacion" }],
  ["Recursos de abastecimiento", { bloque: "recursos", fase: 4, via: "aportación", estado: "pendiente_aportacion" }],
  ["Recursos Técnicos", { bloque: "recursos", fase: 4, via: "aportación", estado: "pendiente_aportacion" }],
];

const FICHAS: Regla = { bloque: "organizacion/recursos (fichas 1-11: contactos internos no públicos)", fase: 4, via: "aportación con control de acceso", estado: "pendiente_aportacion" };
const RESTO: Regla = { bloque: "organizacion", fase: 4, via: "aportación/documentación", estado: "pendiente_aportacion" };

function reglaPara(seccion: string): { regla: Regla; exacta: boolean } {
  if (/^FICHA/i.test(seccion)) return { regla: FICHAS, exacta: true };
  const ordenadas = [...POR_PREFIJO].sort((a, b) => b[0].length - a[0].length);
  for (const [pref, regla] of ordenadas) {
    if (seccion.startsWith(pref)) return { regla, exacta: true };
  }
  return { regla: RESTO, exacta: false };
}

function main(): void {
  const tablas = JSON.parse(readFileSync("tmp/agente-b/tablas.json", "utf8")) as Tabla[];
  const L: string[] = [];
  L.push("# Fase 3 — Matriz de las 142 tablas del PTM");
  L.push("");
  L.push("> Generada desde la extracción estructural OOXML (`tmp/agente-b/tablas.json`).");
  L.push("> Reglas por prefijo de sección (ordenadas de más a menos específico); las fichas 1–11");
  L.push("> y los apartados de organización/recursos van a Fase 4 con control de acceso");
  L.push("> (contienen contactos internos: no se publican).");
  L.push("");
  L.push("| Nº | Sección | Título | Fil×Col | Bloque | Fase | Vía | Estado Fase 3 |");
  L.push("|---|---|---|---|---|---|---|---|");
  let ambiguas = 0;
  for (const t of tablas) {
    const { regla, exacta } = reglaPara(t.seccion);
    if (!exacta) ambiguas++;
    const titulo = (t.titulo_aproximado || t.encabezados.slice(0, 3).join(" / ")).replace(/\|/g, "/").slice(0, 90);
    L.push(`| ${t.indice} | ${t.seccion || "—"} | ${titulo || "—"} | ${t.n_filas}×${t.n_columnas} | ${regla.bloque} | ${regla.fase} | ${regla.via} | ${regla.estado} |`);
  }
  L.push("");
  L.push(`Tablas: ${tablas.length}. Sin regla específica: ${ambiguas} (van a organización/Fase 4 por defecto, revisable).`);
  L.push("");
  L.push("Cobertura por bloque (no solo por filas): la Fase 1 está cargada en la muestra de 6 municipios");
  L.push("(ver `incideas_cobertura`); las Fases 2–4 quedan en estructura+estado, con la Fase 4");
  L.push("habilitada por plantillas (`salida/plantillas/`) y validación.");
  L.push("");
  writeFileSync("docs/fase3-matriz-bloques.md", L.join("\n"));
  console.log(`OK docs/fase3-matriz-bloques.md (${tablas.length} tablas, ${ambiguas} por defecto)`);
}

main();
