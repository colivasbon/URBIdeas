import type { Metadata } from "next";
import Link from "next/link";
import IncideasHeader from "@/components/platform/IncideasHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";
import Breadcrumbs from "@/components/ui/Breadcrumbs";

export const metadata: Metadata = {
  title: "Metodología",
  description: "Arquitectura, procesos y metodología de INCideas.",
};

const SECCIONES = [
  {
    titulo: "Sistema híbrido",
    contenido:
      "INCideas combina datos obtenidos automáticamente desde fuentes estructuradas con un entorno de carga, revisión y mantenimiento para información que debe obtenerse mediante ayuntamientos, operadores o trabajo de campo.",
  },
  {
    titulo: "Trazabilidad",
    contenido:
      "Cada registro conserva su fuente, fecha del dato, fecha de consulta, fecha de validación y estado. No se mezclan fuentes sin procedencia.",
  },
  {
    titulo: "Control de calidad",
    contenido:
      "Estados diferenciados: automático sin revisar, contrastado, validado técnicamente, validado por ayuntamiento, incompleto, conflictivo, potencialmente obsoleto, no disponible, restringido, estimado y pendiente de información municipal.",
  },
  {
    titulo: "Caducidad por categoría",
    contenido:
      "No se utiliza un plazo universal. Cada categoría tiene su propia caducidad: padrón (última publicación), farmacias (revisión frecuente), carreteras (revisión menos frecuente), etc.",
  },
  {
    titulo: "Duplicados",
    contenido:
      "Se detectan duplicados exactos y posibles duplicados. No se realizan fusiones irreversibles sin revisión.",
  },
  {
    titulo: "Protección de datos",
    contenido:
      "La información sobre personas con necesidades especiales se almacena de forma agregada. No se almacenan nombres, DNI, direcciones particulares, diagnósticos ni medicación individual.",
  },
];

export default function IncideasMetodologiaPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <IncideasHeader />
      <main id="contenido" className="flex-1">
        <section className="container-ima pt-6 pb-12 sm:pt-10 sm:pb-16">
          <Breadcrumbs
            items={[
              { label: "IDEAS Sostenibilidad", href: "/" },
              { label: "INCideas", href: "/incideas" },
              { label: "Metodología" },
            ]}
            className="mb-6"
          />
          <div className="max-w-3xl">
            <h1 className="type-h1 text-[var(--text-primary)]">Metodología y arquitectura</h1>
            <p className="mt-4 text-[var(--text-secondary)]">
              INCideas se construye primero como sistema de recopilación y depuración, no como
              redactor automático de planes.
            </p>

            <div className="mt-10 space-y-8">
              {SECCIONES.map((s) => (
                <section key={s.titulo}>
                  <h2 className="type-h3 text-[var(--text-primary)]">{s.titulo}</h2>
                  <p className="mt-2 text-[var(--text-secondary)]">{s.contenido}</p>
                </section>
              ))}
            </div>

            <div className="mt-12 rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6">
              <h2 className="type-h4 text-[var(--text-primary)]">Principios de diseño</h2>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-[var(--text-secondary)]">
                <li>No inventar datos.</li>
                <li>No inventar APIs.</li>
                <li>No prometer automatización total.</li>
                <li>No asumir uniformidad entre comunidades autónomas.</li>
                <li>No extraer datos comerciales sin autorización.</li>
                <li>No mezclar fuentes sin procedencia.</li>
                <li>No ocultar fallos.</li>
                <li>No sobrescribir validaciones.</li>
                <li>No almacenar datos personales de personas con necesidades especiales.</li>
              </ul>
            </div>

            <p className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
              <Link href="/incideas/arquitectura" className="link text-sm">
                Ver arquitectura del sistema
              </Link>
              <Link href="/incideas/fuentes" className="link text-sm">
                Ver registro de fuentes
              </Link>
            </p>
          </div>
        </section>
      </main>
      <PlatformFooter />
    </div>
  );
}
