"use client";

// Ficha de detalle de la sección seleccionada.
//
// Muestra TODO lo que la fuente declara para esa sección, incluido el motivo por
// el que no hay dato cuando lo hay, y separa con claridad tres cosas que en las
// fuentes suelen venir mezcladas: el año de la estadística, el año del
// seccionado (geometría) y la fecha de descarga.

import type { ReactNode } from "react";
import { etiquetaEstado, formatearValor } from "@/lib/socideas-secciones";
import type { SeccionIndicador } from "@/lib/socideas-secciones";
import type { FilaAtlas } from "./SeccionesAtlasMap";

export interface SeccionesAtlasDetalleProps {
  fila: FilaAtlas | null;
  indicador: SeccionIndicador | null;
  municipioNombre: string;
  anio: number | null;
  unidad: string;
  geometryYear: number | null;
  referenciaMunicipal: number | null;
  escalaSimple: boolean;
  valoresDistintos: number;
  onAcercar: (key: string) => void;
  onQuitar: () => void;
}

const ETIQUETA_DATO = "text-xs text-[var(--text-muted)]";
const VALOR_DATO = "mt-0.5 text-sm text-[var(--text-primary)]";
const BOTON =
  "inline-flex min-h-[44px] flex-1 items-center justify-center rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-sunken)]";
const NOTA = "rounded-[6px] bg-[var(--bg-surface-sunken)] p-3";

export default function SeccionesAtlasDetalle({
  fila,
  indicador,
  municipioNombre,
  anio,
  unidad,
  geometryYear,
  referenciaMunicipal,
  escalaSimple,
  valoresDistintos,
  onAcercar,
  onQuitar,
}: SeccionesAtlasDetalleProps) {
  if (!fila) {
    return (
      <section aria-label="Detalle de la sección seleccionada" className="border-t border-[var(--border-subtle)] pt-5">
        <h3 className="type-body-sm font-semibold text-[var(--text-primary)]">Sección seleccionada</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-muted)]">
          Todavía no ha seleccionado ninguna sección. Pulse un polígono en el mapa o el botón de la
          clave en la tabla. Con el teclado se llega a lo mismo desde la tabla: cada fila tiene un
          botón propio.
        </p>
      </section>
    );
  }

  const referencia = referenciaMunicipal;
  const diferencia = fila.value !== null && referencia !== null ? fila.value - referencia : null;

  return (
    <section
      aria-label={`Detalle de la sección ${fila.key}`}
      className="flex flex-col gap-4 border-t border-[var(--border-subtle)] pt-5"
    >
      <div className="flex flex-col gap-3">
        <div>
          <h3 className="type-body-sm font-semibold text-[var(--text-primary)]">
            Sección <span className="tnum">{fila.key}</span>
          </h3>
          <p aria-live="polite" className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
            Sección seleccionada en {municipioNombre}
            {anio !== null ? `, ${anio}` : ""}. Datos oficiales de la fuente; nada estimado.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onAcercar(fila.key)} className={BOTON}>
            Zoom a esta sección
          </button>
          <button type="button" onClick={onQuitar} className={BOTON}>
            Quitar selección
          </button>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <div className="col-span-2">
          <dt className={ETIQUETA_DATO}>{indicador?.etiqueta ?? "Indicador"}</dt>
          <dd className={VALOR_DATO}>
            <span className="type-h3 tnum">{fila.texto}</span>
          </dd>
        </div>
        <div>
          <dt className={ETIQUETA_DATO}>Estado del dato</dt>
          <dd className={VALOR_DATO}>{fila.motivoSinDato ?? etiquetaEstado(fila.status)}</dd>
        </div>
        <div>
          <dt className={ETIQUETA_DATO}>Periodo estadístico</dt>
          <dd className={`${VALOR_DATO} tnum`}>{anio ?? "No consta"}</dd>
        </div>
        <div>
          <dt className={ETIQUETA_DATO}>Seccionado (geometría)</dt>
          <dd className={`${VALOR_DATO} tnum`}>{geometryYear ?? "No consta"}</dd>
        </div>
        <div>
          <dt className={ETIQUETA_DATO}>Referencia municipal</dt>
          <dd className={`${VALOR_DATO} tnum`}>
            {referencia === null
              ? "No publicada para este indicador y periodo"
              : `${formatearValor(referencia, "observado", unidad)}`}
          </dd>
        </div>
        <div>
          <dt className={ETIQUETA_DATO}>Frente al municipio</dt>
          <dd className={`${VALOR_DATO} tnum`}>
            {diferencia === null
              ? "No calculable sin los dos valores"
              : `${diferencia > 0 ? "+" : ""}${diferencia.toLocaleString("es-ES", { maximumFractionDigits: 2 })}${
                  unidad === "%" ? " pp" : ""
                }`}
          </dd>
        </div>
      </dl>

      {fila.esSinDato && (
        <div className={NOTA} role="note">
          <p className="text-sm font-semibold text-[var(--text-primary)]">Sin dato: no es un cero</p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
            {fila.motivoSinDato ?? `La fuente no difunde valor para esta sección en este indicador y este periodo (${etiquetaEstado(fila.status).toLowerCase()}).`}{" "}
            En el mapa y en el PNG esta sección se distingue con trama diagonal y queda fuera de la
            escala de colores. No se le ha asignado 0 ni el valor del municipio.
          </p>
        </div>
      )}

      {escalaSimple && (
        <div className={NOTA} role="note">
          <p className="text-sm font-semibold text-[var(--text-primary)]">Clasificación no aplicable</p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
            Solo hay {valoresDistintos}{" "}
            {valoresDistintos === 1 ? "valor distinto" : "valores distintos"} entre las secciones con
            dato. Dividirlos en clases no aportaría nada, así que el mapa usa un único color y el
            valor exacto se lee aquí y en la tabla. No se fabrica una escala.
          </p>
        </div>
      )}

      <div className="border-t border-[var(--border-subtle)] pt-4">
        <h4 className="text-sm font-semibold text-[var(--text-primary)]">Trazabilidad de la observación</h4>
        <dl className="mt-2 grid grid-cols-1 gap-3">
          <Dato etiqueta="Tabla de la fuente">{fila.sourceTable || "No consta"}</Dato>
          <Dato etiqueta="Operación">{fila.operation || "No consta"}</Dato>
          <Dato etiqueta="Publicado por la fuente">{fila.publishedAt ?? "Sin fecha de publicación"}</Dato>
          <Dato etiqueta="Descargado de la fuente">{fila.retrievedAt || "No consta"}</Dato>
          {Object.entries(fila.dimensiones).length > 0 && (
            <div>
              <dt className={ETIQUETA_DATO}>Dimensiones declaradas</dt>
              <dd className={VALOR_DATO}>
                {Object.entries(fila.dimensiones)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(" · ")}
              </dd>
            </div>
          )}
          {fila.nota && (
            <div>
              <dt className={ETIQUETA_DATO}>Nota de la fuente</dt>
              <dd className={VALOR_DATO}>{fila.nota}</dd>
            </div>
          )}
          {fila.methodologyNote && (
            <div>
              <dt className={ETIQUETA_DATO}>Nota metodológica</dt>
              <dd className={VALOR_DATO}>{fila.methodologyNote}</dd>
            </div>
          )}
          {indicador?.definicion && (
            <div>
              <dt className={ETIQUETA_DATO}>Definición del indicador</dt>
              <dd className={`${VALOR_DATO} leading-relaxed`}>{indicador.definicion}</dd>
            </div>
          )}
          {indicador?.universo && (
            <div>
              <dt className={ETIQUETA_DATO}>Universo de cálculo</dt>
              <dd className={VALOR_DATO}>{indicador.universo}</dd>
            </div>
          )}
        </dl>
        {fila.fuenteUrl ? (
          <p className="mt-3 break-words text-xs leading-relaxed text-[var(--text-muted)]">
            Ficha de la fuente:{" "}
            <a
              href={fila.fuenteUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="link"
            >
              {fila.fuenteUrl}
            </a>
          </p>
        ) : null}
      </div>
    </section>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div>
      <dt className={ETIQUETA_DATO}>{etiqueta}</dt>
      <dd className={`${VALOR_DATO} break-words`}>{children}</dd>
    </div>
  );
}
