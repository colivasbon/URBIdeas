"use client";

// Tabla accesible del atlas de secciones censales.
//
// Es la vía PRINCIPAL de lectura, no una alternativa: aquí se puede consultar,
// ordenar y filtrar todo el dato sin tocar el mapa. Requisitos cubiertos:
//  - `<caption>` que nombra indicador, municipio, año y unidad.
//  - `<th scope="col">` con `<button>` y `aria-sort` (ascending / descending / none).
//  - `<th scope="row">` con la clave de sección como cabecera de fila.
//  - Filtro por clave de sección, con `aria-describedby` y contador de resultados.
//  - Selección con `aria-pressed` y `aria-current`; funciona solo con teclado.
//  - La fila con dato se distingue de la que no lo tiene por TEXTO («ND») y
//    por una columna de estado, no solo por el color de la clase.
//
// El resaltado por hover/foco es unextra: la fila tiene un botón real, así que
// ninguna función depende de pasar el ratón por encima.

import { useMemo, useState } from "react";
import { COLOR_CONTORNO_SIN_DATO, COLOR_SIN_DATO, etiquetaEstado } from "@/lib/socideas-secciones";
import type { ClaveOrdenAtlas, EntradaLeyendaAtlas, FilaAtlas } from "./SeccionesAtlasMap";

export interface SeccionesAtlasTableProps {
  filas: ReadonlyArray<FilaAtlas>;
  entradasLeyenda: ReadonlyArray<EntradaLeyendaAtlas>;
  indicadorEtiqueta: string;
  municipioNombre: string;
  anio: number | null;
  unidad: string;
  coberturaPct: number;
  referenciaMunicipal: number | null;
  seleccion: string | null;
  hovered: string | null;
  onSeleccionar: (key: string) => void;
  onHover: (key: string | null) => void;
  onAcercar: (key: string) => void;
}

const TH =
  "px-3 py-2 text-left align-bottom text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--color-text-muted)]";

const ORDEN_ETIQUETA: Record<ClaveOrdenAtlas, string> = {
  seccion: "Clave de sección",
  valor: "Valor",
  estado: "Estado del dato",
  clase: "Clase de color",
};

export default function SeccionesAtlasTable({
  filas,
  entradasLeyenda,
  indicadorEtiqueta,
  municipioNombre,
  anio,
  unidad,
  coberturaPct,
  referenciaMunicipal,
  seleccion,
  hovered,
  onSeleccionar,
  onHover,
  onAcercar,
}: SeccionesAtlasTableProps) {
  const [orden, setOrden] = useState<{ clave: ClaveOrdenAtlas; sentido: "asc" | "desc" }>({ clave: "seccion", sentido: "asc" });
  const [filtro, setFiltro] = useState("");

  const filtradas = useMemo(() => {
    const q = filtro.trim();
    const base = q ? filas.filter((f) => f.key.includes(q)) : [...filas];
    const dir = orden.sentido === "asc" ? 1 : -1;
    return base.sort((a, b) => {
      switch (orden.clave) {
        case "valor": {
          // Los ND van SIEMPRE al final, en los dos sentidos: no son el mínimo.
          if (a.value === null && b.value === null) return a.key.localeCompare(b.key);
          if (a.value === null) return 1;
          if (b.value === null) return -1;
          return (a.value - b.value) * dir || a.key.localeCompare(b.key);
        }
        case "estado":
          return (a.status.localeCompare(b.status) || a.key.localeCompare(b.key)) * dir;
        case "clase":
          return ((a.clase - b.clase) || a.key.localeCompare(b.key)) * dir;
        case "seccion":
        default:
          return a.key.localeCompare(b.key) * dir;
      }
    });
  }, [filas, filtro, orden]);

  // Las clases de la leyenda están en el mismo orden que el índice de clase, y
  // la última entrada es siempre la de sin dato. Se indexa por POSICIÓN y no
  // por color: en la paleta divergente con 7 clases algunos tonos se repiten.
  const etiquetasClase = useMemo(() => entradasLeyenda.filter((e) => !e.esSinDato).map((e) => e.etiqueta), [entradasLeyenda]);

  const alternar = (clave: ClaveOrdenAtlas) => {    setOrden((o) =>
      o.clave === clave ? { clave, sentido: o.sentido === "asc" ? "desc" : "asc" } : { clave, sentido: clave === "seccion" ? "asc" : "asc" },
    );
  };

  const ariaSort = (clave: ClaveOrdenAtlas): "ascending" | "descending" | "none" =>
    orden.clave === clave ? (orden.sentido === "asc" ? "ascending" : "descending") : "none";

  const rango = referenciaMunicipal !== null && anio !== null;

  return (
    <section aria-label="Tabla de secciones censales" className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Tabla de secciones</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
            {filtradas.length} de {filas.length} secciones · cobertura {coberturaPct.toLocaleString("es-ES", { maximumFractionDigits: 1 })} %
            {rango ? " · comparación con la referencia municipal de la misma operación y periodo" : ""}
          </p>
        </div>
        <div className="sm:w-64">
          <label htmlFor="atlas-filtro-seccion" className="mb-1 block text-xs font-semibold text-[var(--color-text-muted)]">
            Filtrar por clave de sección
          </label>
          <input
            id="atlas-filtro-seccion"
            type="search"
            inputMode="numeric"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Por ejemplo 28079"
            aria-describedby="atlas-filtro-ayuda"
            className="min-h-[44px] w-full rounded-[6px] border border-[var(--color-border)] bg-[var(--color-input-bg)] px-3 py-2 font-mono text-sm tabular-nums text-[var(--color-text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss-ink)]"
          />
          <p id="atlas-filtro-ayuda" className="mt-1 text-[11px] text-[var(--color-text-muted)]">
            La clave de sección son 10 dígitos: provincia, municipio, distrito y sección.
          </p>
        </div>
      </div>

      {/* Región de desplazamiento horizontal de la tabla.
          `contain-paint` + `max-w-[100vw]` son imprescindibles: con un
          `<thead class="sticky">` dentro de un contenedor `overflow-x-auto`, el
          encabezado (y con él la tabla) se escapa del recorte y ensancha el
          documento a 739 px en un viewport de 390. Sin `contain-paint` la caja
          declara scrollWidth 790 pero no recorta, y la página entera desborda.
          `tabIndex={0}` + `role="region"` + nombre accesible hacen que el
          contenedor sea alcanzable y desplazable con el teclado. */}
      <div
        className="max-h-[34rem] w-full min-w-0 max-w-[100vw] overflow-x-auto overflow-y-auto overscroll-x-contain rounded-[6px] border border-[var(--color-border-subtle)] [contain:paint]"
        tabIndex={0}
        role="region"
        aria-label={`Tabla de secciones de ${municipioNombre}, desplazable horizontalmente`}
      >
        <table className="socideas-table w-full text-left text-xs">
          <caption className="max-w-full break-words px-3 py-2 text-left text-[11px] leading-relaxed text-[var(--color-text-muted)]">
            {indicadorEtiqueta} en {municipioNombre}
            {anio !== null ? `, ${anio}` : ""} por sección censal
            {unidad ? `, en ${unidad}` : ""}. Una fila por sección publicada. Las secciones sin dato
            aparecen como «ND»: eso no es un cero. Ordene por cualquier columna con el botón de su
            cabecera.
          </caption>
          <thead className="sticky top-0 z-10 bg-[var(--color-card-bg)]">
            <tr>
              {(["seccion", "valor", "estado", "clase"] as ClaveOrdenAtlas[]).map((clave) => (
                <th key={clave} scope="col" aria-sort={ariaSort(clave)} className={`${TH} border-b border-[var(--color-border)]`}>
                  <button
                    type="button"
                    onClick={() => alternar(clave)}
                    className="flex min-h-[44px] min-w-[44px] w-full flex-wrap items-center gap-x-1 rounded-[6px] text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss-ink)]"
                  >
                    <span className="break-words">{ORDEN_ETIQUETA[clave]}</span>
                    <span className="text-[10px] font-semibold uppercase">
                      {orden.clave === clave ? (orden.sentido === "asc" ? "Asc" : "Desc") : ""}
                    </span>
                  </button>
                </th>
              ))}
              {rango && (
                <th scope="col" className={`${TH} border-b border-[var(--color-border)]`}>
                  Frente al municipio
                </th>
              )}
              <th scope="col" className={`${TH} border-b border-[var(--color-border)]`}>
                <span className="sr-only">Acciones sobre la sección</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map((f) => {
              const activa = f.key === seleccion;
              const resaltada = f.key === hovered;
              const colorClase = f.esSinDato ? COLOR_SIN_DATO : f.color;
              return (
                <tr
                  key={f.key}
                  data-estado={f.esSinDato ? "sin-dato" : "observado"}
                  aria-current={activa ? "true" : undefined}
                  onMouseEnter={() => onHover(f.key)}
                  onMouseLeave={() => onHover(null)}
                  onFocus={() => onHover(f.key)}
                  onBlur={() => onHover(null)}
                  className={`border-b border-[var(--color-border-subtle)] transition-colors ${
                    activa ? "bg-[var(--color-input-bg-hover)]" : resaltada ? "bg-[var(--color-input-bg)]" : ""
                  }`}
                >
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    <button
                      type="button"
                      onClick={() => onSeleccionar(f.key)}
                      aria-pressed={activa}
                      className="flex min-h-[44px] items-center gap-2 rounded-[6px] font-mono text-xs tabular-nums text-[var(--color-text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss-ink)]"
                    >
                      <span
                        aria-hidden="true"
                        className="inline-block h-3.5 w-3.5 flex-none rounded-[2px] border"
                        style={{ background: colorClase, borderColor: f.colorContorno }}
                      />
                      <span>{f.key}</span>
                    </button>
                  </th>
                  <td className={`px-3 py-2 tabular-nums ${f.esSinDato ? "italic text-[var(--color-text-muted)]" : "font-semibold text-[var(--color-text-primary)]"}`}>
                    {f.texto}
                  </td>
                  <td className="px-3 py-2 text-[var(--color-text-secondary)]">
                    {f.motivoSinDato ?? etiquetaEstado(f.status)}
                  </td>
                  <td className="px-3 py-2 text-[var(--color-text-secondary)]">
                    {f.esSinDato ? "Fuera de la escala" : (etiquetasClase[f.clase] ?? "—")}
                  </td>
                  {rango && (
                    <td className="px-3 py-2 tabular-nums text-[var(--color-text-secondary)]">
                      {f.value === null ? "ND" : formatearDiferencia(f.value - (referenciaMunicipal as number), unidad)}
                    </td>
                  )}
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => onAcercar(f.key)}
                      className="min-h-[44px] rounded-[6px] border border-[var(--color-border)] px-2 py-1 text-[11px] font-semibold text-[var(--color-text-secondary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss-ink)]"
                    >
                      <span className="sr-only">Acercar el mapa a la sección </span>Acercar
                    </button>
                  </td>
                </tr>
              );
            })}
            {filtradas.length === 0 && (
              <tr>
                <td colSpan={rango ? 6 : 5} className="px-3 py-6 text-center text-xs text-[var(--color-text-muted)]">
                  Ninguna sección coincide con el filtro «{filtro}». Borre el filtro para verlas todas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] leading-relaxed text-[var(--color-text-muted)]">
        El contorno de ND es {COLOR_CONTORNO_SIN_DATO} sobre relleno {COLOR_SIN_DATO}, y en el mapa y en
        el PNG se añade una trama diagonal. Ningún ND entra en las clases de color.
      </p>
    </section>
  );
}

function formatearDiferencia(diferencia: number, unidad: string): string {
  const signo = diferencia > 0 ? "+" : "";
  if (unidad === "%") return `${signo}${diferencia.toLocaleString("es-ES", { maximumFractionDigits: 2 })} pp`;
  // Una diferencia en euros o puntos se expresa en la unidad del indicador. Sin
  // ella, un "0" a secas es ambiguo: no se sabe si son euros, puntos o ratio.
  const magnitud = Math.abs(diferencia);
  const decimales = magnitud >= 100 ? 0 : magnitud >= 10 ? 1 : 2;
  const numero = diferencia.toLocaleString("es-ES", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
  return `${signo}${numero} ${unidad}`.trim();
}
