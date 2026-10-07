import { NextRequest, NextResponse } from "next/server";
import { SECTORES_PSF, entradaPorDefecto, type EntradaRiesgo } from "@/lib/incideas/pai/riesgo-intrinseco";
import { construirXlsxRiesgo } from "@/lib/incideas/pai/riesgo-xlsx";

export const dynamic = "force-dynamic";

/**
 * POST /api/incideas/pai/riesgo-intrinseco — XLSX del cálculo de riesgo intrínseco
 * (R.D. 164/2025) con fórmulas vivas. Cuerpo: EntradaRiesgo.
 */
export async function POST(request: NextRequest) {
  let body: Partial<EntradaRiesgo>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON no válido" }, { status: 400 });
  }
  const num = (v: unknown, def: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : def);
  const e = entradaPorDefecto(String(body.nombre ?? "").slice(0, 120), num(body.potenciaMW, 0), num(body.numeroCTs, 1));
  for (const s of SECTORES_PSF) {
    const x = body.sectores?.[s.clave];
    if (x) e.sectores[s.clave] = { area: num(x.area, 0), r: num(x.r, s.rPorDefecto) || s.rPorDefecto };
  }

  const buffer = await construirXlsxRiesgo(e);
  const nombre = (e.nombre || "instalacion").normalize("NFD").replace(/[^\w-]+/g, "_").slice(0, 60);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="riesgo_intrinseco_${nombre}.xlsx"`,
    },
  });
}
