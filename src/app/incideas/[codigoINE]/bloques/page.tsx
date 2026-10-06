// INCideas Fase 3 — Ficha de bloques por municipio: qué hay cargado, de qué
// fuente y de cuándo, con su motivo cuando no hay. Botones de descarga y
// actualización arriba a la derecha, coherentes con SOCideas.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import IncideasHeader from "@/components/platform/IncideasHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import Badge from "@/components/ui/Badge";
import { getFichaMunicipal } from "@/lib/incideas/ficha";
import { getCoberturaMunicipio, getUltimaSnapshot } from "@/lib/incideas/fase3/lectura";

const INE_RE = /^\d{5}$/;

const ESTADO_TEXTO: Record<string, string> = {
  cargado: "Cargado",
  cargado_parcial: "Cargado parcialmente",
  sin_cobertura: "Sin cobertura publicada",
  no_aplicable: "No aplicable",
  fuente_caida: "Fuente caída o fallida",
  cero_resultados: "Consulta válida sin resultados",
  pendiente_aportacion: "Pendiente de aportación municipal",
};

export async function generateMetadata({ params }: { params: Promise<{ codigoINE: string }> }): Promise<Metadata> {
  const { codigoINE } = await params;
  const ficha = await getFichaMunicipal(codigoINE);
  return { title: ficha ? `Bloques — ${ficha.denominacion} - INCideas` : "Municipio no encontrado" };
}

export default async function IncideasBloquesPage({ params }: { params: Promise<{ codigoINE: string }> }) {
  const { codigoINE } = await params;
  if (!INE_RE.test(codigoINE)) notFound();
  const ficha = await getFichaMunicipal(codigoINE);
  if (!ficha) notFound();
  const cobertura = await getCoberturaMunicipio(codigoINE);
  const snapshot = await getUltimaSnapshot();

  return (
    <div className="flex min-h-screen flex-col">
      <IncideasHeader codigoINE={codigoINE} />
      <main id="contenido" className="flex-1">
        <section className="container-ima pt-6 pb-12 sm:pt-10 sm:pb-16">
          <Breadcrumbs
            items={[
              { label: "IDEAS Sostenibilidad", href: "/" },
              { label: "INCideas", href: "/incideas" },
              { label: ficha.denominacion, href: `/incideas/${codigoINE}` },
              { label: "Bloques" },
            ]}
            className="mb-6"
          />
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <p className="type-label text-[var(--moss-ink)]">INCideas · Fase 3</p>
                <Badge variant="muted">INE {ficha.codigo_ine}</Badge>
                {snapshot && <Badge variant="muted">Snapshot {snapshot.estado}</Badge>}
              </div>
              <h1 className="type-h1 mt-4 text-[var(--text-primary)]">Bloques de {ficha.denominacion}</h1>
              <p className="mt-2 text-[var(--text-secondary)]">
                {ficha.provincia} · {ficha.comunidad_autonoma} · Fuente, edición y fecha visibles por bloque.
              </p>
            </div>
            <div className="flex gap-2">
              <Link href={`/api/incideas/bloques/exportar?ine=${codigoINE}`} className="btn btn-primary text-sm">
                Descargar
              </Link>
              <Link href={`/incideas/cobertura`} className="btn btn-ghost text-sm">
                Actualización
              </Link>
            </div>
          </div>

          {cobertura.length === 0 ? (
            <p className="mt-8 text-[var(--text-secondary)]">
              Aún no hay bloques cargados para este municipio. Motivo: pendiente de carga (fase 3 en curso).
            </p>
          ) : (
            <div className="mt-8 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)]">
                    <th className="py-2 pr-4">Bloque</th>
                    <th className="py-2 pr-4">Estado</th>
                    <th className="py-2 pr-4">Objetos</th>
                    <th className="py-2 pr-4">Fuente</th>
                    <th className="py-2 pr-4">Edición</th>
                    <th className="py-2 pr-4">Actualizado</th>
                  </tr>
                </thead>
                <tbody>
                  {cobertura.map((c) => (
                    <tr key={`${c.bloque}-${c.fuente}-${c.edicion}`} className="border-b border-[var(--border-subtle)]">
                      <td className="py-2 pr-4 font-medium text-[var(--text-primary)]">{c.bloque_nombre}</td>
                      <td className="py-2 pr-4">
                        <Badge variant={c.estado === "cargado" ? "muted" : "muted"}>{ESTADO_TEXTO[c.estado] ?? c.estado}</Badge>
                      </td>
                      <td className="tnum py-2 pr-4">{c.objetos_publicados}</td>
                      <td className="py-2 pr-4 text-[var(--text-secondary)]">{c.fuente_organismo || c.fuente}</td>
                      <td className="py-2 pr-4 text-[var(--text-secondary)]">{c.edicion || "—"}</td>
                      <td className="py-2 pr-4 text-[var(--text-secondary)]">{c.fin ? c.fin.slice(0, 10) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-4 text-xs text-[var(--text-muted)]">
                Cero resultados no significa ausencia de peligro ni de infraestructura. Ninguna fuente que falla borra la última versión válida.
              </p>
            </div>
          )}
        </section>
      </main>
      <PlatformFooter />
    </div>
  );
}
