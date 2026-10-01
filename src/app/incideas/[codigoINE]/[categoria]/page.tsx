import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import IncideasHeader from "@/components/platform/IncideasHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import Badge from "@/components/ui/Badge";
import { getCategoria } from "@/lib/incideas/categorias";
import { getRegistrosCategoria } from "@/lib/incideas/registros";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ codigoINE: string; categoria: string }>;
}): Promise<Metadata> {
  const { codigoINE, categoria } = await params;
  const cat = getCategoria(categoria);
  if (!cat) return { title: "Categoría no encontrada" };
  return {
    title: `${cat.nombre} - ${codigoINE} - INCideas`,
    description: cat.descripcion,
  };
}

const INE_RE = /^\d{5}$/;

const CATEGORIAS_VALIDAS = [
  "territorio",
  "poblacion",
  "necesidades-especiales",
  "animales",
  "infraestructuras",
  "equipamientos",
  "servicios-basicos",
  "riesgos",
  "medios_recursos",
  "evacuacion",
  "calidad",
  "exportaciones",
];

export default async function IncideasCategoriaPage({
  params,
}: {
  params: Promise<{ codigoINE: string; categoria: string }>;
}) {
  const { codigoINE, categoria } = await params;

  if (!INE_RE.test(codigoINE)) notFound();
  if (!CATEGORIAS_VALIDAS.includes(categoria)) notFound();

  const cat = getCategoria(categoria);
  if (!cat) notFound();

  const registros = await getRegistrosCategoria(codigoINE, categoria as any);

  return (
    <div className="flex min-h-screen flex-col">
      <IncideasHeader codigoINE={codigoINE} />
      <main id="contenido" className="flex-1">
        <section className="container-ima pt-6 pb-12 sm:pt-10 sm:pb-16">
          <Breadcrumbs
            items={[
              { label: "IDEAS Sostenibilidad", href: "/" },
              { label: "INCideas", href: "/incideas" },
              { label: "Ficha municipal", href: `/incideas/${codigoINE}` },
              { label: cat.nombre },
            ]}
            className="mb-6"
          />

          <div className="max-w-4xl">
            <div className="flex flex-wrap items-center gap-3">
              <p className="type-label text-[var(--moss-ink)]">{cat.nombre}</p>
              <Badge variant="muted">Automatización: {cat.nivel_automatizacion}</Badge>
            </div>
            <h1 className="type-h1 mt-4 text-[var(--text-primary)]">{cat.nombre}</h1>
            <p className="mt-4 text-[var(--text-secondary)]">{cat.descripcion}</p>

            <div className="mt-8">
              <h2 className="type-h3 text-[var(--text-primary)]">Campos</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                  <h3 className="type-h5 text-[var(--text-primary)]">Obligatorios</h3>
                  <ul className="mt-2 list-disc pl-5 text-sm text-[var(--text-secondary)]">
                    {cat.campos_obligatorios.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
                  <h3 className="type-h5 text-[var(--text-primary)]">Deseables</h3>
                  <ul className="mt-2 list-disc pl-5 text-sm text-[var(--text-secondary)]">
                    {cat.campos_deseables.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <div className="mt-10">
              <h2 className="type-h3 text-[var(--text-primary)]">
                Registros ({registros.length})
              </h2>
              {registros.length === 0 ? (
                <div className="mt-4 rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-8 text-center">
                  <p className="text-[var(--text-secondary)]">
                    No hay registros disponibles para esta categoría.
                  </p>
                  <p className="mt-2 text-sm text-[var(--text-muted)]">
                    {cat.nivel_automatizacion === "baja"
                      ? "Esta categoría requiere información municipal o trabajo de campo."
                      : "Los datos se obtendrán automáticamente cuando estén disponibles."}
                  </p>
                </div>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border-subtle)]">
                        <th className="pb-3 pr-4 font-semibold text-[var(--text-primary)]">Nombre</th>
                        <th className="pb-3 pr-4 font-semibold text-[var(--text-primary)]">Fuente</th>
                        <th className="pb-3 pr-4 font-semibold text-[var(--text-primary)]">Estado</th>
                        <th className="pb-3 font-semibold text-[var(--text-primary)]">Fecha</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {registros.map((r) => (
                        <tr key={r.id}>
                          <td className="py-3 pr-4 font-medium text-[var(--text-primary)]">
                            {r.nombre_oficial}
                          </td>
                          <td className="py-3 pr-4 text-[var(--text-secondary)]">
                            {r.fuente_principal}
                          </td>
                          <td className="py-3 pr-4">
                            <Badge
                              variant={
                                r.estado_validacion === "validado_tecnicamente" ||
                                r.estado_validacion === "validado_ayuntamiento"
                                  ? "success"
                                  : r.estado_validacion === "automatico_sin_revisar"
                                    ? "accent"
                                    : "muted"
                              }
                            >
                              {r.estado_validacion.replace(/_/g, " ")}
                            </Badge>
                          </td>
                          <td className="py-3 text-[var(--text-secondary)]">
                            {r.fecha_dato ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <p className="mt-8">
              <Link href={`/incideas/${codigoINE}`} className="link text-sm">
                Volver a la ficha municipal
              </Link>
            </p>
          </div>
        </section>
      </main>
      <PlatformFooter />
    </div>
  );
}
