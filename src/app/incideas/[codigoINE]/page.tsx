import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import IncideasHeader from "@/components/platform/IncideasHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import Badge from "@/components/ui/Badge";
import { CATEGORIAS_INCIDEAS } from "@/lib/incideas/categorias";
import { getFichaMunicipal } from "@/lib/incideas/ficha";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ codigoINE: string }>;
}): Promise<Metadata> {
  const { codigoINE } = await params;
  const ficha = await getFichaMunicipal(codigoINE);
  if (!ficha) return { title: "Municipio no encontrado" };
  return {
    title: `${ficha.denominacion} - INCideas`,
    description: `Información municipal para la planificación y gestión de emergencias de ${ficha.denominacion}.`,
  };
}

const INE_RE = /^\d{5}$/;

export default async function IncideasFichaPage({
  params,
}: {
  params: Promise<{ codigoINE: string }>;
}) {
  const { codigoINE } = await params;

  if (!INE_RE.test(codigoINE)) notFound();

  const ficha = await getFichaMunicipal(codigoINE);

  if (!ficha) {
    return (
      <div className="flex min-h-screen flex-col">
        <IncideasHeader codigoINE={codigoINE} />
        <main id="contenido" className="flex-1">
          <section className="container-ima pt-6 pb-12 sm:pt-10 sm:pb-16">
            <Breadcrumbs
              items={[
                { label: "IDEAS Sostenibilidad", href: "/" },
                { label: "INCideas", href: "/incideas" },
                { label: "Municipio no encontrado" },
              ]}
              className="mb-6"
            />
            <div className="max-w-2xl">
              <h1 className="type-h1 text-[var(--text-primary)]">Municipio no encontrado</h1>
              <p className="mt-4 text-[var(--text-secondary)]">
                No se encontró información para el código INE {codigoINE}.
              </p>
              <p className="mt-6">
                <Link href="/incideas" className="link text-sm">
                  Volver a INCideas
                </Link>
              </p>
            </div>
          </section>
        </main>
        <PlatformFooter />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <IncideasHeader codigoINE={codigoINE} />
      <main id="contenido" className="flex-1">
        <section className="container-ima pt-6 pb-12 sm:pt-10 sm:pb-16">
          <Breadcrumbs
            items={[
              { label: "IDEAS Sostenibilidad", href: "/" },
              { label: "INCideas", href: "/incideas" },
              { label: ficha.denominacion },
            ]}
            className="mb-6"
          />

          <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <p className="type-label text-[var(--moss-ink)]">INCideas</p>
                <Badge variant="muted">INE {ficha.codigo_ine}</Badge>
              </div>
              <h1 className="type-h1 mt-4 text-[var(--text-primary)]">{ficha.denominacion}</h1>
              <p className="mt-2 text-[var(--text-secondary)]">
                {ficha.provincia} · {ficha.comunidad_autonoma}
              </p>
              {ficha.fecha_actualizacion && (
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  Última actualización: {ficha.fecha_actualizacion}
                </p>
              )}
            </div>

            <div className="rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 sm:p-6">
              <h2 className="type-h4 text-[var(--text-primary)]">Estado del inventario</h2>
              <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-[var(--text-muted)]">Categorías</dt>
                  <dd className="tnum mt-1 text-2xl font-semibold text-[var(--text-primary)]">
                    {ficha.categorias_disponibles.length}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--text-muted)]">Sin datos</dt>
                  <dd className="tnum mt-1 text-2xl font-semibold text-[var(--text-primary)]">
                    {ficha.categorias_sin_datos.length}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--text-muted)]">Por revisar</dt>
                  <dd className="tnum mt-1 text-2xl font-semibold text-[var(--rupestre)]">
                    {ficha.registros_automaticos_sin_revisar}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--text-muted)]">Validados</dt>
                  <dd className="tnum mt-1 text-2xl font-semibold text-[var(--conifera)]">
                    {ficha.registros_validados}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          <nav aria-label="Herramientas de control" className="mt-8 flex flex-wrap gap-3">
            <Link href={`/incideas/${codigoINE}/memoria`} className="btn btn-primary">
              Memoria municipal
            </Link>
            <Link href={`/incideas/${codigoINE}/revision`} className="btn btn-secondary">
              Bandeja de revisión
            </Link>
            <Link href={`/incideas/${codigoINE}/mapa`} className="btn btn-secondary">
              Mapa de control de calidad
            </Link>
            <a
              href={`/api/incideas/exportar?codigo_ine=${codigoINE}&formato=xlsx`}
              className="btn btn-ghost"
            >
              Exportar XLSX
            </a>
            <a
              href={`/api/incideas/exportar?codigo_ine=${codigoINE}&formato=geojson`}
              className="btn btn-ghost"
            >
              Exportar GeoJSON
            </a>
          </nav>
        </section>

        <section aria-labelledby="categorias" className="border-t border-[var(--border-subtle)]">
          <div className="container-ima section-ima">
            <h2 id="categorias" className="type-h2 text-[var(--text-primary)]">
              Categorías del inventario
            </h2>
            <p className="mt-4 max-w-[60ch] text-[var(--text-secondary)]">
              Cada categoría muestra su nivel de automatización y estado de completitud.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {CATEGORIAS_INCIDEAS.map((cat) => {
                const disponible = ficha.categorias_disponibles.includes(cat.id);
                const incompleta = ficha.categorias_incompletas.includes(cat.id);
                const sinDatos = ficha.categorias_sin_datos.includes(cat.id);
                return (
                  <Link
                    key={cat.id}
                    href={`/incideas/${codigoINE}/${cat.id}`}
                    className="group rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 transition-colors hover:border-[var(--musgo-300)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="type-h5 text-[var(--text-primary)]">{cat.nombre}</h3>
                      <Badge
                        variant={
                          sinDatos ? "muted" : incompleta ? "accent" : disponible ? "success" : "muted"
                        }
                      >
                        {sinDatos ? "Sin datos" : incompleta ? "Incompleta" : "Disponible"}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">{cat.descripcion}</p>
                    <p className="mt-3 text-xs text-[var(--text-muted)]">
                      Automatización: {cat.nivel_automatizacion}
                    </p>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      </main>
      <PlatformFooter />
    </div>
  );
}
