import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServer } from "@/lib/supabase-server";
import { getPerfilEconomico } from "@/lib/socideas-economia";
import { buildEconomiaTables } from "@/lib/socideas-export";
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
    title: `Tablas de Economía ${codigoINE} | SOCideas`,
    description: `Tablas de economía del municipio ${codigoINE} con fuente y periodo: descarga CSV e informe imprimible.`,
  };
}

export default async function DescargasEconomia({
  params,
}: {
  params: Promise<{ codigoINE: string }>;
}) {
  const { codigoINE } = await params;
  if (!/^\d{5}$/.test(codigoINE)) {
    return (
      <div className="flex min-h-screen flex-col">
        <SocideasHeader />
        <main className="flex flex-1 items-center justify-center px-4"><EmptyState title="Código INE inválido" description="Se esperan 5 dígitos." /></main>
        <PlatformFooter />
      </div>
    );
  }
  const supabase = createSupabaseServer();
  const result = await getPerfilEconomico(supabase, codigoINE);
  if (result.status === "notFound" || result.status === "badRequest") {
    return (
      <div className="flex min-h-screen flex-col">
        <SocideasHeader />
        <main className="flex flex-1 items-center justify-center px-4">
          <EmptyState title={`No se encontró el municipio ${codigoINE}.`} description="Compruebe el código o vuelva al buscador." action={<Link href="/socideas" className="text-sm font-semibold text-[var(--color-secondary)]">Volver al buscador</Link>} />
        </main>
        <PlatformFooter />
      </div>
    );
  }
  const perfil = result.perfil;
  const tablas = buildEconomiaTables(perfil);
  const excluidas = [
    { titulo: "Paro registrado (SEPE)", motivo: "Pendiente de conector en batch 1 (dry-run)." },
    { titulo: "Afiliación a la Seguridad Social (TGSS)", motivo: "Pendiente de conector en batch 1 (dry-run)." },
    { titulo: "Presupuestos, liquidaciones y ayudas", motivo: "Sin fuente nacional homogénea verificada." },
    { titulo: "Renta AEAT por declaración", motivo: tablas.some((t) => t.id === "renta") ? "Incluida si el ejercicio fue aportado; en otro caso pendiente." : "Pendiente de aportar el fichero base del ejercicio." },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <SocideasHeader codigoINE={codigoINE} />
      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <nav aria-label="Migas de pan" className="mb-3 text-xs text-[var(--color-text-muted)]">
            <Link href="/socideas" className="hover:text-[var(--color-secondary)]">SOCideas</Link>
            <span className="mx-1.5">/</span>
            <Link href={`/socideas/${codigoINE}?categoria=economia`} className="hover:text-[var(--color-secondary)]">{perfil.municipio.nombre}</Link>
            <span className="mx-1.5">/</span>
            <span className="text-[var(--color-text-secondary)]">Descargas de Economía</span>
          </nav>
          <SectionEyebrow>Ficha municipal · {perfil.municipio.provincia} · {perfil.municipio.comunidad_autonoma}</SectionEyebrow>
          <PageShell
            eyebrow={`Código INE ${codigoINE}`}
            title={`Tablas de Economía — ${perfil.municipio.nombre}`}
            lede="Tablas generadas a partir de los indicadores disponibles en la ficha municipal, con fuente y periodo de referencia."
          />
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href={`/socideas/${codigoINE}?categoria=economia`}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[var(--color-text-secondary)] bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-xl hover:text-[var(--color-text-primary)]"
            >
              ← Volver a la ficha
            </Link>
            <Link
              href={`/socideas/${codigoINE}/descargas/demografia`}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[var(--color-secondary)]"
            >
              Descargas de Demografía →
            </Link>
          </div>
          <div className="mt-8">
            <DescargasBloque municipio={perfil.municipio.nombre} codigoINE={codigoINE} bloque="Economia" tablas={tablas} excluidas={excluidas} />
          </div>
        </div>
      </main>
      <PlatformFooter />
    </div>
  );
}
