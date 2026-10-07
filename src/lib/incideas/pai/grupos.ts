// Grupos de mediciones del análisis de entorno. Módulo sin dependencias de servidor: lo usan
// tanto el análisis (entorno.ts) como la interfaz (filtros, colores y leyenda del mapa).

export type GrupoId = "seguridad" | "sanidad" | "agua" | "viario" | "energia" | "nucleos" | "espacios" | "forestal";

export interface GrupoMedicion {
  id: GrupoId;
  nombre: string;
  descripcion: string;
  color: string;
}

export const GRUPOS: GrupoMedicion[] = [
  { id: "seguridad", nombre: "Emergencias y seguridad", descripcion: "Bomberos, Guardia Civil y Policía", color: "#C0392B" },
  { id: "sanidad", nombre: "Sanidad", descripcion: "Hospitales y centros de salud", color: "#E67E22" },
  { id: "agua", nombre: "Agua e inundabilidad", descripcion: "Hidrantes, balsas, depósitos, cauces y ARPSI", color: "#2E86C1" },
  { id: "viario", nombre: "Viario y accesos", descripcion: "Autovías, carreteras, caminos y ferrocarril", color: "#34495E" },
  { id: "energia", nombre: "Energía", descripcion: "Líneas eléctricas, subestaciones, plantas y conducciones", color: "#8E44AD" },
  { id: "nucleos", nombre: "Núcleos de población", descripcion: "Ciudades, pueblos y aldeas", color: "#B7950B" },
  { id: "espacios", nombre: "Espacios protegidos", descripcion: "ENP y Red Natura 2000", color: "#86B73D" },
  { id: "forestal", nombre: "Masa forestal y montes", descripcion: "Monte arbolado, desarbolado y MUP", color: "#3E665C" },
];

export const GRUPO_POR_ID: Record<GrupoId, GrupoMedicion> = Object.fromEntries(GRUPOS.map((g) => [g.id, g])) as Record<GrupoId, GrupoMedicion>;
