// INCideas Fase 3 — Panel de cobertura: matriz por bloque y estado, con
// última actualización visible y actualización manual por municipio y bloque.

import Link from "next/link";
import IncideasHeader from "@/components/platform/IncideasHeader";
import PlatformFooter from "@/components/platform/PlatformFooter";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import Badge from "@/components/ui/Badge";
import { getResumenCobertura, getUltimaSnapshot } from "@/lib/incideas/fase3/lectura";

const FASE_TEXTO: Record<number, string> = { 1: "Fase 1 · nacional", 2: "Fase 2 · parcial", 3: "Fase 3 · mixta", 4: "Fase 4 · aportación" };

export default async function IncideasCoberturaPage() {
  const resumen = await getResumenCobertura();
  const snapshot = await getUltimaSnapshot();
  return (
    <div className="flex min-h-screen flex-col">
      <IncideasHeader codigoINE="" />
      <main id="contenido" className="flex-1">
        <section className="container-ima pt-6 pb-12 sm:pt-10 sm:pb-16">
          <Breadcrumbs
            items={[
              { label: "IDEAS Sostenibilidad", href: "/" },
              { label: "INCideas", href: "/incideas" },
              { label: "Cobertura" },
            ]}
            className="mb-6"
          />
          <div className="flex flex-wrap items-center gap-3">
            <p className="type-label text-[var(--moss-ink)]">INCideas · Fase 3</p>
            {snapshot && <Badge variant="muted">{snapshot.id.slice(0, 28)} · {snapshot.estado}</Badge>}
          </div>
          <h1 className="type-h1 mt-4 text-[var(--text-primary)]">Cobertura por bloque</h1>
          <p className="mt-2 max-w-2xl text-[var(--text-secondary)]">
            Municipios de muestra con cargas verificadas. La actualización manual se ejecuta por municipio y bloque;
            los bloques pesados se cargan por lotes, fuera de la web.
          </p>
          {resumen.length === 0 ? (
            <p className="mt-8 text-[var(--text-secondary)]">Sin cargas registradas.</p>
          ) : (
            <div className="mt-8 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] text-[var(--text-muted)]">
                    <th className="py-2 pr-4">Bloque</th>
                    <th className="py-2 pr-4">Vía</th>
                    <th className="py-2 pr-4">Municipios</th>
                    <th className="py-2 pr-4">Cargados</th>
                    <th className="py-2 pr-4">Parciales</th>
                    <th className="py-2 pr-4">Sin cobertura</th>
                  </tr>
                </thead>
                <tbody>
                  {resumen.map((r) => (
                    <tr key={r.bloque} className="border-b border-[var(--border-subtle)]">
                      <td className="py-2 pr-4 font-medium text-[var(--text-primary)]">{r.bloque_nombre}</td>
                      <td className="py-2 pr-4 text-[var(--text-secondary)]">{FASE_TEXTO[r.fase] ?? `Fase ${r.fase}`}</td>
                      <td className="tnum py-2 pr-4">{r.municipios}</td>
                      <td className="tnum py-2 pr-4">{r.cargado}</td>
                      <td className="tnum py-2 pr-4">{r.parcial}</td>
                      <td className="tnum py-2 pr-4">{r.sin}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-6">
            <Link href="/incideas" className="link text-sm">Volver a INCideas</Link>
          </p>
        </section>
      </main>
      <PlatformFooter />
    </div>
  );
}
