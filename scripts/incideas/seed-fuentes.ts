// INCideas — siembra del catálogo de fuentes verificadas.
//
// Uso:
//   npx tsx scripts/incideas/seed-fuentes.ts            # dry-run: muestra qué insertaría
//   npx tsx scripts/incideas/seed-fuentes.ts --go       # escribe en incideas_fuentes
//
// Solo incluye fuentes verificadas manualmente (endpoint comprobado y respuesta real).
// Requiere en .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (solo con --go).
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

interface FuenteSeed {
  organismo: string;
  nombre: string;
  tipo: string;
  cobertura: string;
  categorias: string[];
  formato: string;
  licencia: string;
  frecuencia: string;
  estabilidad: "alta" | "media" | "baja";
  limitaciones: string;
  campos_disponibles: string[];
  nivel_confianza_inicial: number;
  url: string | null;
  comunidad_autonoma: string | null;
  activa: boolean;
  estado: string;
  version_esquema: string;
}

// Fuentes VERIFICADAS en esta iteración (endpoint consultado y respuesta comprobada).
const FUENTES: FuenteSeed[] = [
  {
    organismo: "OpenStreetMap Foundation",
    nombre: "OpenStreetMap (Nominatim)",
    tipo: "colaborativa",
    cobertura: "España",
    categorias: ["territorio"],
    formato: "JSON (GeoJSON polygon)",
    licencia: "ODbL 1.0",
    frecuencia: "continua",
    estabilidad: "media",
    limitaciones:
      "Datos colaborativos. Límite administrativo sin garantía oficial. Uso conforme a la política de Nominatim (User-Agent, 1 petición/seg).",
    campos_disponibles: ["geometria", "osm_type", "osm_id", "display_name"],
    nivel_confianza_inicial: 60,
    url: "https://nominatim.openstreetmap.org",
    comunidad_autonoma: null,
    activa: true,
    estado: "activa",
    version_esquema: "jsonv2",
  },
  {
    organismo: "OpenStreetMap Foundation",
    nombre: "OpenStreetMap (Overpass)",
    tipo: "colaborativa",
    cobertura: "España",
    categorias: [
      "equipamientos",
      "infraestructuras",
      "servicios_basicos",
      "animales",
      "medios_recursos",
      "evacuacion",
    ],
    formato: "JSON (Overpass)",
    licencia: "ODbL 1.0",
    frecuencia: "continua",
    estabilidad: "media",
    limitaciones:
      "Datos colaborativos; requiere revisión. No fiable para capacidades, aforos, personal ni situación operativa. Endpoint con disponibilidad variable.",
    campos_disponibles: ["nombre", "coordenadas", "direccion", "telefono", "web", "horario", "categoria"],
    nivel_confianza_inicial: 55,
    url: "https://overpass-api.de",
    comunidad_autonoma: null,
    activa: true,
    estado: "activa",
    version_esquema: "overpass-ql",
  },
  {
    organismo: "Instituto Nacional de Estadística",
    nombre: "INE - Padrón municipal (tabla 29005)",
    tipo: "oficial_estructurada",
    cobertura: "España",
    categorias: ["poblacion"],
    formato: "CSV (ISO-8859-1)",
    licencia: "Reutilización libre citando la fuente (Ley 37/2007)",
    frecuencia: "anual (revisión del padrón)",
    estabilidad: "alta",
    limitaciones:
      "Solo población y sexo por municipio y año. No aporta geometría ni estructura por edad en esta tabla.",
    campos_disponibles: ["municipio", "sexo", "periodo", "total"],
    nivel_confianza_inicial: 95,
    url: "https://www.ine.es/jaxiT3/Tabla.htm?t=29005",
    comunidad_autonoma: null,
    activa: true,
    estado: "activa",
    version_esquema: "jaxiT3-csv",
  },
  {
    organismo: "Ayuntamiento de Benidorm (documento de trabajo)",
    nombre: "Plantilla municipal — Limpieza info (PTM Benidorm)",
    tipo: "municipal",
    cobertura: "Benidorm (03031)",
    categorias: ["territorio", "infraestructuras", "equipamientos"],
    formato: "XLSX (coordenadas UTM 30N)",
    licencia: "Uso interno del proyecto",
    frecuencia: "manual (por revisión del plan)",
    estabilidad: "baja",
    limitaciones:
      "Documento de trabajo municipal sin normalizar. Coordenadas en EPSG:25830; requieren reproyección. Datos a contrastar.",
    campos_disponibles: [
      "nucleos_partidas",
      "paradas_autobus",
      "farmacias",
      "centros_educativos",
    ],
    nivel_confianza_inicial: 70,
    url: null,
    comunidad_autonoma: "Comunitat Valenciana",
    activa: true,
    estado: "activa",
    version_esquema: "xlsx-limpieza-info",
  },
  {
    organismo: "Ministerio para la Transición Ecológica y el Reto Demográfico",
    nombre: "Geoportal de Gasolineras (MITECO, API REST)",
    tipo: "oficial_estructurada",
    cobertura: "España (estaciones terrestres)",
    categorias: ["servicios_basicos"],
    formato: "JSON (REST)",
    licencia: "Reutilización de información del sector público (Ley 37/2007), citando la fuente",
    frecuencia: "diaria",
    estabilidad: "alta",
    limitaciones:
      "El municipio se identifica con un código interno (IDMunicipio), no con el INE: se resuelve por nombre o, en su defecto, por el límite municipal. Los precios no se almacenan. No informa de capacidad de almacenamiento ni de grupo electrógeno.",
    campos_disponibles: ["IDEESS", "rotulo", "direccion", "cp", "horario", "lat", "lon", "margen", "tipo_venta"],
    nivel_confianza_inicial: 90,
    url: "https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/",
    comunidad_autonoma: null,
    activa: true,
    estado: "activa",
    version_esquema: "rest-v1",
  },
  {
    organismo: "Generalitat Valenciana (Conselleria de Educación / Institut Cartogràfic Valencià)",
    nombre: "GVA - Centros docentes de la Comunitat Valenciana (ICV WFS)",
    tipo: "oficial_estructurada",
    cobertura: "Comunitat Valenciana",
    categorias: ["equipamientos"],
    formato: "WFS 2.0 GeoJSON (EPSG:25830)",
    licencia: "CC BY 4.0",
    frecuencia: "mensual",
    estabilidad: "alta",
    limitaciones:
      "Centros no universitarios. Sin alumnado, personal ni aforo. Incluye aularios como registros propios.",
    campos_disponibles: ["codcen", "denominacion", "tipo", "regimen", "titular", "direccion", "telefono", "web", "localidad", "coordenadas"],
    nivel_confianza_inicial: 92,
    url: "https://dadesobertes.gva.es/dataset/centros-docentes-de-la-comunitat-valenciana4",
    comunidad_autonoma: "Comunitat Valenciana",
    activa: true,
    estado: "activa",
    version_esquema: "wfs-CentrosDocentesRegimen",
  },
  {
    organismo: "Generalitat Valenciana (Conselleria de Sanidad / Institut Cartogràfic Valencià)",
    nombre: "GVA - Sistema Valenciano de Salud, centros sanitarios (ICV WFS)",
    tipo: "oficial_estructurada",
    cobertura: "Comunitat Valenciana (red pública)",
    categorias: ["equipamientos"],
    formato: "WFS 2.0 GeoJSON (EPSG:25830)",
    licencia: "CC BY 4.0",
    frecuencia: "mensual",
    estabilidad: "alta",
    limitaciones:
      "Solo hospitales, centros de salud y centros de especialidades públicos. Sin consultorios auxiliares, camas ni cartera de servicios.",
    campos_disponibles: ["cen_cod", "denominacion", "direccion", "cp", "departamento_salud", "zona_basica", "coordenadas"],
    nivel_confianza_inicial: 92,
    url: "https://dadesobertes.gva.es/dataset/sistema-valenciano-de-salud-centros-sanitarios-centros-de-salud",
    comunidad_autonoma: "Comunitat Valenciana",
    activa: true,
    estado: "activa",
    version_esquema: "wfs-15_SistemaValencianoSalud",
  },
];

async function main() {
  const go = process.argv.includes("--go");

  if (!go) {
    console.log("DRY-RUN. Se insertarían estas fuentes (usa --go para escribir):");
    for (const f of FUENTES) {
      console.log(`  - [${f.tipo}] ${f.nombre}  (${f.categorias.join(", ")})`);
    }
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("ERROR: faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local");
    process.exit(1);
  }
  const supabase = createClient(url, key);

  for (const f of FUENTES) {
    const { data: existente } = await supabase
      .from("incideas_fuentes")
      .select("id")
      .eq("nombre", f.nombre)
      .maybeSingle();

    if (existente) {
      const { error } = await supabase.from("incideas_fuentes").update(f).eq("id", existente.id);
      console.log(error ? `ERROR ${f.nombre}: ${error.message}` : `Actualizada: ${f.nombre}`);
    } else {
      const { error } = await supabase.from("incideas_fuentes").insert(f);
      console.log(error ? `ERROR ${f.nombre}: ${error.message}` : `Insertada: ${f.nombre}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
