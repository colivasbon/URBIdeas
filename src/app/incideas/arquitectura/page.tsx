import type { Metadata } from "next";
import Link from "next/link";
import IncideasHeader from "@/components/platform/IncideasHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import {
  Carencia,
  Prosa,
  SeccionDoc,
  TablaDoc,
} from "@/components/incideas/Documento";

export const metadata: Metadata = {
  title: "Arquitectura",
  description:
    "Capas, flujo de datos, orígenes y ciclo de vida de los registros de INCideas.",
};

const CAPAS: { capa: string; titulo: string; detalle: string }[] = [
  {
    capa: "0",
    titulo: "Plataforma compartida",
    detalle:
      "Municipios, provincias y comunidades autónomas (Supabase) y envelope municipal de SOCideas (R2). Se consumen, no se duplican.",
  },
  {
    capa: "1",
    titulo: "Fuentes externas",
    detalle:
      "Oficiales: INE (padrón), Geoportal de Gasolineras (MITECO) y WFS del ICV (centros docentes y sanitarios de la GVA). Municipal: plantilla XLSX. Colaborativa: OpenStreetMap.",
  },
  {
    capa: "2",
    titulo: "Conectores",
    detalle:
      "Ocho conectores (límite, padrón, gasolineras, centros docentes y sanitarios, equipamientos, transporte y emergencias OSM). Descargan y mapean a un formato común; no persisten.",
  },
  {
    capa: "3",
    titulo: "Pipeline",
    detalle:
      "Normalización con procedencia por atributo, huella determinista, validación espacial, upsert idempotente y detección de duplicados.",
  },
  {
    capa: "4",
    titulo: "Almacenamiento",
    detalle:
      "Supabase PostGIS: registros, fuentes, ejecuciones, historial, revisiones, importaciones y extensiones por categoría.",
  },
  {
    capa: "5",
    titulo: "API",
    detalle:
      "Registros (público), revisión (escritura con token), exportación (json, csv, geojson, xlsx) e importación manual.",
  },
  {
    capa: "6",
    titulo: "Interfaz",
    detalle:
      "Ficha municipal, categorías, memoria estilo PTM, bandeja de revisión y mapa de control de calidad.",
  },
  {
    capa: "7",
    titulo: "Operación",
    detalle:
      "Scripts de línea de comandos para sembrar fuentes, ejecutar conectores e importar XLSX, con pruebas del pipeline.",
  },
];

const ORIGENES: (string | null)[][] = [
  ["Límite municipal", "OSM / Nominatim", "Conector osm-boundary", "Colaborativa, a revisión"],
  [
    "Equipamientos, alojamientos, combustible, veterinarias",
    "OSM / Overpass",
    "Conector osm-pois",
    "Colaborativa, a revisión",
  ],
  ["Padrón (serie anual)", "INE, tabla 29005", "Conector ine-poblacion", "Oficial"],
  [
    "Centros docentes no universitarios",
    "GVA, vía WFS del ICV",
    "Conector gva-centros-docentes",
    "Oficial (Comunitat Valenciana)",
  ],
  [
    "Hospitales, centros de salud y de especialidades",
    "GVA, vía WFS del ICV",
    "Conector gva-centros-sanitarios",
    "Oficial (Comunitat Valenciana)",
  ],
  ["Estaciones de servicio", "Geoportal de Gasolineras (MITECO)", "Conector minetur-carburantes", "Oficial"],
  [
    "Paradas y estaciones de transporte, helipuertos",
    "OSM / Overpass, por término municipal",
    "Conector osm-movilidad",
    "Colaborativa, a revisión",
  ],
  [
    "Hidrantes, desfibriladores, ambulancias, puntos de encuentro",
    "OSM / Overpass, por término municipal",
    "Conector osm-emergencias",
    "Colaborativa, a revisión",
  ],
  [
    "Población, estructura, superficie, densidad",
    "SOCideas (R2)",
    "Lectura directa; no se copia",
    "Oficial",
  ],
  [
    "Núcleos, partidas, paradas de autobús, farmacias, centros educativos",
    "Plantilla municipal XLSX",
    "Importación con reproyección UTM 30N",
    "Municipal, contrastado",
  ],
  ["Identificación administrativa", "Plataforma compartida", "Clave codigo_ine", "Oficial"],
];

const CICLO: [string, string][] = [
  ["Ejecución", "Cada carga queda registrada con conector, versión, contadores, errores y resumen de calidad."],
  [
    "Idempotencia",
    "Se busca por id de origen y después por huella; reejecutar no duplica.",
  ],
  [
    "Protección de validados",
    "Un registro validado técnica o municipalmente no se sobrescribe; la carga automática deja una traza.",
  ],
  [
    "Posibles bajas",
    "Lo que desaparece de la fuente se marca, nunca se borra, y se restaura si reaparece. Cada conector declara de qué registros es responsable, y una respuesta parcial o vacía con errores no genera bajas.",
  ],
  [
    "Selección de fuente",
    "La memoria usa, en cada subcategoría, la fuente de mayor rango disponible (oficial, municipal, colaborativa) y deja el resto para contraste.",
  ],
  ["Historial", "Un apunte por campo cambiado, con valor anterior y nuevo."],
  [
    "Revisión",
    "Validar, marcar conflictivo, pendiente u obsoleto, corregir categoría o geometría, aceptar o rechazar valores y confirmar bajas, con traza completa.",
  ],
  ["Caducidad", "Definida por categoría; no hay un plazo universal."],
];

const PENDIENTES: [string, string][] = [
  [
    "Capas OSM lineales y poligonales",
    "Red viaria, trazado ferroviario, hidrografía y usos del suelo exigen geometría completa y una decisión de almacenamiento. Paradas, estaciones y recursos de emergencia ya se cargan como puntos.",
  ],
  [
    "Actualización automática",
    "Hoy los conectores se lanzan a mano. Se recomienda un planificador externo (GitHub Actions) frente a Vercel Cron o pg_cron, por la duración de Overpass y porque la lógica vive en TypeScript.",
  ],
  [
    "Fusión de duplicados",
    "La detección existe; falta fusionar y separar desde la bandeja con confirmación y reversibilidad.",
  ],
  [
    "Fuentes oficiales",
    "Riesgos, hidrantes, registro de DEA, servicios sociales, necesidades especiales (agregadas) y capacidades de albergue no tienen aún fuente verificada. Las fuentes autonómicas solo cubren la Comunitat Valenciana.",
  ],
];

export default function IncideasArquitecturaPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <IncideasHeader />
      <main id="contenido" className="flex-1">
        <section className="container-ima pt-6 pb-12 sm:pt-10 sm:pb-16">
          <Breadcrumbs
            items={[
              { label: "IDEAS Sostenibilidad", href: "/" },
              { label: "INCideas", href: "/incideas" },
              { label: "Arquitectura" },
            ]}
            className="mb-6"
          />

          <header className="max-w-3xl">
            <p className="type-label text-[var(--moss-ink)]">INCideas</p>
            <h1 className="type-h1 mt-2 text-[var(--text-primary)]">Arquitectura del sistema</h1>
            <p className="mt-4 text-[var(--text-secondary)]">
              De dónde sale cada dato, cómo entra, dónde se guarda y cómo se mantiene. Es el mapa
              técnico que complementa la{" "}
              <Link href="/incideas/metodologia" className="link">
                metodología
              </Link>{" "}
              y el{" "}
              <Link href="/incideas/fuentes" className="link">
                registro de fuentes
              </Link>
              .
            </p>
          </header>

          <div className="max-w-5xl">
            <SeccionDoc numero="1" titulo="Capas">
              <Prosa>
                Cada capa solo conoce a la inmediatamente inferior. Un conector descarga y mapea; el
                pipeline normaliza, valida y persiste a través de una interfaz de almacenamiento, de
                modo que la lógica se prueba sin base de datos.
              </Prosa>
              <ol className="space-y-2">
                {CAPAS.map((c) => (
                  <li
                    key={c.capa}
                    className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-4 rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 sm:grid-cols-[2.25rem_14rem_minmax(0,1fr)]"
                  >
                    <span className="tnum font-semibold text-[var(--moss-ink)]">{c.capa}</span>
                    <span className="font-medium text-[var(--text-primary)]">{c.titulo}</span>
                    <span className="col-span-2 text-sm text-[var(--text-secondary)] sm:col-span-1">
                      {c.detalle}
                    </span>
                  </li>
                ))}
              </ol>
            </SeccionDoc>

            <SeccionDoc numero="2" titulo="Origen de cada dato">
              <TablaDoc
                columnas={["Dato", "Fuente", "Vía de entrada", "Verificación"]}
                filas={ORIGENES}
                pie="Todo registro conserva fuente, fecha de consulta, licencia y estado de validación."
              />
            </SeccionDoc>

            <SeccionDoc numero="3" titulo="Ciclo de vida de un registro">
              <TablaDoc columnas={["Etapa", "Qué ocurre"]} filas={CICLO} />
            </SeccionDoc>

            <SeccionDoc numero="4" titulo="OpenStreetMap: alcance y límites">
              <Prosa>
                Se puede descargar casi todo lo mapeado, por municipio o por región, y exportarlo a
                GeoJSON o a Excel. El libro XLSX incluye latitud, longitud y geometría en WKT, pero
                no geometría vectorial; para uso en un SIG se mantiene el GeoJSON.
              </Prosa>
              <Prosa>
                Los datos de OSM se publican bajo licencia ODbL 1.0: exigen atribución
                «© OpenStreetMap contributors» y compartir igual las bases derivadas. No son dato
                oficial: entran como automáticos sin revisar y solo pasan a verificados tras
                contrastarse con fuente oficial o trabajo de campo.
              </Prosa>
              <nav aria-label="Exportación" className="flex flex-wrap gap-2 pt-1">
                <Link href="/incideas/municipios" className="btn btn-secondary text-sm">
                  Elegir municipio y exportar
                </Link>
              </nav>
            </SeccionDoc>

            <SeccionDoc numero="5" titulo="Pendiente y decisiones abiertas">
              <TablaDoc columnas={["Asunto", "Situación"]} filas={PENDIENTES} />
              <Carencia>
                No se han implementado capas OSM lineales ni poligonales, ni la actualización
                programada. Ambas requieren decisiones de diseño y, la segunda, secretos y
                autorización expresa.
              </Carencia>
            </SeccionDoc>
          </div>
        </section>
      </main>
      <PlatformFooter />
    </div>
  );
}
