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
import { COLOR_SELECCION } from "./SeccionesAtlasMap";
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

const TH = "px-3 py-1 text-left align-bottom type-label font-semibold text-[var(--text-secondary)]";
/** Columnas numéricas: alineadas a la derecha, cifras tabulares. */
const NUMERICA: ReadonlySet<ClaveOrdenAtlas> = new Set<ClaveOrdenAtlas>(["valor"]);

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
          <h2 className="type-h4 text-[var(--text-primary)]">Tabla de secciones</h2>
          <p className="tnum mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
            {filtradas.length} de {filas.length} secciones · cobertura {coberturaPct.toLocaleString("es-ES", { maximumFractionDigits: 1 })} %
            {rango ? " · comparación con la referencia municipal de la misma operación y periodo" : ""}
          </p>
        </div>
        <div className="sm:w-64">
          <label htmlFor="atlas-filtro-seccion" className="type-label mb-1.5 block text-[var(--text-secondary)]">
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
            className="tnum min-h-[44px] w-full rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] hover:border-[var(--border-strong)]"
          />
          <p id="atlas-filtro-ayuda" className="mt-1.5 text-xs text-[var(--text-muted)]">
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
        className="max-h-[34rem] w-full min-w-0 max-w-[100vw] overflow-x-auto overflow-y-auto overscroll-x-contain rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] [contain:paint]"
        tabIndex={0}
        role="region"
        aria-label={`Tabla de secciones de ${municipioNombre}, desplazable horizontalmente`}
      >
        <table className="socideas-table tnum w-full text-left text-[13px]">
          <caption className="max-w-full break-words border-b border-[var(--border-subtle)] px-3 py-2.5 text-left text-xs leading-relaxed text-[var(--text-muted)]">
            {indicadorEtiqueta} en {municipioNombre}
            {anio !== null ? `, ${anio}` : ""} por sección censal
            {unidad ? `, en ${unidad}` : ""}. Una fila por sección publicada. Las secciones sin dato
            aparecen como «ND»: eso no es un cero. Ordene por cualquier columna con el botón de su
            cabecera.
          </caption>
          <thead className="sticky top-0 z-10 bg-[var(--bg-surface-sunken)]">
            <tr>
              {(["seccion", "valor", "estado", "clase"] as ClaveOrdenAtlas[]).map((clave) => (
                <th
                  key={clave}
                  scope="col"
                  aria-sort={ariaSort(clave)}
                  className={`${TH} border-b border-[var(--border-default)] ${NUMERICA.has(clave) ? "text-right" : ""}`}
                >
                  <button
                    type="button"
                    onClick={() => alternar(clave)}
                    className={`flex min-h-[44px] min-w-[44px] w-full items-center gap-x-1.5 rounded-[6px] transition-colors hover:text-[var(--text-primary)] ${
                      NUMERICA.has(clave) ? "justify-end text-right" : "text-left"
                    } ${orden.clave === clave ? "text-[var(--text-primary)]" : ""}`}
                  >
                    <span className="break-words">{ORDEN_ETIQUETA[clave]}</span>
                    {/* Sentido del orden: símbolo funcional; el estado lo anuncia aria-sort. */}
                    <span aria-hidden="true" className="w-3 text-[var(--text-muted)]">
                      {orden.clave === clave ? (orden.sentido === "asc" ? "↑" : "↓") : ""}
                    </span>
                  </button>
                </th>
              ))}
              {rango && (
                <th scope="col" className={`${TH} border-b border-[var(--border-default)] text-right`}>
                  Frente al municipio
                </th>
              )}
              <th scope="col" className={`${TH} border-b border-[var(--border-default)]`}>
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
                  className={`transition-colors ${
                    activa
                      ? "bg-[var(--status-info-bg)] shadow-[inset_3px_0_0_var(--moss-ink)]"
                      : resaltada
                        ? "bg-[var(--bg-surface-sunken)]"
                        : ""
                  }`}
                >
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    <button
                      type="button"
                      onClick={() => onSeleccionar(f.key)}
                      aria-pressed={activa}
                      className={`flex min-h-[44px] items-center gap-2.5 rounded-[6px] text-[13px] text-[var(--text-primary)] ${activa ? "font-semibold" : ""}`}
                    >
                      <span
                        aria-hidden="true"
                        className="inline-block h-3 w-3 flex-none border"
                        style={{
                          background: colorClase,
                          borderColor: f.esSinDato
                            ? COLOR_CONTORNO_SIN_DATO
                            : activa
                              ? COLOR_SELECCION
                              : "var(--border-default)",
                        }}
                      />
                      <span>{f.key}</span>
                    </button>
                  </th>
                  <td className={`whitespace-nowrap px-3 py-2 text-right ${f.esSinDato ? "text-[var(--text-muted)]" : "font-medium text-[var(--text-primary)]"}`}>
                    {f.texto}
                  </td>
                  <td className="px-3 py-2 text-[var(--text-secondary)]">
                    {f.motivoSinDato ?? etiquetaEstado(f.status)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-[var(--text-secondary)]">
                    {f.esSinDato ? "Fuera de la escala" : (etiquetasClase[f.clase] ?? "—")}
                  </td>
                  {rango && (
                    <td className="whitespace-nowrap px-3 py-2 text-right text-[var(--text-secondary)]">
                      {f.value === null ? "ND" : formatearDiferencia(f.value - (referenciaMunicipal as number), unidad)}
                    </td>
                  )}
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => onAcercar(f.key)}
                      className="min-h-[44px] rounded-[6px] px-3 py-1 text-[13px] font-medium text-[var(--text-link)] underline decoration-1 underline-offset-[3px] transition-colors hover:text-[var(--text-link-hover)] hover:decoration-2"
                    >
                      <span className="sr-only">Acercar el mapa a la sección </span>Acercar
                    </button>
                  </td>
                </tr>
              );
            })}
            {filtradas.length === 0 && (
              <tr>
                <td colSpan={rango ? 6 : 5} className="px-3 py-6 text-center text-sm text-[var(--text-muted)]">
                  Ninguna sección coincide con el filtro «{filtro}». Borre el filtro para verlas todas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs leading-relaxed text-[var(--text-muted)]">
        Las secciones sin dato (ND) llevan relleno limo con trama diagonal, igual en el mapa, en la
        leyenda y en el PNG. Ningún ND entra en las clases de color.
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
