import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerSafe } from "@/lib/supabase-server";
import { leerTodas } from "@/lib/incideas/paginar";
import {
  COLUMNAS_SELECT,
  construirCsv,
  construirXlsx,
  geometriaComoObjeto,
  geometriaEfectiva,
  propiedades,
  type RegistroExport,
} from "@/lib/incideas/exportacion";

export const dynamic = "force-dynamic";

/**
 * GET /api/incideas/exportar — exportación con trazabilidad.
 * formatos: json (defecto), csv, geojson, xlsx. Nunca incluye datos restringidos.
 */
export async function GET(request: NextRequest) {
  const supabase = createSupabaseServerSafe();
  if (!supabase) {
    return NextResponse.json({ error: "Servicio no configurado" }, { status: 503 });
  }

  const sp = request.nextUrl.searchParams;
  const codigoINE = sp.get("codigo_ine");
  const categoria = sp.get("categoria");
  const formato = (sp.get("formato") ?? "json").toLowerCase();

  if (!codigoINE || !/^\d{5}$/.test(codigoINE)) {
    return NextResponse.json({ error: "codigo_ine de 5 dígitos requerido" }, { status: 400 });
  }

  const { data: registros, error } = await leerTodas<RegistroExport>((desde, hasta) => {
    let query = supabase
      .from("incideas_registros")
      .select(COLUMNAS_SELECT)
      .eq("codigo_ine", codigoINE)
      .is("eliminado_en", null)
      .not("visibilidad", "in", "(restringida,personal_protegida)");
    if (categoria) query = query.eq("categoria", categoria);
    return query
      .order("id", { ascending: true })
      .range(desde, hasta)
      .overrideTypes<RegistroExport[], { merge: false }>();
  });
  if (error) return NextResponse.json({ error }, { status: 500 });
  if (registros.length === 0) {
    return NextResponse.json({ error: "No hay registros para exportar" }, { status: 404 });
  }

  const nombre = `incideas_${codigoINE}_${categoria ?? "todos"}`;

  if (formato === "geojson") {
    const features = registros
      .map((r) => {
        const geometry = geometriaEfectiva(r);
        if (!geometry) return null;
        return { type: "Feature" as const, geometry, properties: propiedades(r) };
      })
      .filter((f): f is NonNullable<typeof f> => f !== null);

    const fc = {
      type: "FeatureCollection",
      crs: { type: "name", properties: { name: "urn:ogc:def:crs:OGC:1.3:CRS84" } },
      features,
    };
    return new NextResponse(JSON.stringify(fc), {
      headers: {
        "Content-Type": "application/geo+json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${nombre}.geojson"`,
      },
    });
  }

  if (formato === "xlsx") {
    const buffer = await construirXlsx(registros, { codigoINE, categoria });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nombre}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  }

  if (formato === "csv") {
    const csv = construirCsv(registros);
    return new NextResponse("\uFEFF" + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${nombre}.csv"`,
      },
    });
  }

  return NextResponse.json({
    codigo_ine: codigoINE,
    categoria: categoria ?? "todos",
    total: registros.length,
    crs: "EPSG:4326",
    registros: registros.map((r) => ({ ...propiedades(r), geometria: geometriaComoObjeto(r.geometria) })),
  });
}
