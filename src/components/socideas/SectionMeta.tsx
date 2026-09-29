"use client";

// Fuentes y metadatos del atlas de secciones.
//
// DISPOSICIÓN: este bloque va DEBAJO de la leyenda, en el flujo normal del
// documento. Nunca en una columna lateral, nunca superpuesto al mapa, nunca
// como un desplegable flotante.
//
//  - Barra compacta SIEMPRE visible: tabla, operación, periodo, cobertura y ND.
//    Con el botón de información se despliega la ficha completa.
//  - Ficha completa en rejilla: 4 columnas en escritorio (fuente, geometría,
//    cobertura, cartografía), 2 en tableta, 1 en móvil.
//
// Todos los valores proceden de los metadatos del indicador SELECCIONADO y del
// atlas del municipio. No hay fuente genérica común: lo que no consta se dice
// «no consta», nunca se inventa. El sistema de referencia solo se muestra si
// viene en los metadatos.

import { useEffect, useId, useRef, useState } from "react";

export interface SectionMetaProps {
  // Fuente y estadística
  indicador: string;
  unidad: string;
  organismo: string;
  operacion: string;
  operacionEtiqueta: string;
  tabla: string;
  tablaEtiqueta: string;
  urlIneBase: string;
  universo: string | null;
  definicion: string | null;
  periodo: number | null;
  fechaEstadistica: string | null;
  // Geometría
  geometriaYear: number | null;
  geometriaColeccion: string | null;
  geometriaFuente: string | null;
  geometriaConsultada: string | null;
  geometriaCrs: string | null;
  // Cobertura
  nSecciones: number;
  nConDato: number;
  nSinDato: number;
  coberturaPct: number;
  // Cartografía base
  basemapProveedor: string;
  basemapAtribucion: string;
  basemapLicencia: string;
  basemapUrl: string;
  /** Aviso de desfase temporal entre geometría y dato, si lo declara la fuente. */
  desfase: string | null;
}

const fecha = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : "no consta");
const oNoConsta = (v: string | null | undefined) => (v && v.trim() ? v : "no consta");

const BTN =
  "inline-flex min-h-[32px] items-center justify-center gap-1.5 rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-2.5 text-xs font-semibold text-[var(--text-primary)] transition-colors " +
  "hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-sunken)] " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-focus)]";

const ENLACE =
  "font-semibold text-[var(--text-link)] underline underline-offset-2 hover:text-[var(--text-link-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-focus)]";

export default function SectionMeta(p: SectionMetaProps) {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement | null>(null);
  const idPanel = useId();

  // Clic exterior y Escape cierran la ficha.
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

  const completo = p.nSinDato === 0;

  return (
    <div ref={raiz} className="mt-3 min-w-0">
      {/* ── Barra compacta: siempre visible ─────────────────────────────── */}
      <div className="flex min-h-[40px] flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs">
        <span className="min-w-0 text-[var(--text-primary)]">
          <span className="font-semibold">Tabla {p.tabla}</span>
          <span className="hidden sm:inline"> · {p.operacion}</span>
        </span>
        <span className="h-4 w-px flex-none bg-[var(--border-default)]" aria-hidden="true" />
        <span className="tnum flex-none text-[var(--text-secondary)]">
          <span className="sr-only">Periodo estadístico: </span>
          {p.periodo ?? "—"}
        </span>
        <span className="h-4 w-px flex-none bg-[var(--border-default)]" aria-hidden="true" />
        <span className="tnum flex-none text-[var(--text-secondary)]">
          <span className="sr-only">Cobertura: </span>
          {p.nConDato}/{p.nSecciones} secciones
        </span>
        {p.nSinDato > 0 ? (
          <span
            className="tnum flex-none rounded-[6px] border border-[var(--status-danger-fg)] bg-[var(--status-danger-bg)] px-1.5 font-semibold text-[var(--status-danger-fg)]"
            title={`${p.nSinDato} secciones sin dato oficial (ND)`}
          >
            {p.nSinDato} ND
          </span>
        ) : null}
        {p.desfase ? (
          <span
            className="flex-none font-semibold text-[var(--status-danger-fg)]"
            title={p.desfase}
          >
            <span aria-hidden="true">⚠ </span>
            <span className="sr-only">{p.desfase}</span>
            <span aria-hidden="true">desfase</span>
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          aria-controls={idPanel}
          aria-label={abierto ? "Cerrar fuentes y metadatos" : "Ver fuentes y metadatos"}
          className={`${BTN} ml-auto min-h-[36px]`}
        >
          <span aria-hidden="true">{abierto ? "▴" : "ⓘ"}</span>
          {abierto ? "Cerrar" : "Fuentes"}
        </button>
        {completo ? <span className="sr-only">Cobertura completa</span> : null}
      </div>

      {/* ── Ficha completa: en el flujo, debajo de la barra ─────────────── */}
      {abierto ? (
        <div
          id={idPanel}
          role="region"
          aria-label="Metadatos y fuentes"
          className="mt-2 rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-surface)] text-[12px] leading-snug"
        >
          {/* Rejilla adaptable al ANCHO DEL BLOQUE, no al de la ventana: el bloque
              vive en la columna del mapa, así que `lg:grid-cols-4` estrecharía
              cada columna hasta hacerla ilegible. Con `auto-fit` aparecen 4
              columnas cuando hay sitio, 2 en tableta y 1 en móvil, sin meta
              breakpoints que no miden lo que miden. */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-x-6 gap-y-4 p-3">
            <Bloque titulo="Fuente y estadística">
              <Linea k="Indicador">{p.indicador}</Linea>
              <Linea k="Unidad">{oNoConsta(p.unidad)}</Linea>
              <Linea k="Organismo">{oNoConsta(p.organismo)}</Linea>
              <Linea k="Operación">
                {oNoConsta(p.operacionEtiqueta)}
                {p.operacionEtiqueta !== p.operacion ? ` (${oNoConsta(p.operacion)})` : ""}
              </Linea>
              <Linea k="Tabla">
                {oNoConsta(p.tabla)}
                {p.tablaEtiqueta ? ` — ${p.tablaEtiqueta}` : ""}
              </Linea>
              <Linea k="Definición">{oNoConsta(p.definicion)}</Linea>
              {p.universo ? <Linea k="Universo">{p.universo}</Linea> : null}
              <Linea k="Periodo estadístico">{p.periodo ?? "no consta"}</Linea>
              <Linea k="Descargada el">{fecha(p.fechaEstadistica)}</Linea>
              <Linea k="Enlace">
                {p.urlIneBase ? (
                  <a href={p.urlIneBase} target="_blank" rel="noopener noreferrer" className={ENLACE}>
                    Ver fuente en INEbase ↗
                  </a>
                ) : (
                  "no consta"
                )}
              </Linea>
            </Bloque>

            <Bloque titulo="Geometría">
              <Linea k="Colección">{oNoConsta(p.geometriaColeccion)}</Linea>
              <Linea k="Año del seccionado">{p.geometriaYear ?? "no consta"}</Linea>
              <Linea k="Organismo">{oNoConsta(p.geometriaFuente)}</Linea>
              <Linea k="Consultada el">{fecha(p.geometriaConsultada)}</Linea>
              {/* El sistema de referencia solo aparece si consta en los
                  metadatos: no se inventa un EPSG por Defaults. */}
              {p.geometriaCrs ? <Linea k="Sistema de referencia">{p.geometriaCrs}</Linea> : null}
            </Bloque>

            <Bloque titulo="Cobertura">
              <Linea k="Secciones totales">{p.nSecciones}</Linea>
              <Linea k="Con dato">{p.nConDato}</Linea>
              <Linea k="Sin dato (ND)">{p.nSinDato}</Linea>
              <Linea k="Cobertura">
                <span className="tnum">
                  {p.coberturaPct.toLocaleString("es-ES", { maximumFractionDigits: 1 })} %
                </span>
              </Linea>
              <Linea k="Periodo de los datos">{p.periodo ?? "no consta"}</Linea>
              <Linea k="Año de la geometría">{p.geometriaYear ?? "no consta"}</Linea>
              {p.desfase ? (
                <p className="mt-1 font-semibold text-[var(--status-danger-fg)]">{p.desfase}</p>
              ) : (
                <p className="mt-1 text-[var(--text-secondary)]">
                  Geometría y dato son contemporáneos.
                </p>
              )}
            </Bloque>

            <Bloque titulo="Cartografía base">
              <Linea k="Proveedor">{oNoConsta(p.basemapProveedor)}</Linea>
              <Linea k="Atribución">{p.basemapAtribucion}</Linea>
              <Linea k="Licencia">{oNoConsta(p.basemapLicencia)}</Linea>
              <Linea k="Copyright">
                <a href={p.basemapUrl} target="_blank" rel="noopener noreferrer" className={ENLACE}>
                  Ver copyright y atribución ↗
                </a>
              </Linea>
            </Bloque>
          </div>

          <div className="flex justify-end border-t border-[var(--border-subtle)] p-2">
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className={`${BTN} min-h-[36px]`}
            >
              Cerrar fuentes y metadatos
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0">
      <h3 className="mb-1.5 border-b border-[var(--border-subtle)] pb-1 text-[11px] font-bold uppercase tracking-wide text-[var(--text-primary)]">
        {titulo}
      </h3>
      {children}
    </section>
  );
}

function Linea({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <p className="mb-1 break-words last:mb-0">
      <span className="text-[var(--text-muted)]">{k}: </span>
      <span className="text-[var(--text-primary)]">{children}</span>
    </p>
  );
}
