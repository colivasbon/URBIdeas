import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import IncideasHeader from "@/components/platform/IncideasHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import RevisionInbox from "@/components/incideas/RevisionInbox";

export const metadata: Metadata = {
  title: "Revisión de datos - INCideas",
  description: "Bandeja de revisión de registros automáticos sin validar.",
};

const INE_RE = /^\d{5}$/;

export default async function IncideasRevisionPage({
  params,
}: {
  params: Promise<{ codigoINE: string }>;
}) {
  const { codigoINE } = await params;
  if (!INE_RE.test(codigoINE)) notFound();

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
              { label: "Revisión" },
            ]}
            className="mb-6"
          />
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="type-label text-[var(--moss-ink)]">Control de calidad</p>
              <h1 className="type-h1 mt-2 text-[var(--text-primary)]">Bandeja de revisión</h1>
              <p className="mt-3 max-w-[60ch] text-[var(--text-secondary)]">
                Registros automáticos pendientes de validar, sin coordenadas, fuera del municipio,
                posibles duplicados, conflictos y posibles bajas. Toda acción queda registrada.
              </p>
            </div>
            <Link href={`/incideas/${codigoINE}/mapa`} className="btn btn-secondary">
              Ver mapa de control
            </Link>
          </div>
          <RevisionInbox codigoINE={codigoINE} />
        </section>
      </main>
      <PlatformFooter />
    </div>
  );
}
