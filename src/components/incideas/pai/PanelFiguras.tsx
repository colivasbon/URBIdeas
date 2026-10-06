"use client";

import { useRef } from "react";
import { ETIQUETA_TIPO, medidaFigura, type Figura } from "./mapa/figuras";
import type { ModoMapa } from "./mapa/ComposerFiguras";

interface Props {
  figuras: Figura[];
  modo: ModoMapa | null;
  nombreProyecto: string;
  errorArchivo: string | null;
  onNombreProyecto: (v: string) => void;
  onModo: (m: ModoMapa) => void;
  onArchivo: (f: File) => void;
  onRenombrar: (id: string, nombre: string) => void;
  onIncluir: (id: string, incluida: boolean) => void;
  onZoom: (id: string) => void;
  onEliminar: (id: string) => void;
  onResaltar: (id: string | null) => void;
  onLimpiar: () => void;
}

const DIBUJO: { modo: ModoMapa; etiqueta: string }[] = [
  { modo: "punto", etiqueta: "Punto" },
  { modo: "linea", etiqueta: "Línea" },
  { modo: "poligono", etiqueta: "Polígono" },
  { modo: "rectangulo", etiqueta: "Rectángulo" },
  { modo: "circulo", etiqueta: "Círculo" },
];

const EDICION: { modo: ModoMapa; etiqueta: string }[] = [
  { modo: "editar", etiqueta: "Editar vértices" },
  { modo: "mover", etiqueta: "Mover" },
  { modo: "rotar", etiqueta: "Rotar" },
  { modo: "recortar", etiqueta: "Recortar" },
  { modo: "borrar", etiqueta: "Borrar en mapa" },
];

const AYUDA: Record<ModoMapa, string> = {
  punto: "Haz clic en el mapa para colocar el punto.",
  linea: "Clic para cada vértice; doble clic para terminar la línea.",
  poligono: "Clic para cada vértice; doble clic o clic en el primer vértice para cerrar el polígono.",
  rectangulo: "Clic y arrastra (o dos clics) en esquinas opuestas.",
  circulo: "Clic en el centro y mueve el ratón hasta el radio deseado; clic para fijar.",
  editar: "Arrastra los vértices para modificarlos; los puntos intermedios añaden vértices.",
  mover: "Arrastra una figura para desplazarla.",
  rotar: "Selecciona una figura y gírala con el ratón.",
  recortar: "Dibuja un polígono sobre una figura para recortarle esa parte.",
  borrar: "Haz clic en una figura para eliminarla.",
};

export default function PanelFiguras(p: Props) {
  const entrada = useRef<HTMLInputElement>(null);

  const boton = (m: { modo: ModoMapa; etiqueta: string }) => (
    <button
      key={m.modo}
      type="button"
      className={`btn btn-sm ${p.modo === m.modo ? "btn-primary" : "btn-secondary"}`}
      aria-pressed={p.modo === m.modo}
      onClick={() => p.onModo(m.modo)}
    >
      {m.etiqueta}
    </button>
  );

  return (
    <div className="space-y-6">
      <div>
        <label htmlFor="pai-nombre" className="field-label">Nombre del proyecto</label>
        <input id="pai-nombre" className="input" value={p.nombreProyecto} onChange={(e) => p.onNombreProyecto(e.target.value)} placeholder="PSF Talega" />
      </div>

      <section aria-labelledby="fig-dibujo">
        <h3 id="fig-dibujo" className="text-sm font-semibold text-[var(--text-primary)]">Dibujar el ámbito</h3>
        <div className="mt-2 flex flex-wrap gap-2">{DIBUJO.map(boton)}</div>
        <h3 className="mt-4 text-sm font-semibold text-[var(--text-primary)]">Modificar</h3>
        <div className="mt-2 flex flex-wrap gap-2">{EDICION.map(boton)}</div>
        <p role="status" className="mt-3 min-h-[2.5rem] rounded-[6px] bg-[var(--surface-note)] px-3 py-2 text-sm text-[var(--text-secondary)]">
          {p.modo ? AYUDA[p.modo] : "Elige una herramienta y dibuja sobre el mapa. Esc cancela la herramienta activa."}
        </p>
      </section>

      <section aria-labelledby="fig-archivo">
        <h3 id="fig-archivo" className="text-sm font-semibold text-[var(--text-primary)]">Cargar un archivo</h3>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">KMZ, KML, GeoJSON o shapefile (ZIP). Cada elemento queda como figura editable.</p>
        <button type="button" className="btn btn-secondary btn-sm mt-2" onClick={() => entrada.current?.click()}>
          Cargar KMZ / KML / SHP
        </button>
        <input
          ref={entrada}
          type="file"
          accept=".kmz,.kml,.geojson,.json,.zip"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) p.onArchivo(f);
            e.target.value = "";
          }}
        />
        {p.errorArchivo && (
          <p role="alert" className="mt-2 rounded-[6px] bg-[var(--status-danger-bg)] px-3 py-2 text-sm text-[var(--status-danger-fg)]">
            {p.errorArchivo}
          </p>
        )}
      </section>

      <section aria-labelledby="fig-lista">
        <div className="flex items-center justify-between gap-3">
          <h3 id="fig-lista" className="text-sm font-semibold text-[var(--text-primary)]">Figuras ({p.figuras.length})</h3>
          {p.figuras.length > 0 && (
            <button type="button" className="text-sm text-[var(--text-secondary)] underline-offset-2 hover:underline" onClick={p.onLimpiar}>
              Quitar todas
            </button>
          )}
        </div>
        {p.figuras.length === 0 ? (
          <p className="mt-2 rounded-[6px] border border-dashed border-[var(--border-default)] p-4 text-center text-sm text-[var(--text-secondary)]">
            Aún no hay figuras. Dibuja el vallado o la implantación, marca un punto o carga un archivo.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-[var(--border-subtle)] rounded-[6px] border border-[var(--border-subtle)]">
            {p.figuras.map((f) => (
              <li key={f.id} className="p-3" onMouseEnter={() => p.onResaltar(f.id)} onMouseLeave={() => p.onResaltar(null)}>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 accent-[var(--moss-ink)]"
                    checked={f.incluida}
                    onChange={(e) => p.onIncluir(f.id, e.target.checked)}
                    aria-label={`Incluir «${f.nombre}» en el ámbito`}
                  />
                  <input
                    className="min-w-0 flex-1 rounded-[6px] border border-transparent bg-transparent px-2 py-1 text-sm font-medium text-[var(--text-primary)] hover:border-[var(--border-subtle)] focus:border-[var(--border-default)] focus:outline-none"
                    value={f.nombre}
                    onChange={(e) => p.onRenombrar(f.id, e.target.value)}
                    aria-label="Nombre de la figura"
                  />
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 pl-6">
                  <p className="text-xs text-[var(--text-muted)]">
                    {ETIQUETA_TIPO[f.tipo]}
                    {medidaFigura(f) ? ` · ${medidaFigura(f)}` : ""}
                    {!f.incluida ? " · fuera del ámbito" : ""}
                  </p>
                  <div className="flex gap-1">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => p.onZoom(f.id)}>Ver</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => p.onEliminar(f.id)}>Eliminar</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
