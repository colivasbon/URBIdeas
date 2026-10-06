// Fase 3 Hito 5 — Plantillas de aportación municipal (Fase 4) + validador.
//
//   npx tsx scripts/incideas/fase3/plantillas/generar.ts --bloque hidrantes
//   npx tsx scripts/incideas/fase3/plantillas/validar.ts --archivo <xlsx>
//
// Lo aportado se marca «aportado», nunca «oficial». Sin teléfonos de
// responsables ni accesos internos: el validador avisa y la importación los
// rechaza en columnas públicas.

import ExcelJS from "exceljs";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

export interface DefinicionPlantilla {
  bloque: string;
  titulo: string;
  columnas: Array<{ clave: string; etiqueta: string; obligatoria: boolean; ejemplo: string }>;
  instrucciones: string[];
}

export const PLANTILLAS: Record<string, DefinicionPlantilla> = {
  hidrantes: {
    bloque: "hidrantes",
    titulo: "Hidrantes y bocas de riego",
    columnas: [
      { clave: "id_municipal", etiqueta: "ID municipal", obligatoria: true, ejemplo: "05i0016" },
      { clave: "tipo", etiqueta: "Tipo (hidrante/boca de riego)", obligatoria: true, ejemplo: "hidrante" },
      { clave: "ubicacion", etiqueta: "Ubicación (vía y número)", obligatoria: true, ejemplo: "Av. Mediterráneo 12" },
      { clave: "lat", etiqueta: "Latitud WGS84", obligatoria: false, ejemplo: "38.5412" },
      { clave: "lon", etiqueta: "Longitud WGS84", obligatoria: false, ejemplo: "-0.1221" },
      { clave: "estado", etiqueta: "Estado (servicio/proyecto)", obligatoria: true, ejemplo: "servicio" },
      { clave: "observaciones", etiqueta: "Observaciones", obligatoria: false, ejemplo: "subterráneo" },
    ],
    instrucciones: [
      "Una fila por elemento, con su ID municipal estable.",
      "Coordenadas en WGS84 (lat,lon); si no se conocen, dejar vacío (no inventar).",
      "No incluir teléfonos, nombres de responsables ni accesos internos.",
    ],
  },
  transformadores: {
    bloque: "transformadores",
    titulo: "Centros de transformación",
    columnas: [
      { clave: "id_municipal", etiqueta: "ID municipal", obligatoria: true, ejemplo: "CT-001" },
      { clave: "ubicacion", etiqueta: "Ubicación", obligatoria: true, ejemplo: "C/ Zijante 4" },
      { clave: "lat", etiqueta: "Latitud WGS84", obligatoria: false, ejemplo: "38.5412" },
      { clave: "lon", etiqueta: "Longitud WGS84", obligatoria: false, ejemplo: "-0.1221" },
      { clave: "titularidad", etiqueta: "Titularidad", obligatoria: false, ejemplo: "distribuidora" },
    ],
    instrucciones: ["Los datos de la distribuidora se contrastan, no se publican como propios."],
  },
  autoproteccion: {
    bloque: "autoproteccion",
    titulo: "Planes de autoprotección",
    columnas: [
      { clave: "establecimiento", etiqueta: "Establecimiento", obligatoria: true, ejemplo: "Hotel Ejemplo" },
      { clave: "direccion", etiqueta: "Dirección", obligatoria: true, ejemplo: "Av. Ejemplo 1" },
      { clave: "plan_vigente", etiqueta: "Plan vigente (sí/no)", obligatoria: true, ejemplo: "sí" },
      { clave: "fecha_plan", etiqueta: "Fecha del plan", obligatoria: false, ejemplo: "2024-03-01" },
    ],
    instrucciones: ["Solo establecimientos con plan registrado; nada se marca como recurso operativo sin designación formal."],
  },
  evacuacion: {
    bloque: "evacuacion",
    titulo: "Puntos de encuentro y albergues designados",
    columnas: [
      { clave: "nombre", etiqueta: "Nombre del punto/albergue", obligatoria: true, ejemplo: "Pabellón municipal" },
      { clave: "tipo", etiqueta: "Tipo (encuentro/albergue)", obligatoria: true, ejemplo: "albergue" },
      { clave: "direccion", etiqueta: "Dirección", obligatoria: true, ejemplo: "C/ Ejemplo 2" },
      { clave: "lat", etiqueta: "Latitud WGS84", obligatoria: false, ejemplo: "38.5412" },
      { clave: "lon", etiqueta: "Longitud WGS84", obligatoria: false, ejemplo: "-0.1221" },
      { clave: "designacion", etiqueta: "Documento de designación", obligatoria: true, ejemplo: "Decreto 12/2024" },
    ],
    instrucciones: [
      "Solo puntos y albergues con designación formal y documento.",
      "Sin datos de personas vulnerables (solo agregados, en otro procedimiento).",
    ],
  },
};

export async function generarPlantilla(bloque: string, dir: string): Promise<string> {
  const def = PLANTILLAS[bloque];
  if (!def) throw new Error(`Plantilla desconocida: ${bloque} (${Object.keys(PLANTILLAS).join(", ")})`);
  mkdirSync(dir, { recursive: true });
  const wb = new ExcelJS.Workbook();
  wb.creator = "INCideas Fase 3";
  const ws = wb.addWorksheet("datos");
  ws.columns = def.columnas.map((c) => ({ header: `${c.etiqueta}${c.obligatoria ? " *" : ""}`, key: c.clave, width: 26 }));
  ws.addRow(def.columnas.map((c) => c.ejemplo));
  ws.getRow(1).eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
    c.font = { color: { argb: "FFFFFFFF" }, bold: true };
  });
  const info = wb.addWorksheet("instrucciones");
  info.columns = [{ header: "Instrucciones", key: "i", width: 100 }];
  for (const l of def.instrucciones) info.addRow([l]);
  const ruta = join(dir, `plantilla_${bloque}.xlsx`);
  await wb.xlsx.writeFile(ruta);
  return ruta;
}

const PATRONES_SENSIBLES = [/telf|telefono|tel[eé]fono/i, /responsable/i, /acceso/i, /contrase/i, /dni|nif/i];

export interface ResultadoValidacion {
  valida: boolean;
  errores: string[];
  avisos: string[];
  filas: number;
}

/** Valida un xlsx cumplimentado contra la plantilla (sin escribir nada). */
export async function validarPlantilla(bloque: string, ruta: string): Promise<ResultadoValidacion> {
  const def = PLANTILLAS[bloque];
  const errores: string[] = [];
  const avisos: string[] = [];
  if (!def) return { valida: false, errores: [`Plantilla desconocida: ${bloque}`], avisos, filas: 0 };
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(ruta);
  const ws = wb.getWorksheet("datos");
  if (!ws) return { valida: false, errores: ["Falta la hoja «datos»."], avisos, filas: 0 };
  const cabecera = (ws.getRow(1).values as unknown[]).slice(1).map((v) => String(v ?? ""));
  const idx: Record<string, number> = {};
  def.columnas.forEach((c) => {
    const j = cabecera.findIndex((h) => h === c.etiqueta || h === `${c.etiqueta} *`);
    if (j < 0 && c.obligatoria) errores.push(`Falta la columna obligatoria «${c.etiqueta}».`);
    else if (j >= 0) idx[c.clave] = j;
  });
  for (const h of cabecera) {
    if (PATRONES_SENSIBLES.some((p) => p.test(h))) avisos.push(`Columna sensible «${h}»: no se publicará; revisar.`);
  }
  let filas = 0;
  ws.eachRow((row, n) => {
    if (n <= 2) return;
    filas++;
    const v = (k: string): string => String(row.getCell((idx[k] ?? -1) + 1).value ?? "");
    for (const c of def.columnas) {
      if (c.obligatoria && idx[c.clave] !== undefined && !v(c.clave).trim()) {
        errores.push(`Fila ${n}: «${c.etiqueta}» vacía.`);
      }
    }
    if (idx["lat"] !== undefined && v("lat").trim() !== "") {
      const lat = Number(v("lat").replace(",", "."));
      if (!Number.isFinite(lat) || Math.abs(lat) > 90) errores.push(`Fila ${n}: latitud no válida.`);
    }
    if (idx["lon"] !== undefined && v("lon").trim() !== "") {
      const lon = Number(v("lon").replace(",", "."));
      if (!Number.isFinite(lon) || Math.abs(lon) > 180) errores.push(`Fila ${n}: longitud no válida.`);
    }
  });
  return { valida: errores.length === 0, errores: errores.slice(0, 40), avisos, filas };
}
