import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerSafe } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

interface RegistroExport {
  id: string;
  codigo_ine: string;
  categoria: string;
  subcategoria: string | null;
  nombre_oficial: string;
  direccion: string | null;
  coordenadas: { lat: number; lng: number } | null;
  geometria: GeoJSON.Geometry | null;
  fuente_principal: string;
  id_origen: string | null;
  huella: string | null;
  fecha_dato: string | null;
  fecha_consulta: string | null;
  estado_validacion: string;
  estado_espacial: string | null;
  licencia: string | null;
  observaciones: string | null;
  crs_original: string | null;
}

function propiedades(r: RegistroExport): Record<string, unknown> {
  return {
    id: r.id,
    codigo_ine: r.codigo_ine,
    categoria: r.categoria,
    subcategoria: r.subcategoria,
    nombre: r.nombre_oficial,
    direccion: r.direccion,
    lat: r.coordenadas?.lat ?? null,
    lng: r.coordenadas?.lng ?? null,
    fuente: r.fuente_principal,
    id_origen: r.id_origen,
    huella: r.huella,
    fecha_dato: r.fecha_dato,
    fecha_consulta: r.fecha_consulta,
    estado_validacion: r.estado_validacion,
    estado_espacial: r.estado_espacial,
    licencia: r.licencia,
    advertencias: r.observaciones,
    crs: r.crs_original ?? "EPSG:4326",
  };
}

/**
 * GET /api/incideas/exportar — exportación con trazabilidad.
 * formatos: json (defecto), csv, geojson. Nunca incluye datos restringidos.
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

  let query = supabase
    .from("incideas_registros")
    .select(
      "id,codigo_ine,categoria,subcategoria,nombre_oficial,direccion,coordenadas,geometria,fuente_principal,id_origen,huella,fecha_dato,fecha_consulta,estado_validacion,estado_espacial,licencia,observaciones,crs_original"
    )
    .eq("codigo_ine", codigoINE)
    .is("eliminado_en", null)
    .not("visibilidad", "in", "(restringida,personal_protegida)");

  if (categoria) query = query.eq("categoria", categoria);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const registros = (data ?? []) as unknown as RegistroExport[];
  if (registros.length === 0) {
    return NextResponse.json({ error: "No hay registros para exportar" }, { status: 404 });
  }

  const nombre = `incideas_${codigoINE}_${categoria ?? "todos"}`;

  if (formato === "geojson") {
    const features = registros
      .map((r) => {
        let geometry: GeoJSON.Geometry | null = r.geometria ?? null;
        if (!geometry && r.coordenadas) {
          geometry = { type: "Point", coordinates: [r.coordenadas.lng, r.coordenadas.lat] };
        }
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

  if (formato === "csv") {
    const cols = [
      "id",
      "codigo_ine",
      "categoria",
      "subcategoria",
      "nombre_oficial",
      "direccion",
      "lat",
      "lng",
      "fuente_principal",
      "id_origen",
      "huella",
      "fecha_dato",
      "fecha_consulta",
      "estado_validacion",
      "estado_espacial",
      "licencia",
      "observaciones",
      "crs_original",
    ];
    const escapar = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const filas = registros.map((r) => {
      const p = propiedades(r);
      return cols
        .map((c) => {
          if (c === "lat") return escapar(r.coordenadas?.lat ?? "");
          if (c === "lng") return escapar(r.coordenadas?.lng ?? "");
          return escapar(p[c]);
        })
        .join(",");
    });
    const csv = [cols.join(","), ...filas].join("\n");
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
    registros: registros.map((r) => ({ ...propiedades(r), geometria: r.geometria })),
  });
}
