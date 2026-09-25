import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServer } from "@/lib/supabase-server";
import { getPerfilDemografico } from "@/lib/socideas-perfil";
import { buildDemografiaTables, demografiaExcluidas } from "@/lib/socideas-export";
import SocideasHeader from "@/components/platform/SocideasHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";
import PageShell from "@/components/ui/PageShell";
import SectionEyebrow from "@/components/ui/SectionEyebrow";
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
        <main id="contenido" className="flex flex-1 items-center justify-center px-4"><EmptyState title="Código INE inválido" description="Se esperan 5 dígitos." /></main>
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
        <main id="contenido" className="flex flex-1 items-center justify-center px-4">
          <EmptyState title={`No se encontró el municipio ${codigoINE}.`} description="Compruebe el código o vuelva al buscador." action={<Link href="/socideas" className="text-sm font-semibold text-[var(--color-secondary)]">Volver al buscador</Link>} />
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
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <nav aria-label="Migas de pan" className="mb-3 text-xs text-[var(--color-text-muted)]">
            <Link href="/socideas" className="hover:text-[var(--color-secondary)]">SOCideas</Link>
            <span className="mx-1.5">/</span>
            <Link href={`/socideas/${codigoINE}`} className="hover:text-[var(--color-secondary)]">{perfil.municipio.nombre}</Link>
            <span className="mx-1.5">/</span>
            <span className="text-[var(--color-text-secondary)]">Descargas de Demografía</span>
          </nav>
          <SectionEyebrow>Ficha municipal · {perfil.municipio.provincia} · {perfil.municipio.comunidad_autonoma}</SectionEyebrow>
          <PageShell
            eyebrow={`Código INE ${codigoINE}`}
            title={`Tablas de Demografía — ${perfil.municipio.nombre}`}
            lede="Tablas generadas a partir de los indicadores disponibles en la ficha municipal, con fuente y periodo de referencia."
          />
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href={`/socideas/${codigoINE}?categoria=demografia`}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded-xl hover:text-[var(--color-text-primary)]"
              style={{ backgroundColor: 'var(--color-input-bg)' }}
            >
              â† Volver a la ficha
            </Link>
            <Link
              href={`/socideas/${codigoINE}/descargas/economia`}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[var(--color-secondary)]"
            >
              Descargas de Economía â†’
            </Link>
          </div>
          <div className="mt-8">
            <DescargasBloque municipio={perfil.municipio.nombre} codigoINE={codigoINE} bloque="Demografia" tablas={tablas} excluidas={excluidas} />
          </div>
        </div>
      </main>
      <PlatformFooter />
    </div>
  );
}
