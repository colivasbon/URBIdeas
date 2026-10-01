import { createSupabaseServer } from "@/lib/supabase-server";
import type { FichaMunicipalResumen, CategoriaINCideas } from "./types";

export async function getFichaMunicipal(codigoINE: string): Promise<FichaMunicipalResumen | null> {
  const supabase = createSupabaseServer();

  const { data: municipioRaw, error } = await supabase
    .from("municipios")
    .select(
      `
      codigo_ine,
      nombre,
      provincia:provincias!inner(
        nombre,
        comunidad_autonoma:comunidades_autonomas!inner(nombre)
      )
    `
    )
    .eq("codigo_ine", codigoINE)
    .single();

  if (error || !municipioRaw) return null;

  const municipio = municipioRaw as unknown as {
    codigo_ine: string;
    nombre: string;
    provincia: {
      nombre: string;
      comunidad_autonoma: { nombre: string };
    } | null;
  };

  const { data: registros } = await supabase
    .from("incideas_registros")
    .select("categoria, estado_validacion")
    .eq("codigo_ine", codigoINE);

  const categoriasDisponibles = new Set<CategoriaINCideas>();
  const categoriasIncompletas = new Set<CategoriaINCideas>();
  let registrosAutomaticosSinRevisar = 0;
  let registrosValidados = 0;
  let registrosObsoletos = 0;
  let registrosConflictivos = 0;

  for (const r of registros ?? []) {
    categoriasDisponibles.add(r.categoria as CategoriaINCideas);
    if (r.estado_validacion === "automatico_sin_revisar") {
      registrosAutomaticosSinRevisar++;
      categoriasIncompletas.add(r.categoria as CategoriaINCideas);
    }
    if (
      r.estado_validacion === "validado_tecnicamente" ||
      r.estado_validacion === "validado_ayuntamiento"
    ) {
      registrosValidados++;
    }
    if (r.estado_validacion === "potencialmente_obsoleto") registrosObsoletos++;
    if (r.estado_validacion === "conflictivo") registrosConflictivos++;
  }

  const { count: fuentesActivas } = await supabase
    .from("incideas_fuentes")
    .select("*", { count: "exact", head: true })
    .eq("activa", true);

  const { count: fuentesConErrores } = await supabase
    .from("incideas_fuentes")
    .select("*", { count: "exact", head: true })
    .eq("estado", "fallida");

  const todasLasCategorias: CategoriaINCideas[] = [
    "territorio",
    "poblacion",
    "necesidades_especiales",
    "animales",
    "infraestructuras",
    "equipamientos",
    "servicios_basicos",
    "riesgos",
    "medios_recursos",
    "evacuacion",
    "calidad",
    "exportaciones",
  ];

  const categoriasSinDatos = todasLasCategorias.filter((c) => !categoriasDisponibles.has(c));

  return {
    codigo_ine: municipio.codigo_ine,
    denominacion: municipio.nombre,
    provincia: municipio.provincia?.nombre ?? "",
    comunidad_autonoma: municipio.provincia?.comunidad_autonoma?.nombre ?? "",
    fecha_actualizacion: undefined,
    categorias_disponibles: Array.from(categoriasDisponibles),
    categorias_incompletas: Array.from(categoriasIncompletas),
    categorias_sin_datos: categoriasSinDatos,
    fuentes_activas: fuentesActivas ?? 0,
    fuentes_con_errores: fuentesConErrores ?? 0,
    registros_automaticos_sin_revisar: registrosAutomaticosSinRevisar,
    registros_validados: registrosValidados,
    registros_obsoletos: registrosObsoletos,
    registros_conflictivos: registrosConflictivos,
    alertas_calidad: registrosObsoletos + registrosConflictivos,
  };
}
