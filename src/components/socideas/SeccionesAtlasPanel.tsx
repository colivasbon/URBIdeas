"use client";

// Panel de control del atlas de secciones censales.
//
// Regla que atraviesa todo el archivo: los controles son de PRESENTACIÓN. No
// tocan un solo valor, no cambian una escala de la fuente y no pueden ocultar
// el aviso de cobertura ni el de «sin dato». Lo único que se puede cambiar es
// cómo se ve: clasificación, número de clases, paleta, bordes, opacidad,
// etiquetas, mapa base y resolución del PNG.
//
// Accesibilidad: cada grupo es un `fieldset`/`legend` con `role="radiogroup"`
// donde aplica, todos los controles son alcanzables con teclado y muestran
// `:focus-visible`, y los objetivos táctiles miden 44 px como mínimo en móvil.

import type { ReactNode } from "react";
import { CLASES_MAXIMO, CLASES_MINIMO } from "@/lib/socideas-secciones";
import type { ModoClasificacion } from "@/lib/socideas-secciones";
import type { PresentacionAtlas } from "./SeccionesAtlasMap";
import type { SeccionIndicador } from "@/lib/socideas-secciones";

const CLASES = Array.from({ length: CLASES_MAXIMO - CLASES_MINIMO + 1 }, (_, i) => CLASES_MINIMO + i);

const MODOS: Array<{ valor: ModoClasificacion; etiqueta: string; ayuda: string }> = [
  { valor: "cuantil", etiqueta: "Cuantil", ayuda: "Cada clase agrupa el mismo número de secciones." },
  { valor: "intervalos_iguales", etiqueta: "Intervalos iguales", ayuda: "Cada clase cubre el mismo tramo del rango observado." },
  { valor: "cortes_manuales", etiqueta: "Cortes manuales", ayuda: "Los límites los fija usted; se leen de menor a mayor." },
];

const BOTON =
  "inline-flex min-h-[44px] w-full items-center justify-center rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-sunken)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[var(--border-default)] disabled:hover:bg-[var(--bg-surface)]";
const BOTON_PRINCIPAL =
  "inline-flex min-h-[44px] w-full items-center justify-center rounded-[6px] bg-[var(--action-primary-bg)] px-3 py-2 text-sm font-semibold text-[var(--action-primary-fg)] transition-colors hover:bg-[var(--action-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50";
const ETIQUETA = "type-label mb-1.5 block text-[var(--text-secondary)]";
const AYUDA = "text-xs leading-relaxed text-[var(--text-muted)]";
const TITULO_GRUPO = "type-body-sm font-semibold text-[var(--text-primary)]";
const SELECT =
  "min-h-[44px] w-full rounded-[6px] border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] hover:border-[var(--border-strong)]";
/** Bloque del panel: separado del anterior por un filete. */
const BLOQUE = "border-t border-[var(--border-subtle)] pt-5";

export interface SeccionesAtlasPanelProps {
  codigoINE: string;
  indicadores: ReadonlyArray<SeccionIndicador>;
  indicadorId: string | null;
  periodos: ReadonlyArray<number>;
  anio: number | null;
  modo: ModoClasificacion;
  clases: number;
  presentacion: PresentacionAtlas;
  /** `true` si no hay ningún indicador con dato para este municipio. */
  sinIndicadores: boolean;
  /** `true` si NO hay valores observados que colorear (sin atlas, sin indicador,
   *  sin periodo o todo ND). Desactiva clasificación, paleta y opacidad —no son
   *  herramientas operativas sobre un mapa vacío— y convierte la exportación en
   *  un «plano de secciones» en vez de una coropleta. */
  plano: boolean;
  avisoCortes: string | null;
  exporting: boolean;
  exportError: string | null;
  exportNotice: string | null;
  onIndicador: (id: string) => void;
  onAnio: (anio: number) => void;
  onModo: (modo: ModoClasificacion) => void;
  onClases: (clases: number) => void;
  onPresentacion: (patch: Partial<PresentacionAtlas>) => void;
  onRestablecer: () => void;
  onExportarPng: () => void;
  /** Descarga del PLANO de secciones (solo contornos) cuando no hay coropleta. */
  onExportarPlano: () => void;
  /** URL de la descarga de DATOS seccionales (XLSX). `null` si el municipio no
   *  tiene atlas publicado. El PNG es una imagen; este fichero es la tabla. */
  urlXlsx?: string | null;
  /** Lectura del mapa (leyenda y sección seleccionada), bajo el selector de
   *  indicador y año. */
  lectura?: ReactNode;
  /** En móvil, los ajustes de clasificación y presentación se pliegan. En
   *  escritorio están siempre visibles. */
  ajustesAbiertos?: boolean;
  onAlternarAjustes?: () => void;
}

export default function SeccionesAtlasPanel({
  codigoINE,
  indicadores,
  indicadorId,
  periodos,
  anio,
  modo,
  clases,
  presentacion,
  sinIndicadores,
  plano,
  avisoCortes,
  exporting,
  exportError,
  exportNotice,
  onIndicador,
  onAnio,
  onModo,
  onClases,
  onPresentacion,
  onRestablecer,
  onExportarPng,
  onExportarPlano,
  urlXlsx,
  lectura,
  ajustesAbiertos = true,
  onAlternarAjustes,
}: SeccionesAtlasPanelProps) {
  const opciones = periodos.length > 0;
  // Clasificación, clases, paleta y opacidad solo tienen sentido con valores
  // observados. Sin ellos se ocultan como herramientas, en vez de dejarlas
  // manipulando una escala que no existe.
  const sinClasificar = sinIndicadores || plano;
  return (
    <div className="flex flex-col gap-5">
      <fieldset disabled={sinIndicadores} className="flex flex-col">
        <legend className="sr-only">Indicador</legend>
        <label htmlFor="atlas-indicador" className={ETIQUETA}>
          Indicador con dato por sección
        </label>
        <select
          id="atlas-indicador"
          className={SELECT}
          value={indicadorId ?? ""}
          onChange={(e) => onIndicador(e.target.value)}
        >
          {sinIndicadores && <option value="">Sin indicadores para este municipio</option>}
          {indicadores.map((i) => (
            <option key={i.id} value={i.id}>
              {i.etiqueta}
              {i.publicadoPorSeccion ? "" : " (no publicado por sección)"}
            </option>
          ))}
        </select>
        <p className={`${AYUDA} mt-1.5`}>
          El catálogo lo publica la fuente oficial. Un indicador marcado «no publicado por sección» no
          se representa: no existe dato oficial a ese grano.
        </p>
      </fieldset>

      <fieldset disabled={!opciones} className="flex flex-col">
        <legend className="sr-only">Año de referencia</legend>
        <label htmlFor="atlas-anio" className={ETIQUETA}>
          Periodo estadístico
        </label>
        <select
          id="atlas-anio"
          className={`${SELECT} tnum`}
          value={anio === null ? "" : String(anio)}
          onChange={(e) => onAnio(Number(e.target.value))}
        >
          {!opciones && <option value="">Sin periodos publicados</option>}
          {periodos.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <p className={`${AYUDA} mt-1.5`}>
          Año de la estadística. Es distinto del año del seccionado (la geometría): no se sustituye uno
          por otro en ninguna etiqueta.
        </p>
      </fieldset>

      {lectura}

      {onAlternarAjustes ? (
        <div className={`${BLOQUE} lg:hidden`}>
          <button
            type="button"
            onClick={onAlternarAjustes}
            aria-expanded={ajustesAbiertos}
            aria-controls="atlas-ajustes"
            className={BOTON}
          >
            {ajustesAbiertos ? "Ocultar ajustes de clasificación" : "Ajustes de clasificación y presentación"}
          </button>
        </div>
      ) : null}

      <div id="atlas-ajustes" className={`flex-col gap-5 ${ajustesAbiertos ? "flex" : "hidden lg:flex"}`}>
        <fieldset disabled={sinClasificar} className={`${BLOQUE} flex flex-col gap-2`}>
          <legend className={`${TITULO_GRUPO} float-left mb-2 w-full`}>Clasificación</legend>
          <div role="radiogroup" aria-label="Método de clasificación" className="flex flex-col">
            {MODOS.map((m) => (
              <OpcionInterruptor
                key={m.valor}
                name="atlas-modo"
                value={m.valor}
                etiqueta={m.etiqueta}
                ayuda={m.ayuda}
                marcado={modo === m.valor}
                onChange={() => onModo(m.valor)}
              />
            ))}
          </div>
          <CortesManuales
            activo={modo === "cortes_manuales"}
            disabled={sinClasificar}
            cortes={presentacion.cortesManuales}
            aviso={avisoCortes}
            onChange={(cortes) => onPresentacion({ cortesManuales: cortes })}
          />
        </fieldset>

        <fieldset disabled={sinClasificar} className="flex flex-col gap-2">
          <legend className={`${ETIQUETA} float-left w-full`}>Número de clases</legend>
          <div
            role="radiogroup"
            aria-label="Número de clases"
            className="tnum inline-flex w-full overflow-hidden rounded-[6px] border border-[var(--border-default)]"
          >
            {CLASES.map((n, i) => (
              <label
                key={n}
                className={`inline-flex min-h-[44px] min-w-[44px] flex-1 cursor-pointer items-center justify-center text-sm transition-colors focus-within:outline-2 focus-within:outline-offset-[-2px] focus-within:outline-[var(--border-focus)] ${
                  i > 0 ? "border-l border-[var(--border-default)]" : ""
                } ${
                  clases === n
                    ? "bg-[var(--musgo)] font-semibold text-[var(--hueso)]"
                    : "bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-sunken)]"
                }`}
              >
                <input
                  type="radio"
                  name="atlas-clases"
                  value={n}
                  checked={clases === n}
                  onChange={() => onClases(n)}
                  className="sr-only"
                />
                {n}
              </label>
            ))}
          </div>
          <p className={AYUDA}>
            Si hay menos valores distintos que clases pedidas, se reduce el número de clases: no se repite
            color ni se estira una escala sobre datos que no existen.
          </p>
        </fieldset>

        <fieldset className={`${BLOQUE} flex flex-col gap-4`}>
          <legend className={`${TITULO_GRUPO} float-left w-full`}>Presentación</legend>

          <fieldset disabled={sinClasificar}>
            <legend className={ETIQUETA}>Paleta</legend>
            <div role="radiogroup" aria-label="Paleta de color" className="flex flex-col">
              <OpcionInterruptor
                name="atlas-paleta"
                etiqueta="Secuencial"
                ayuda="Un solo sentido: de claro a oscuro. Para magnitudes sin centro natural."
                marcado={!presentacion.divergente}
                onChange={() => onPresentacion({ divergente: false })}
              />
              <OpcionInterruptor
                name="atlas-paleta"
                etiqueta="Divergente"
                ayuda="Dos sentidos respecto al centro de la escala. Úsela solo si el cero o el punto medio significa algo."
                marcado={presentacion.divergente}
                onChange={() => onPresentacion({ divergente: true })}
              />
            </div>
          </fieldset>

          <div className="flex flex-col">
            <Casilla
              id="atlas-bordes"
              etiqueta="Contornos de sección"
              ayuda="Línea entre secciones, para leer la partición cuando los colores son próximos."
              marcado={presentacion.mostrarBordes}
              onChange={(v) => onPresentacion({ mostrarBordes: v })}
            />
            <Casilla
              id="atlas-etiquetas"
              etiqueta="Etiquetas con el código de sección"
              ayuda="Escribe el CUSEC de 10 dígitos dentro de cada polígono."
              marcado={presentacion.mostrarEtiquetas}
              onChange={(v) => onPresentacion({ mostrarEtiquetas: v })}
            />
            <Casilla
              id="atlas-basemap"
              etiqueta="Mapa base (OpenStreetMap)"
              ayuda="Desactívelo para leer solo el seccionado sobre fondo neutro. El PNG sale sin cartografía de fondo."
              marcado={presentacion.basemap}
              onChange={(v) => onPresentacion({ basemap: v })}
            />
          </div>

          <div>
            <label htmlFor="atlas-opacidad" className={ETIQUETA}>
              Opacidad del relleno: <span className="tnum">{Math.round(presentacion.opacidad * 100)} %</span>
            </label>
            <input
              id="atlas-opacidad"
              type="range"
              min={20}
              max={100}
              step={5}
              disabled={sinClasificar}
              value={Math.round(presentacion.opacidad * 100)}
              onChange={(e) => onPresentacion({ opacidad: Number(e.target.value) / 100 })}
              className="min-h-[44px] w-full accent-[var(--moss-ink)] disabled:opacity-50"
            />
          </div>

          <fieldset>
            <legend className={ETIQUETA}>Resolución del PNG</legend>
            <div role="radiogroup" aria-label="Resolución del PNG" className="flex flex-col">
              <OpcionInterruptor
                name="atlas-escala-png"
                etiqueta="Estándar"
                ayuda="Lado mayor de 1200 px. Archivo ligero."
                marcado={presentacion.escalaPng === 1}
                onChange={() => onPresentacion({ escalaPng: 1 })}
              />
              <OpcionInterruptor
                name="atlas-escala-png"
                etiqueta="Alta"
                ayuda="Lado mayor de 2400 px. Para imprimir o ampliar."
                marcado={presentacion.escalaPng === 2}
                onChange={() => onPresentacion({ escalaPng: 2 })}
              />
            </div>
          </fieldset>
        </fieldset>
      </div>

      <section aria-label="Descargas" className={`${BLOQUE} flex flex-col gap-2`}>
        <h3 className={`${TITULO_GRUPO} mb-1`}>Descargas</h3>
        {plano ? (
          <>
            <button type="button" onClick={onExportarPlano} disabled={exporting} className={BOTON_PRINCIPAL}>
              {exporting ? "Componiendo el plano…" : "Descargar plano de secciones"}
            </button>
            <button
              type="button"
              disabled
              title="No hay valores observados que colorear. Elija un indicador o un año con datos; hasta entonces la coropleta estaría vacía."
              className={BOTON}
            >
              Descargar mapa coroplético PNG
            </button>
          </>
        ) : (
          <button type="button" onClick={onExportarPng} disabled={exporting} className={BOTON_PRINCIPAL}>
            {exporting ? "Componiendo el PNG…" : "Descargar mapa coroplético PNG"}
          </button>
        )}
        {/* El PNG es una IMAGEN de la vista. Los datos verificables van en el
            XLSX, que es un fichero distinto con una fila por sección, indicador
            y año. Conviven sin confundirse. */}
        {urlXlsx ? (
          <a href={urlXlsx} download className={BOTON}>
            Descargar datos seccionales (XLSX)
          </a>
        ) : null}
        <button type="button" onClick={onRestablecer} className={BOTON}>
          Restablecer vista
        </button>
        <p aria-live="polite" className={`${AYUDA} mt-1 [overflow-wrap:anywhere]`}>
          {exportError ? (
            <span className="socideas-error-text">{exportError}</span>
          ) : exportNotice ? (
            <span>{exportNotice}</span>
          ) : plano ? (
            <span>
              El plano se compone con el encabezado, el pie con fuente y atribuciones. No lleva escala
              de color: no hay valores que repartir.
            </span>
          ) : (
            <span>
              El PNG se compone con el encabezado, la leyenda completa (incluido «Sin dato / ND»), el pie
              con fuente y las atribuciones del INE y de OpenStreetMap.
            </span>
          )}
        </p>
      </section>

      <section
        aria-label="Alcance de la descarga"
        className="rounded-[6px] bg-[var(--bg-surface-sunken)] p-4"
      >
        <p className="type-body-sm font-semibold text-[var(--text-primary)]">Sobre la descarga de datos</p>
        {urlXlsx ? (
          <p className={`${AYUDA} mt-1`}>
            «Descargar datos seccionales (XLSX)» entrega una fila por sección, indicador y año: la clave
            CUSEC como texto (conserva los ceros), el valor, la unidad, el estado (observado o ND), la
            operación y la tabla del INE, el periodo estadístico, el año de geometría, la fecha de
            consulta y la URL de la fuente. El PNG es una imagen: no sustituye a este fichero.
          </p>
        ) : (
          <p className={`${AYUDA} mt-1`}>
            Este municipio todavía no tiene indicadores cargados, así que no hay tabla de datos que
            descargar: la única exportación disponible es el plano de secciones (geometría), que no es
            una estadística. Cuando se carguen los indicadores aparecerá aquí la descarga XLSX.
          </p>
        )}
        <p className={`${AYUDA} mt-2`}>
          Municipio INE <span className="tnum">{codigoINE}</span>.
        </p>
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function OpcionInterruptor({
  name,
  value,
  etiqueta,
  ayuda,
  marcado,
  onChange,
}: {
  name: string;
  value?: string;
  etiqueta: string;
  ayuda: string;
  marcado: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-[6px] py-2 text-sm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--border-focus)]">
      <input
        type="radio"
        name={name}
        value={value}
        checked={marcado}
        onChange={onChange}
        className="mt-1 h-4 w-4 flex-none accent-[var(--moss-ink)]"
      />
      <span className="min-w-0">
        <span
          className={`block ${marcado ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}
        >
          {etiqueta}
        </span>
        <span className="block text-xs leading-relaxed text-[var(--text-muted)]">{ayuda}</span>
      </span>
    </label>
  );
}

function Casilla({
  id,
  etiqueta,
  ayuda,
  marcado,
  onChange,
}: {
  id: string;
  etiqueta: string;
  ayuda: string;
  marcado: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-[6px] py-2 text-sm focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--border-focus)]"
    >
      <input
        id={id}
        type="checkbox"
        checked={marcado}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 flex-none accent-[var(--moss-ink)]"
      />
      <span className="min-w-0">
        <span className="block text-[var(--text-primary)]">{etiqueta}</span>
        <span className="block text-xs leading-relaxed text-[var(--text-muted)]">{ayuda}</span>
      </span>
    </label>
  );
}

function CortesManuales({
  activo,
  disabled,
  cortes,
  aviso,
  onChange,
}: {
  activo: boolean;
  disabled: boolean;
  cortes: number[] | null;
  aviso: string | null;
  onChange: (cortes: number[] | null) => void;
}) {
  const bruto = cortes ? cortes.join(", ") : "";
  return (
    <div className="mt-1 flex flex-col">
      <label htmlFor="atlas-cortes" className={ETIQUETA}>
        Cortes manuales, separados por comas
      </label>
      <input
        id="atlas-cortes"
        type="text"
        inputMode="decimal"
        disabled={!activo || disabled}
        value={bruto}
        placeholder="18,40 · 21,75 · 24,10"
        onChange={(e) => onChange(parsearCortes(e.target.value))}
        aria-describedby="atlas-cortes-ayuda"
        aria-invalid={aviso ? true : undefined}
        className={`tnum min-h-[44px] w-full rounded-[6px] border bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] disabled:cursor-not-allowed disabled:bg-[var(--bg-surface-sunken)] disabled:opacity-70 ${
          aviso ? "border-[var(--danger-ink)]" : "border-[var(--border-default)]"
        }`}
      />
      <p id="atlas-cortes-ayuda" className={`${AYUDA} mt-1.5`}>
        Entre 1 y 9 números. El último corte define la clase abierta por arriba.
      </p>
      {aviso && (
        <p role="alert" className="socideas-error-text mt-1 text-xs">
          {aviso}
        </p>
      )}
    </div>
  );
}

/** Valida la lista de cortes manuales. `null` significa «no utilizables». */
export function parsearCortes(texto: string): number[] | null {
  const bruto = texto
    .replace(/[·•|]/g, ",")
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (bruto.length < 1 || bruto.length > 9) return null;
  const nums: number[] = [];
  for (const p of bruto) {
    const n = Number(p.replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(n)) return null;
    nums.push(n);
  }
  const ordenados = [...new Set(nums)].sort((a, b) => a - b);
  return ordenados.length ? ordenados : null;
}

/** Texto del aviso de cortes inválidos, o `null` si son utilizables. */
export function avisoDeCortes(textoCortes: string, activo: boolean): string | null {
  if (!activo) return null;
  if (!textoCortes.trim()) return "No ha indicado ningún corte. Se usan intervalos iguales hasta que indique al menos uno.";
  if (parsearCortes(textoCortes) === null) {
    return "Los cortes no son utilizables (hace falta al menos un número, sin repeticiones inútiles). Se usan intervalos iguales.";
  }
  return null;
}
