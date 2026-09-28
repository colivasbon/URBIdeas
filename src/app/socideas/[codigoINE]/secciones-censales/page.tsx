import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServer } from "@/lib/supabase-server";
import SocideasHeader from "@/components/platform/SocideasHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";
import SeccionesAtlas from "@/components/socideas/SeccionesAtlas";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import PageShell from "@/components/ui/PageShell";

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
        <SocideasHeader codigoINE={codigoINE} />
        <main id="contenido" className="flex flex-1 items-center justify-center px-4">
          <div className="ideas-status max-w-md text-center" data-state="error" role="alert">
            <p className="ideas-status__title">No se encontró el municipio con código INE {codigoINE}.</p>
            <Link href="/" className="link mt-4 inline-block text-sm font-semibold">
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
      <SocideasHeader codigoINE={muni.codigo_ine} />
      <main id="contenido" className="flex-1">
        <div className="container-ima pb-16">
          <PageShell
            breadcrumbs={
              <Breadcrumbs
                items={[
                  { label: "SOCideas", href: "/" },
                  { label: muni.nombre, href: `/socideas/${muni.codigo_ine}` },
                  { label: "Secciones censales" },
                ]}
              />
            }
            title="Secciones censales"
            lede={`Indicadores oficiales por sección censal de ${muni.nombre}, sobre la geometría del INE.`}
            meta={
              <dl className="type-body-sm flex flex-wrap gap-x-6 gap-y-1 text-[var(--text-muted)]">
                <div>
                  <dt className="sr-only">Territorio</dt>
                  <dd className="text-[var(--text-secondary)]">
                    Provincia de {muni.provincia.nombre}, {muni.provincia.comunidad_autonoma.nombre}
                  </dd>
                </div>
                <div className="flex gap-1.5">
                  <dt>Código INE</dt>
                  <dd className="tnum text-[var(--text-secondary)]">{muni.codigo_ine}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt>Fuente</dt>
                  <dd className="text-[var(--text-secondary)]">
                    INE, seccionado oficial y estadística difundida por sección
                  </dd>
                </div>
              </dl>
            }
          />

          <SeccionesAtlas codigoINE={muni.codigo_ine} nombre={muni.nombre} />
        </div>
      </main>
      <PlatformFooter />
    </div>
  );
}
