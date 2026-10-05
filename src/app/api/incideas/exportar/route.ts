import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerSafe } from "@/lib/supabase-server";
import {
  cargarLibroMunicipal,
  construirCSVInventario,
  construirGeoJSONInventario,
  VISIBILIDADES_NO_PUBLICABLES,
  type ClienteSupabase,
} from "@/lib/incideas/cargar-libro";
import { construirLibroMunicipal } from "@/lib/incideas/libro-municipal";
import { leerTodas } from "@/lib/incideas/paginar";
import {
  COLUMNAS_SELECT,
  construirCsv,
  geometriaComoObjeto,
  propiedades,
  type RegistroExport,
} from "@/lib/incideas/exportacion";

export const dynamic = "force-dynamic";
// El libro con todas sus hojas se construye en memoria. En el plan por defecto de
// Vercel una función tiene margen de sobra para hacerlo, pero se declara el límite
// para que la plataforma no lo recorte en silencio.
export const maxDuration = 60;

/**
 * GET /api/incideas/exportar
 *
 * Todos los formatos salen de UNA MISMA lectura, la del libro municipal, de manera
 * que el Excel, el CSV, el GeoJSON y el JSON describen el mismo conjunto con la
 * misma marca de tiempo. Antes cada formato se generaba por su cuenta y el Excel
 * salía de un generador distinto del resto, de modo que la web y la descarga
 * podían no coincidir.
 *
 * Formatos:
 *   xlsx    Libro municipal: portada, resumen, una hoja por categoría, fuentes,
 *           metodología, carencias, calidad y hoja técnica oculta.
 *   csv     Las mismas filas del libro, separadas por punto y coma.
 *   geojson Las mismas filas, con la geometría real de cada una.
 *   json    Las mismas filas con la ficha completa y la ficha de la instantánea.
 *   crudo   Proyección plana de las columnas de la tabla, para consumidores de
 *           máquina. Es el único formato que usa la ruta antigua, y existe para no
 *           romper integraciones; no es el producto para uso municipal.
 *
 * Nunca incluye datos de visibilidad restringida ni protegida: el filtro está en el
 * cargador, no en cada formato.
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

  // ---------------------------------------------------------------------
  // Formato «crudo»: proyección de la tabla, para máquinas.
  // ---------------------------------------------------------------------
  if (formato === "crudo" || formato === "plano") {
    return exportarCrudo(supabase, codigoINE, categoria, formato === "plano");
  }

  // ---------------------------------------------------------------------
  // El resto de formatos salen de la misma instantánea.
  // ---------------------------------------------------------------------
  let carga;
  try {
    carga = await cargarLibroMunicipal(supabase as unknown as ClienteSupabase, codigoINE);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se ha podido leer el municipio" },
      { status: 500 }
    );
  }

  const todas = carga.entrada.filas;
  const filas = categoria ? todas.filter((f) => f.categoria === categoria) : todas;

  if (filas.length === 0) {
    return NextResponse.json(
      {
        error: categoria
          ? `No hay registros de la categoría ${categoria} en ${codigoINE}`
          : `No hay registros para ${codigoINE}`,
      },
      { status: 404 }
    );
  }

  const municipio = carga.entrada.municipio.replace(/[^\w\-]+/g, "_");
  const base = `${municipio}_${codigoINE}${categoria ? `_${categoria}` : ""}`;

  // La instantánea viaja en la cabecera para que un consumidor pueda comprobar que
  // el fichero que tiene delante corresponde a una versión concreta.
  const snapshot = {
    codigo_ine: codigoINE,
    municipio: carga.entrada.municipio,
    provincia: carga.entrada.provincia,
    comunidad_autonoma: carga.entrada.comunidad_autonoma,
    generada_en: carga.entrada.generado_en,
    registros_totales_del_municipio: todas.length,
    registros_en_esta_descarga: filas.length,
    filtro_categoria: categoria ?? null,
    fuentes: carga.entrada.fuentes.map((f) => ({
      nombre: f.nombre,
      organismo: f.organismo,
      licencia: f.licencia,
      registros: f.registros_en_libro,
    })),
    avisos: carga.avisos,
  };

  if (formato === "xlsx") {
    // Al filtrar por categoría, el libro lleva solo esas filas. El resumen y las
    // hojas de fuentes y carencias se calculan sobre lo que realmente se entrega,
    // para que los recuentos del libro no cuenten algo que el fichero no contiene.
    const buffer = await construirLibroMunicipal({ ...carga.entrada, filas });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${base}_inventario.xlsx"`,
        "Cache-Control": "no-store",
        "X-Incideas-Snapshot": carga.entrada.generado_en,
      },
    });
  }

  if (formato === "csv") {
    const csv = construirCSVInventario(filas);
    return new NextResponse("\uFEFF" + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${base}_inventario.csv"`,
        "Cache-Control": "no-store",
        "X-Incideas-Snapshot": carga.entrada.generado_en,
      },
    });
  }

  if (formato === "geojson") {
    const gj = construirGeoJSONInventario(filas, base);
    return new NextResponse(gj, {
      headers: {
        "Content-Type": "application/geo+json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${base}_inventario.geojson"`,
        "Cache-Control": "no-store",
        "X-Incideas-Snapshot": carga.entrada.generado_en,
      },
    });
  }

  // json (por defecto) y cualquier formato desconocido: la ficha completa, para que
  // un cliente pueda ver los campos que el CSV y el GeoJSON recortan.
  return NextResponse.json(
    {
      ...snapshot,
      registros: filas,
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Incideas-Snapshot": carga.entrada.generado_en,
      },
    }
  );
}

/**
 * Proyección plana de la tabla, conservada para consumidores de máquina.
 *
 * Mantiene el paginador, porque el servidor de Supabase corta las respuestas
 * largas en silencio, y el filtro de visibilidad, porque esta vía también sale del
 * proyecto. Devuelve 404 si no hay nada que exportar.
 */
async function exportarCrudo(
  supabase: NonNullable<ReturnType<typeof createSupabaseServerSafe>>,
  codigoINE: string,
  categoria: string | null,
  comoCsv: boolean
): Promise<NextResponse> {
  const { data: registros, error } = await leerTodas<RegistroExport>((desde, hasta) => {
    let query = supabase
      .from("incideas_registros")
      .select(COLUMNAS_SELECT)
      .eq("codigo_ine", codigoINE)
      .is("eliminado_en", null)
      .not("visibilidad", "in", VISIBILIDADES_NO_PUBLICABLES);
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

  if (comoCsv) {
    return new NextResponse("\uFEFF" + construirCsv(registros), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${nombre}_crudo.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json({
    formato: "crudo",
    aviso:
      "Proyección plana de las columnas de la tabla. Para uso municipal, usa el " +
      "formato xlsx, que incluye portada, categorías, fuentes, carencias y calidad.",
    codigo_ine: codigoINE,
    categoria: categoria ?? "todos",
    total: registros.length,
    crs: "EPSG:4326",
    registros: registros.map((r) => ({ ...propiedades(r), geometria: geometriaComoObjeto(r.geometria) })),
  });
}