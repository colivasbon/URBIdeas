import { NextRequest, NextResponse } from "next/server";
import { analizarEntorno } from "@/lib/incideas/pai/entorno";

export const dynamic = "force-dynamic";
// Overpass + WFS del IEPNB + WMS del SNCZI en paralelo: 30-60 s habituales.
export const maxDuration = 300;

const TIPOS = new Set(["Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon", "GeometryCollection"]);

function enEspana(g: GeoJSON.Geometry): boolean {
  const coords: number[][] = [];
  const recorrer = (x: unknown): void => {
    if (Array.isArray(x) && typeof x[0] === "number") coords.push(x as number[]);
    else if (Array.isArray(x)) x.forEach(recorrer);
  };
  if (g.type === "GeometryCollection") g.geometries.forEach((s) => "coordinates" in s && recorrer(s.coordinates));
  else recorrer(g.coordinates);
  return coords.length > 0 && coords.every(([lng, lat]) => lng > -19 && lng < 5 && lat > 27 && lat < 44.5);
}

/**
 * POST /api/incideas/pai/entorno — análisis de entorno para PAI/PAIF.
 * Cuerpo: { geometry: GeoJSON.Geometry } (punto o ámbito de la instalación, WGS84).
 */
export async function POST(request: NextRequest) {
  let body: { geometry?: GeoJSON.Geometry };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON no válido" }, { status: 400 });
  }
  const g = body.geometry;
  if (!g || !TIPOS.has(g.type)) {
    return NextResponse.json({ error: "Se requiere una geometría GeoJSON (punto, línea o polígono)" }, { status: 400 });
  }
  if (!enEspana(g)) {
    return NextResponse.json({ error: "El ámbito debe estar en España (coordenadas WGS84 lng/lat)" }, { status: 400 });
  }
  if (JSON.stringify(g).length > 2_000_000) {
    return NextResponse.json({ error: "Geometría demasiado grande; simplifica el ámbito" }, { status: 413 });
  }

  try {
    const resultado = await analizarEntorno(g);
    return NextResponse.json(resultado);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error en el análisis" }, { status: 500 });
  }
}
