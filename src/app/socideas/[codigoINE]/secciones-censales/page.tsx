import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServer } from "@/lib/supabase-server";
import PlatformHeader from "@/components/platform/PlatformHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";
import SeccionesMap from "@/components/socideas/SeccionesMap";
import SectionEyebrow from "@/components/ui/SectionEyebrow";

export const dynamic = "force-dynamic";

async function getMunicipio(codigoINE: string) {
  try {
    const supabase = createSupabaseServer();
    const { data } = await supabase
      .from("municipios")
      .select(
        "codigo_ine, nombre, provincia:provincias(nombre, comunidad_autonoma:comunidades_autonomas(nombre))",
      )
      .eq("codigo_ine", codigoINE)
      .single();
    return data as unknown as {
      codigo_ine: string;
      nombre: string;
      provincia: { nombre: string; comunidad_autonoma: { nombre: string } };
    } | null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ codigoINE: string }>;
}): Promise<Metadata> {
  const { codigoINE } = await params;
  const muni = await getMunicipio(codigoINE);
  const nombre = muni?.nombre ?? codigoINE;
  return {
    title: `Secciones censales de ${nombre} | SOCideas`,
    description: `Secciones censales de ${nombre} (INE ${codigoINE}): geometría oficial y disponibilidad de indicadores.`,
  };
}

export default async function SeccionesPage({
  params,
}: {
  params: Promise<{ codigoINE: string }>;
}) {
  const { codigoINE } = await params;
  const muni = await getMunicipio(codigoINE);

  if (!muni) {
    return (
      <div className="flex min-h-screen flex-col">
        <PlatformHeader />
        <main className="flex flex-1 items-center justify-center px-4">
          <div className="ideas-status max-w-md text-center" data-state="error" role="alert">
            <p className="ideas-status__title">No se encontró el municipio con código INE {codigoINE}.</p>
            <Link href="/socideas" className="mt-4 inline-block text-sm font-semibold text-[var(--color-secondary)]">
              Volver al buscador
            </Link>
          </div>
        </main>
        <PlatformFooter />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <PlatformHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          <section className="mb-8 border-b border-[var(--color-border-subtle)] pb-8">
            <nav aria-label="Migas de pan" className="mb-3 text-xs text-[var(--color-text-muted)]">
              <Link href="/socideas" className="hover:text-[var(--color-secondary)]">SOCideas</Link>
              <span className="mx-1.5">/</span>
              <Link href={`/socideas/${muni.codigo_ine}`} className="hover:text-[var(--color-secondary)]">{muni.nombre}</Link>
              <span className="mx-1.5">/</span>
              <span className="text-[var(--color-text-secondary)]">Secciones censales</span>
            </nav>
            <SectionEyebrow>
              SOCideas · {muni.nombre} · Geometría oficial
            </SectionEyebrow>
            <h1 className="editorial-display mt-3 text-3xl text-[var(--color-text-primary)] sm:text-4xl">
              Secciones censales
            </h1>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              {muni.nombre} · {muni.provincia.nombre} · {muni.provincia.comunidad_autonoma.nombre} · Código INE {muni.codigo_ine}
            </p>
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-[var(--color-text-muted)]">
              Las secciones censales son divisiones estadísticas internas del municipio. Los datos
              específicos por sección solo se incorporan cuando existe una fuente oficial que los publica
              con ese nivel territorial.
            </p>
          </section>

          <SeccionesMap codigoINE={muni.codigo_ine} nombre={muni.nombre} />
        </div>
      </main>
      <PlatformFooter />
    </div>
  );
}
