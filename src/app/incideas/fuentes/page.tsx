import type { Metadata } from "next";
import Link from "next/link";
import IncideasHeader from "@/components/platform/IncideasHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import { TablaDoc } from "@/components/incideas/Documento";
import { createSupabaseServerSafe } from "@/lib/supabase-server";
import { CONNECTORS } from "@/lib/incideas/connectors/registry";

export const metadata: Metadata = {
  title: "Fuentes",
  description: "Registro de fuentes verificadas y conectores de INCideas.",
};

export const revalidate = 3600;

interface FuenteCatalogo {
  nombre: string;
  organismo: string;
  tipo: string;
  cobertura: string | null;
  formato: string | null;
  licencia: string | null;
  frecuencia: string | null;
  limitaciones: string | null;
}

/** Fuentes identificadas pero sin conector: no alimentan datos todavía. */
const PREVISTAS: (string | null)[][] = [
  ["IGN / CNIG", "Oficial cartográfica", "Límites oficiales, red viaria, hidrografía", "WFS solo GML; geometría lineal pendiente de diseño de almacenamiento"],
  ["MITECO — SNCZI", "Oficial cartográfica", "Zonas inundables", "Servicios de mapas; requiere conector espacial"],
  ["GVA — PATRICOVA", "Oficial cartográfica", "Riesgo de inundación (Comunitat Valenciana)", "Requiere conector espacial"],
  ["Registros autonómicos de DEA y servicios sociales", "Oficial estructurada", "Desfibriladores, centros sociosanitarios", "Sin endpoint verificado"],
  ["Operadores de agua, energía y telecomunicaciones", "Operador", "Servicios básicos, hidrantes", "Plantilla de operador"],
];

const TIPO_LEGIBLE: Record<string, string> = {
  oficial_estructurada: "Oficial estructurada",
  oficial_cartografica: "Oficial cartográfica",
  oficial_documental: "Oficial documental",
  municipal: "Municipal",
  operador: "Operador",
  colaborativa: "Colaborativa",
};

async function leerCatalogo(): Promise<FuenteCatalogo[] | null> {
  const supabase = createSupabaseServerSafe();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("incideas_fuentes")
    .select("nombre,organismo,tipo,cobertura,formato,licencia,frecuencia,limitaciones")
    .eq("activa", true)
    .order("tipo")
    .order("nombre");
  if (error) return null;
  return (data ?? []) as FuenteCatalogo[];
}

export default async function IncideasFuentesPage() {
  const catalogo = await leerCatalogo();
  const conectoresDe = (nombre: string) =>
    CONNECTORS.filter((c) => c.fuente.nombre === nombre).map((c) => c.id);

  return (
    <div className="flex min-h-screen flex-col">
      <IncideasHeader />
      <main id="contenido" className="flex-1">
        <section className="container-ima pt-6 pb-12 sm:pt-10 sm:pb-16">
          <Breadcrumbs
            items={[
              { label: "IDEAS Sostenibilidad", href: "/" },
              { label: "INCideas", href: "/incideas" },
              { label: "Fuentes" },
            ]}
            className="mb-6"
          />
          <div className="max-w-5xl">
            <h1 className="type-h1 text-[var(--text-primary)]">Registro de fuentes</h1>
            <p className="mt-4 max-w-3xl text-[var(--text-secondary)]">
              Solo se conectan fuentes cuyo endpoint se ha consultado y cuya respuesta real se ha
              comprobado. Cada registro conserva su fuente, licencia, fecha de consulta y estado.
            </p>

            <h2 className="type-h3 mt-10 text-[var(--text-primary)]">Fuentes verificadas y conectadas</h2>
            {catalogo ? (
              <TablaDoc
                columnas={["Fuente", "Tipo", "Cobertura", "Licencia", "Frecuencia", "Conector", "Limitaciones"]}
                filas={catalogo.map((f) => [
                  f.nombre,
                  TIPO_LEGIBLE[f.tipo] ?? f.tipo,
                  f.cobertura,
                  f.licencia,
                  f.frecuencia,
                  conectoresDe(f.nombre).join(", ") || "importación manual",
                  f.limitaciones,
                ])}
                pie="Catálogo incideas_fuentes. Los conectores se ejecutan por municipio desde la línea de comandos."
              />
            ) : (
              <p className="mt-3 text-sm text-[var(--text-muted)]">
                Catálogo no disponible en este entorno.
              </p>
            )}

            <h2 className="type-h3 mt-10 text-[var(--text-primary)]">Fuentes previstas, sin conector</h2>
            <TablaDoc
              columnas={["Organismo", "Tipo", "Aporta", "Situación"]}
              filas={PREVISTAS}
              pie="No alimentan datos hasta que su endpoint se verifique y exista conector."
            />

            <div className="mt-10 rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6">
              <h2 className="type-h4 text-[var(--text-primary)]">Prioridad entre fuentes</h2>
              <p className="mt-3 text-[var(--text-secondary)]">
                Cuando varias fuentes describen el mismo tipo de recurso, la memoria municipal usa la
                de mayor rango disponible en cada subcategoría y deja las demás para contraste en la
                bandeja de revisión:
              </p>
              <ol className="mt-4 list-decimal space-y-2 pl-5 text-[var(--text-secondary)]">
                <li>Oficiales (estatales y autonómicas).</li>
                <li>Municipales y de operadores.</li>
                <li>Colaborativas (OpenStreetMap).</li>
              </ol>
              <p className="mt-3 text-sm text-[var(--text-muted)]">
                Un registro validado por un técnico o por el ayuntamiento nunca se sobrescribe por una
                carga automática, sea cual sea su fuente.
              </p>
            </div>

            <p className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
              <Link href="/incideas/arquitectura" className="link text-sm">
                Ver arquitectura
              </Link>
              <Link href="/incideas/metodologia" className="link text-sm">
                Ver metodología
              </Link>
            </p>
          </div>
        </section>
      </main>
      <PlatformFooter />
    </div>
  );
}
