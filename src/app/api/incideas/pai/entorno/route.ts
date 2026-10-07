import { NextRequest, NextResponse } from "next/server";
import { analizarEntorno, type EventoEntorno } from "@/lib/incideas/pai/entorno";

export const dynamic = "force-dynamic";
// Overpass + WFS del IEPNB + WMS del SNCZI en paralelo: 30-60 s habituales.
export const maxDuration = 300;
// El geoserver del IEPNB rechaza (403) las IP de los centros de datos de EE. UU.: se ejecuta en Europa.
export const preferredRegion = ["cdg1", "fra1", "lhr1"];

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
 * Con `?stream=1` responde en NDJSON (un evento por línea) según llegan las fuentes; sin él,
 * devuelve el resultado completo en JSON.
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

  if (request.nextUrl.searchParams.get("stream") === "1") {
    const codificador = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const enviar = (e: EventoEntorno | { tipo: "error"; mensaje: string }) => {
          try {
            controller.enqueue(codificador.encode(`${JSON.stringify(e)}
`));
          } catch {
            // El cliente cerró la conexión.
          }
        };
        try {
          await analizarEntorno(g, enviar);
        } catch (err) {
          enviar({ tipo: "error", mensaje: err instanceof Error ? err.message : "Error en el análisis" });
        } finally {
          try {
            controller.close();
          } catch {
            // Ya cerrado.
          }
        }
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
    });
  }

  try {
    const resultado = await analizarEntorno(g);
    return NextResponse.json(resultado);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error en el análisis" }, { status: 500 });
  }
}
