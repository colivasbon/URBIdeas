import { NextRequest, NextResponse } from "next/server";
import { USER_AGENT } from "@/lib/incideas/connectors/http";

export const dynamic = "force-dynamic";

/** GET /api/incideas/pai/buscar?q=… — geocodificación de lugares en España (Nominatim). */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 3 || q.length > 200) return NextResponse.json({ resultados: [] });
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=es&limit=6&accept-language=es&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
    const datos = (await res.json()) as { display_name: string; lat: string; lon: string; boundingbox?: string[] }[];
    return NextResponse.json({
      resultados: datos.map((d) => ({
        nombre: d.display_name,
        lat: Number(d.lat),
        lng: Number(d.lon),
        bbox: d.boundingbox ? ([Number(d.boundingbox[0]), Number(d.boundingbox[2]), Number(d.boundingbox[1]), Number(d.boundingbox[3])] as [number, number, number, number]) : null,
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error de búsqueda" }, { status: 502 });
  }
}
