import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const archivo = formData.get("archivo") as File | null;
    const codigoINE = formData.get("codigo_ine") as string | null;
    const categoria = formData.get("categoria") as string | null;

    if (!archivo || !codigoINE || !categoria) {
      return NextResponse.json(
        { error: "Faltan campos requeridos: archivo, codigo_ine, categoria" },
        { status: 400 }
      );
    }

    const supabase = createSupabaseServer();

    const { data: municipio } = await supabase
      .from("municipios")
      .select("codigo_ine")
      .eq("codigo_ine", codigoINE)
      .single();

    if (!municipio) {
      return NextResponse.json({ error: "Municipio no encontrado" }, { status: 404 });
    }

    const buffer = await archivo.arrayBuffer();
    const nombreArchivo = `${codigoINE}_${categoria}_${Date.now()}.xlsx`;

    const { error: uploadError } = await supabase.storage
      .from("incideas-importaciones")
      .upload(nombreArchivo, buffer, {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: "Error al subir el archivo", detalles: uploadError.message },
        { status: 500 }
      );
    }

    const { data: importacion, error: insertError } = await supabase
      .from("incideas_importaciones")
      .insert({
        codigo_ine: codigoINE,
        categoria,
        archivo_nombre: archivo.name,
        archivo_url: nombreArchivo,
        estado: "pendiente",
        usuario: "usuario_anonimo",
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: "Error al registrar la importación", detalles: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      mensaje: "Importación registrada correctamente",
      importacion: {
        id: importacion.id,
        estado: importacion.estado,
        archivo: importacion.archivo_nombre,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Error interno del servidor", detalles: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    );
  }
}
