"use client";

import Link from "next/link";
import type { CategoriaFicha } from "@/lib/socideas";

const TABS: { clave: CategoriaFicha; etiqueta: string; descripcion: string }[] = [
  { clave: "demografia", etiqueta: "Demografía", descripcion: "Población y estructura por edad y sexo" },
  { clave: "economia", etiqueta: "Economía", descripcion: "Renta, desigualdad, empresas y sector agrario" },
];

export default function CategoryTabs({
  codigoINE,
  activa,
  searchParams,
}: {
  codigoINE: string;
  activa: CategoriaFicha;
  searchParams: Record<string, string>;
}) {
  const qs = new URLSearchParams(searchParams);
  const hrefFor = (cat: CategoriaFicha): string => {
    const p = new URLSearchParams(qs);
    if (cat === "demografia") p.delete("categoria");
    else p.set("categoria", cat);
    const s = p.toString();
    return s ? `/socideas/${codigoINE}?${s}` : `/socideas/${codigoINE}`;
  };
  return (
    <nav aria-label="Categorías de la ficha" className="ideas-tabs premium-reveal" role="tablist">
      {TABS.map((t) => {
        const selected = t.clave === activa;
        return (
          <Link
            key={t.clave}
            href={hrefFor(t.clave)}
            role="tab"
            aria-selected={selected}
            title={t.descripcion}
            className="ideas-tab focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]"
            data-active={selected}
          >
            {t.etiqueta}
          </Link>
        );
      })}
      <Link
        href={`/socideas/${codigoINE}/secciones-censales`}
        title="Geometría de secciones censales del municipio"
        className="ideas-tab ideas-tab--link focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]"
      >
        Secciones censales
      </Link>
    </nav>
  );
}
