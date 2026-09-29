"use client";

// Metadatos del atlas de secciones: barra de estado de una línea (40 px) y
// panel expandible con la ficha completa de fuentes. No calcula nada: recibe
// los metadatos que el atlas ya tiene.

import { useEffect, useId, useRef, useState } from "react";

export interface SectionMetaProps {
  operacion: string;
  operacionEtiqueta: string;
  tabla: string;
  tablaEtiqueta: string;
  urlIneBase: string;
  geometriaYear: number | null;
  geometriaColeccion: string | null;
  geometriaFuente: string | null;
  geometriaConsultada: string | null;
  estadisticaConsultada: string | null;
  periodo: number | null;
  nSecciones: number;
  nConDato: number;
  nSinDato: number;
}

const fecha = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");

export default function SectionMeta(p: SectionMetaProps) {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement | null>(null);
  const idPanel = useId();

  // Clic exterior y Escape cierran el panel.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  const desfase = p.geometriaYear !== null && p.periodo !== null && p.geometriaYear !== p.periodo;
  const completo = p.nSinDato === 0;

  return (
    <div ref={raiz} className="relative mt-3 text-[var(--carbon-600,#3C403E)]">
      <div className="flex h-10 items-center gap-3 overflow-hidden whitespace-nowrap rounded-[6px] border border-[var(--border-default)] bg-[var(--hueso)] px-3 text-xs">
        <span className="min-w-0 truncate">
          <span className="font-semibold">Tabla {p.tabla}</span>
          <span className="hidden sm:inline"> · {p.operacion}</span>
        </span>
        <span className="h-4 w-px flex-none bg-[var(--border-default)]" aria-hidden="true" />
        <span className="tnum flex-none">{p.periodo ?? "—"}</span>
        <span className="h-4 w-px flex-none bg-[var(--border-default)]" aria-hidden="true" />
        <span className="tnum flex-none">
          {p.nConDato}/{p.nSecciones} secciones
        </span>
        {p.nSinDato > 0 && (
          <span
            className="tnum flex-none rounded-[6px] border border-[var(--rupestre,#643335)] px-1.5 text-[var(--rupestre,#643335)]"
            title={`${p.nSinDato} secciones sin dato (ND)`}
          >
            <span aria-hidden="true">⚠ </span>
            {p.nSinDato} ND
          </span>
        )}
        {desfase && (
          <span
            className="flex-none text-[var(--rupestre,#643335)]"
            title={`Desfase temporal: geometría ${p.geometriaYear}, dato ${p.periodo}`}
          >
            <span aria-hidden="true">⚠</span>
            <span className="sr-only">Desfase temporal entre geometría y dato</span>
          </span>
        )}
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          aria-controls={idPanel}
          aria-label="Fuentes y metadatos"
          className="ml-auto flex h-8 min-w-[44px] flex-none items-center justify-center rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2 text-xs font-semibold hover:border-[var(--border-strong)]"
        >
          <span aria-hidden="true">{abierto ? "Cerrar" : "ⓘ Fuentes"}</span>
        </button>
        {completo && <span className="sr-only">Cobertura completa</span>}
      </div>

      {abierto && (
        <div
          id={idPanel}
          role="region"
          aria-label="Metadatos y fuentes"
          className="absolute inset-x-0 top-full z-[700] mt-1 max-h-[70vh] overflow-y-auto rounded-[6px] border border-[var(--border-default)] bg-[var(--hueso)] text-[12px] leading-snug"
        >
          <Bloque titulo="Fuente y estadística">
            <Linea k="Operación">{p.operacionEtiqueta}</Linea>
            <Linea k="Tabla">
              {p.tabla}
              {p.tablaEtiqueta ? ` — ${p.tablaEtiqueta}` : ""}
            </Linea>
            <Linea k="Publicada por">Instituto Nacional de Estadística</Linea>
            <Linea k="Enlace">
              <a
                href={p.urlIneBase}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold underline underline-offset-2"
              >
                Ver en INEbase ↗
              </a>
            </Linea>
          </Bloque>
          <Bloque titulo="Geometría">
            <Linea k="Seccionado">
              {p.geometriaColeccion ?? (p.geometriaYear ? `Secciones_${p.geometriaYear}` : "—")} · Fuente:{" "}
              {p.geometriaFuente ?? "INE"}
            </Linea>
            <Linea k="Consultado">{fecha(p.geometriaConsultada)}</Linea>
          </Bloque>
          <Bloque titulo="Cobertura">
            <Linea k="Secciones con dato">
              {p.nConDato} / {p.nSecciones} · Sin dato (ND): {p.nSinDato}
            </Linea>
            <Linea k="Período estadístico">
              {p.periodo ?? "—"} · Geometría: {p.geometriaYear ?? "—"} · Descargada el {fecha(p.estadisticaConsultada)}
            </Linea>
            {desfase && (
              <p className="mt-1 font-semibold text-[var(--rupestre,#643335)]">
                Desfase temporal: geometría y dato no son contemporáneos.
              </p>
            )}
          </Bloque>
          <Bloque titulo="Cartografía base" ultimo>
            <p>© OpenStreetMap contributors, ODbL 1.0</p>
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              openstreetmap.org/copyright
            </a>
          </Bloque>
          <div className="border-t border-[var(--border-subtle)] p-2 text-right">
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="min-h-[36px] rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 text-xs font-medium hover:border-[var(--border-strong)]"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Bloque({ titulo, children, ultimo = false }: { titulo: string; children: React.ReactNode; ultimo?: boolean }) {
  return (
    <section className={`px-3 py-2 ${ultimo ? "" : "border-b border-[var(--border-subtle)]"}`}>
      <h3 className="mb-1 text-[11px] font-bold">{titulo}</h3>
      {children}
    </section>
  );
}

function Linea({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <p className="mb-0.5 break-words">
      <span className="text-[var(--text-muted)]">{k}: </span>
      {children}
    </p>
  );
}
