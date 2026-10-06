// Fase 2A — Exportación coherente: Excel + GeoJSON + GeoPackage + mapa local.
//
// Misma foto en todos los formatos: `snapshot_utc` y recuentos idénticos.
// El GeoPackage reutiliza el escritor probado de INCideas (cabecera OGC).

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { construirGeoPackage, type FeatureGPKG } from "../../../src/lib/incideas/formato-abierto-gpkg";

export interface PaqueteExportacion {
  snapshotUtc: string;
  ine: string;
  nombreMunicipio: string;
  portada: Array<[string, string]>;
  hojas: Array<{ nombre: string; columnas: string[]; filas: Array<Array<string | number | null>> }>;
  capasGeo: Array<{ capa: string; features: FeatureGPKG[] }>;
  centroMapa: [number, number];
}

const AZUL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
const BLANCA: ExcelJS.Color = { argb: "FFFFFFFF" };

function estilarHoja(ws: ExcelJS.Worksheet, columnas: string[]): void {
  ws.getRow(1).eachCell((c) => {
    c.fill = AZUL;
    c.font = { ...c.font, color: BLANCA, bold: true };
  });
  ws.columns = columnas.map((c) => ({ header: c, key: c, width: Math.min(60, Math.max(14, c.length + 2)) }));
}

export async function escribirExcel(p: PaqueteExportacion, ruta: string): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "INCideas Fase 2A";
  wb.created = new Date(p.snapshotUtc);
  const portada = wb.addWorksheet("Portada");
  portada.columns = [{ header: "Campo", key: "c", width: 30 }, { header: "Valor", key: "v", width: 90 }];
  estilarHoja(portada, ["Campo", "Valor"]);
  for (const [c, v] of p.portada) portada.addRow([c, v]);
  for (const hoja of p.hojas) {
    const ws = wb.addWorksheet(hoja.nombre.slice(0, 31));
    ws.addRow(hoja.columnas);
    for (const f of hoja.filas) ws.addRow(f);
    estilarHoja(ws, hoja.columnas);
  }
  await wb.xlsx.writeFile(ruta);
}

export function escribirGeoJSON(salidaDir: string, base: string, capas: Array<{ capa: string; features: FeatureGPKG[] }>): string[] {
  const rutas: string[] = [];
  for (const c of capas) {
    const fc = {
      type: "FeatureCollection",
      features: c.features.map((f, i) => ({ type: "Feature", id: i + 1, geometry: f.geom, properties: f.propiedades })),
    };
    const ruta = join(salidaDir, `${base}_${c.capa}.geojson`);
    writeFileSync(ruta, JSON.stringify(fc));
    rutas.push(ruta);
  }
  return rutas;
}

export function escribirGPKG(salidaDir: string, base: string, capas: Array<{ capa: string; descripcion: string; columnas: string[]; features: FeatureGPKG[] }>): string[] {
  const rutas: string[] = [];
  for (const c of capas) {
    const buf = construirGeoPackage(c.features, c.columnas, { capa: c.capa, descripcion: c.descripcion });
    const ruta = join(salidaDir, `${base}_${c.capa}.gpkg`);
    writeFileSync(ruta, buf);
    rutas.push(ruta);
  }
  return rutas;
}

/** Mapa local de consulta (Leaflet): lee los GeoJSON exportados junto a él. */
export function escribirMapa(salidaDir: string, base: string, titulo: string, centro: [number, number], capasGeojson: string[], limiteGeojson: string | null): string {
  const capasJs = capasGeojson.map((g) => `"${g}"`).join(", ");
  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<title>${titulo}</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>html,body,#m{height:100%;margin:0}header{position:absolute;z-index:999;background:#fff;padding:6px 10px;font:13px system-ui;box-shadow:0 1px 4px #0003}</style>
</head><body>
<header><b>${titulo}</b> — consulta local Fase 2A (solo lectura)</header>
<div id="m"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const map = L.map('m').setView([${centro[0]}, ${centro[1]}], 13);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(map);
const capas = [${capasJs}];
(async () => {
  for (const c of capas) {
    try {
      const r = await fetch(c); const j = await r.json();
      const l = L.geoJSON(j, {style:{color:'#1f4e79',weight:2}}).addTo(map);
      try { map.fitBounds(l.getBounds().pad(0.1)); } catch(e) {}
    } catch(e) { console.warn('Sin capa ' + c); }
  }
  ${limiteGeojson ? `try { const r = await fetch("${limiteGeojson}"); const j = await r.json(); L.geoJSON(j,{style:{color:'#c00000',weight:3,fill:false}}).addTo(map); } catch(e) {}` : ""}
})();
</script></body></html>`;
  const ruta = join(salidaDir, `${base}_mapa.html`);
  writeFileSync(ruta, html);
  return ruta;
}
