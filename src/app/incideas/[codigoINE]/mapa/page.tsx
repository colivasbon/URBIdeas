"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import Link from "next/link";
import IncideasHeader from "@/components/platform/IncideasHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";
import Breadcrumbs from "@/components/ui/Breadcrumbs";

const MapaControlCalidad = dynamic(() => import("@/components/incideas/MapaControlCalidad"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[520px] items-center justify-center rounded-[6px] border border-[var(--border-subtle)]">
      <span className="text-sm text-[var(--text-muted)]">Cargando mapa…</span>
    </div>
  ),
});

export default function IncideasMapaPage() {
  const params = useParams<{ codigoINE: string }>();
  const codigoINE = params?.codigoINE ?? "";

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
              { label: "Mapa" },
            ]}
            className="mb-6"
          />
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="type-label text-[var(--moss-ink)]">Control de calidad</p>
              <h1 className="type-h1 mt-2 text-[var(--text-primary)]">Mapa de revisión</h1>
              <p className="mt-3 max-w-[60ch] text-[var(--text-secondary)]">
                Límite municipal, registros por categoría y estado. Sirve para detectar puntos fuera
                del término, coordenadas intercambiadas, acumulaciones sospechosas y posibles
                duplicados.
              </p>
            </div>
            <Link href={`/incideas/${codigoINE}/revision`} className="btn btn-secondary">
              Ir a la bandeja de revisión
            </Link>
          </div>
          <MapaControlCalidad codigoINE={codigoINE} />
        </section>
      </main>
      <PlatformFooter />
    </div>
  );
}
