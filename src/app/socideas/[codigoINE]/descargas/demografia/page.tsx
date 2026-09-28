import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServer } from "@/lib/supabase-server";
import { getPerfilDemografico } from "@/lib/socideas-perfil";
import { buildDemografiaTables, demografiaExcluidas } from "@/lib/socideas-export";
import SocideasHeader from "@/components/platform/SocideasHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";
import PageShell from "@/components/ui/PageShell";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import EmptyState from "@/components/ui/EmptyState";
import DescargasBloque from "@/components/socideas/DescargasBloque";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ codigoINE: string }>;
}): Promise<Metadata> {
  const { codigoINE } = await params;
  return {
    title: `Tablas de Demografía ${codigoINE} | SOCideas`,
    description: `Tablas de demografía del municipio ${codigoINE} con fuente y periodo: descarga CSV e informe imprimible.`,
  };
}

export default async function DescargasDemografia({
  params,
}: {
  params: Promise<{ codigoINE: string }>;
}) {
  const { codigoINE } = await params;
  if (!/^\d{5}$/.test(codigoINE)) {
    return (
      <div className="flex min-h-screen flex-col">
        <SocideasHeader />
        <main id="contenido" className="flex-1">
          <div className="container-ima py-16">
            <div className="mx-auto w-full max-w-md">
              <EmptyState
                title="Código INE no válido"
                description="El código INE municipal tiene cinco dígitos (por ejemplo, 02003). Revise la dirección o busque el municipio por nombre."
                action={<Link href="/socideas" className="btn btn-secondary btn-sm">Buscar un municipio</Link>}
              />
            </div>
          </div>
        </main>
        <PlatformFooter />
      </div>
    );
  }
  const supabase = createSupabaseServer();
  const result = await getPerfilDemografico(supabase, codigoINE, {});
  if (result.status === "notFound" || result.status === "badRequest") {
    return (
      <div className="flex min-h-screen flex-col">
        <SocideasHeader />
        <main id="contenido" className="flex-1">
          <div className="container-ima py-16">
            <div className="mx-auto w-full max-w-md">
              <EmptyState
                title={`No se encontró el municipio con código INE ${codigoINE}`}
                description="El código no corresponde a ningún municipio del catálogo. Compruebe los cinco dígitos o búsquelo por nombre."
                action={<Link href="/socideas" className="btn btn-secondary btn-sm">Buscar un municipio</Link>}
              />
            </div>
          </div>
        </main>
        <PlatformFooter />
      </div>
    );
  }
  const perfil = result.perfil;
  const tablas = buildDemografiaTables(perfil);
  const excluidas = demografiaExcluidas(perfil.densidad.valor !== null);

  return (
    <div className="flex min-h-screen flex-col">
      <SocideasHeader codigoINE={codigoINE} />
      <main id="contenido" className="flex-1">
        <div className="container-ima pb-16">
          <PageShell
            breadcrumbs={
              <Breadcrumbs
                items={[
                  { label: "IDEAS Sostenibilidad", href: "/" },
                  { label: "SOCideas", href: "/socideas" },
                  { label: perfil.municipio.nombre, href: `/socideas/${codigoINE}?categoria=demografia` },
                  { label: "Descargas de demografía" },
                ]}
              />
            }
            title={`Tablas de demografía de ${perfil.municipio.nombre}`}
            lede="Tablas generadas a partir de los indicadores disponibles en la ficha municipal, cada una con su fuente y su periodo de referencia. Descárguelas en CSV o en el libro XLSX combinado."
            meta={
              <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm text-[var(--text-secondary)]">
                <div>
                  <dt className="sr-only">Provincia y comunidad autónoma</dt>
                  <dd>
                    {perfil.municipio.provincia}, {perfil.municipio.comunidad_autonoma}
                  </dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="text-[var(--text-muted)]">Código INE</dt>
                  <dd className="tabular-nums">{codigoINE}</dd>
                </div>
              </dl>
            }
            actions={
              <>
                <Link href={`/socideas/${codigoINE}?categoria=demografia`} className="btn btn-secondary">
                  Volver a la ficha
                </Link>
                <Link href={`/socideas/${codigoINE}/descargas/economia`} className="btn btn-ghost">
                  Ver descargas de economía
                </Link>
              </>
            }
          />
          <div>
            <DescargasBloque municipio={perfil.municipio.nombre} codigoINE={codigoINE} bloque="Demografia" tablas={tablas} excluidas={excluidas} />
          </div>
        </div>
      </main>
      <PlatformFooter />
    </div>
  );
}
