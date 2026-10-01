"use client";

import { useCallback, useEffect, useState } from "react";

interface Registro {
  id: string;
  nombre_oficial: string;
  categoria: string;
  subcategoria?: string;
  fuente_principal: string;
  estado_validacion: string;
  estado_espacial?: string;
  direccion?: string;
  telefono_publico?: string;
  coordenadas?: { lat: number; lng: number };
  fecha_dato?: string;
  fecha_consulta?: string;
  licencia?: string;
  id_origen?: string;
  huella?: string;
  observaciones?: string;
  procedencia_atributos?: Record<string, { fuente: string; fecha_consulta: string; metodo: string }>;
  desactualizado_desde?: string | null;
}

interface Resumen {
  total: number;
  sin_revisar: number;
  sin_coords: number;
  fuera: number;
  proximo: number;
  duplicados: number;
  conflictivos: number;
  desactualizados: number;
  incompletos: number;
}

const BANDEJAS: { id: string; label: string; clave: keyof Resumen }[] = [
  { id: "sin_revisar", label: "Automáticos sin revisar", clave: "sin_revisar" },
  { id: "sin_coords", label: "Sin coordenadas", clave: "sin_coords" },
  { id: "fuera", label: "Fuera del municipio", clave: "fuera" },
  { id: "proximo", label: "Próximos al límite", clave: "proximo" },
  { id: "duplicados", label: "Posibles duplicados", clave: "duplicados" },
  { id: "conflictivos", label: "Conflictivos", clave: "conflictivos" },
  { id: "desactualizados", label: "Posibles bajas / obsoletos", clave: "desactualizados" },
];

const ACCIONES = [
  { accion: "validar", label: "Validar" },
  { accion: "marcar_conflictivo", label: "Marcar conflictivo" },
  { accion: "marcar_pendiente", label: "Pendiente municipal" },
  { accion: "marcar_obsoleto", label: "Marcar obsoleto" },
];

async function obtenerResumen(codigoINE: string): Promise<Resumen | null> {
  const res = await fetch(`/api/incideas/revision?codigo_ine=${codigoINE}`);
  if (!res.ok) return null;
  const j = await res.json();
  return j.data as Resumen;
}

async function obtenerRegistros(codigoINE: string, vista: string): Promise<Registro[]> {
  const res = await fetch(`/api/incideas/registros?codigo_ine=${codigoINE}&vista=${vista}&limit=100`);
  const j = await res.json();
  return (j.data ?? []) as Registro[];
}

export default function RevisionInbox({ codigoINE }: { codigoINE: string }) {
  const [vista, setVista] = useState("sin_revisar");
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [seleccion, setSeleccion] = useState<Registro | null>(null);
  const [cargando, setCargando] = useState(true);
  const [token, setToken] = useState("");
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  useEffect(() => {
    const t = window.localStorage.getItem("incideas_review_token");
    if (t) queueMicrotask(() => setToken(t));
  }, []);

  useEffect(() => {
    let activo = true;
    obtenerResumen(codigoINE).then((r) => {
      if (activo && r) setResumen(r);
    });
    return () => {
      activo = false;
    };
  }, [codigoINE]);

  useEffect(() => {
    let activo = true;
    obtenerRegistros(codigoINE, vista)
      .then((r) => {
        if (!activo) return;
        setRegistros(r);
        setSeleccion(null);
        setCargando(false);
      })
      .catch(() => {
        if (activo) setRegistros([]);
      });
    return () => {
      activo = false;
    };
  }, [codigoINE, vista]);

  const guardarToken = (v: string) => {
    setToken(v);
    window.localStorage.setItem("incideas_review_token", v);
  };

  const refrescar = useCallback(async () => {
    const [r, l] = await Promise.all([obtenerResumen(codigoINE), obtenerRegistros(codigoINE, vista)]);
    if (r) setResumen(r);
    setRegistros(l);
  }, [codigoINE, vista]);

  const ejecutarAccion = async (accion: string, extra: Record<string, unknown> = {}) => {
    if (!seleccion) return;
    if (!token) {
      setMensaje({ tipo: "error", texto: "Introduce el token de revisión." });
      return;
    }
    setMensaje(null);
    const res = await fetch("/api/incideas/revision", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-review-token": token },
      body: JSON.stringify({ registro_id: seleccion.id, accion, ...extra }),
    });
    const j = await res.json();
    if (!res.ok) {
      setMensaje({ tipo: "error", texto: j.error ?? "Error en la acción" });
      return;
    }
    setMensaje({ tipo: "ok", texto: `Acción aplicada: ${accion}` });
    setSeleccion(null);
    await refrescar();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,9fr)]">
      <aside aria-label="Bandejas de revisión">
        <div className="rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
          <h2 className="type-h5 text-[var(--text-primary)]">Bandejas</h2>
          <ul className="mt-3 space-y-1">
            {BANDEJAS.map((b) => {
              const n = resumen ? resumen[b.clave] : undefined;
              const activa = vista === b.id;
              return (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setCargando(true);
                      setVista(b.id);
                    }}
                    aria-current={activa ? "true" : undefined}
                    className={`flex w-full items-center justify-between gap-3 rounded-[6px] px-3 py-2 text-left text-sm transition-colors ${
                      activa
                        ? "bg-[var(--musgo-50)] font-semibold text-[var(--musgo-ink)]"
                        : "text-[var(--text-secondary)] hover:bg-[var(--musgo-50)]"
                    }`}
                  >
                    <span>{b.label}</span>
                    <span className="tnum text-xs text-[var(--text-muted)]">{n ?? "–"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 border-t border-[var(--border-subtle)] pt-3 text-xs text-[var(--text-muted)]">
            Total en el municipio: <span className="tnum">{resumen?.total ?? "–"}</span>
          </p>
        </div>

        <div className="mt-4 rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
          <label htmlFor="review-token" className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">
            Token de revisión
          </label>
          <input
            id="review-token"
            type="password"
            value={token}
            onChange={(e) => guardarToken(e.target.value)}
            className="input w-full"
            placeholder="INCIDEAS_REVIEW_TOKEN"
            autoComplete="off"
          />
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Necesario para validar. Se guarda solo en este navegador.
          </p>
        </div>
      </aside>

      <div>
        {mensaje && (
          <p
            role={mensaje.tipo === "error" ? "alert" : "status"}
            className={`mb-4 rounded-[6px] p-3 text-sm ${
              mensaje.tipo === "error"
                ? "bg-[var(--rupestre-50)] text-[var(--rupestre)]"
                : "bg-[var(--conifera-50)] text-[var(--conifera-ink)]"
            }`}
          >
            {mensaje.texto}
          </p>
        )}

        <div className="overflow-x-auto rounded-[6px] border border-[var(--border-subtle)]">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Registros de la bandeja seleccionada</caption>
            <thead className="bg-[var(--bg-subtle)]">
              <tr>
                <th scope="col" className="px-4 py-2 font-semibold text-[var(--text-primary)]">Nombre</th>
                <th scope="col" className="px-4 py-2 font-semibold text-[var(--text-primary)]">Categoría</th>
                <th scope="col" className="px-4 py-2 font-semibold text-[var(--text-primary)]">Fuente</th>
                <th scope="col" className="px-4 py-2 font-semibold text-[var(--text-primary)]">Estado</th>
                <th scope="col" className="px-4 py-2 font-semibold text-[var(--text-primary)]">Espacial</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {cargando ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-[var(--text-muted)]">Cargando…</td>
                </tr>
              ) : registros.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-[var(--text-muted)]">
                    Sin registros en esta bandeja.
                  </td>
                </tr>
              ) : (
                registros.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        onClick={() => setSeleccion(r)}
                        className="text-left font-medium text-[var(--text-primary)] underline-offset-2 hover:underline"
                      >
                        {r.nombre_oficial}
                      </button>
                    </td>
                    <td className="px-4 py-2 text-[var(--text-secondary)]">{r.categoria}</td>
                    <td className="px-4 py-2 text-[var(--text-secondary)]">{r.fuente_principal}</td>
                    <td className="px-4 py-2 text-[var(--text-secondary)]">{r.estado_validacion}</td>
                    <td className="px-4 py-2 text-[var(--text-secondary)]">{r.estado_espacial ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {seleccion && (
          <section
            aria-label="Detalle del registro"
            className="mt-6 rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5"
          >
            <div className="flex items-start justify-between gap-4">
              <h3 className="type-h5 text-[var(--text-primary)]">{seleccion.nombre_oficial}</h3>
              <button type="button" onClick={() => setSeleccion(null)} className="btn btn-ghost text-sm">
                Cerrar
              </button>
            </div>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <Dato k="Categoría" v={seleccion.categoria} />
              <Dato k="Subcategoría" v={seleccion.subcategoria} />
              <Dato k="Fuente" v={seleccion.fuente_principal} />
              <Dato k="id_origen" v={seleccion.id_origen} />
              <Dato k="Dirección" v={seleccion.direccion} />
              <Dato k="Teléfono" v={seleccion.telefono_publico} />
              <Dato
                k="Coordenadas"
                v={seleccion.coordenadas ? `${seleccion.coordenadas.lat}, ${seleccion.coordenadas.lng}` : undefined}
              />
              <Dato k="Fecha del dato" v={seleccion.fecha_dato} />
              <Dato k="Licencia" v={seleccion.licencia} />
              <Dato k="Estado" v={seleccion.estado_validacion} />
            </dl>

            {seleccion.procedencia_atributos && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-semibold text-[var(--text-primary)]">
                  Procedencia por atributo
                </summary>
                <ul className="mt-2 space-y-1 text-xs text-[var(--text-secondary)]">
                  {Object.entries(seleccion.procedencia_atributos).map(([campo, p]) => (
                    <li key={campo}>
                      <span className="font-medium">{campo}</span>: {p.fuente} · {p.metodo} ·{" "}
                      {p.fecha_consulta?.slice(0, 10)}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              {ACCIONES.map((a) => (
                <button
                  key={a.accion}
                  type="button"
                  onClick={() => ejecutarAccion(a.accion, { unidad_validadora: "INCideas" })}
                  className="btn btn-secondary text-sm"
                >
                  {a.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  const obs = window.prompt("Observación:");
                  if (obs) ejecutarAccion("observar", { observaciones: obs });
                }}
                className="btn btn-ghost text-sm"
              >
                Observar
              </button>
              <button
                type="button"
                onClick={() => ejecutarAccion("confirmar_baja", { observaciones: "Baja confirmada" })}
                className="btn btn-ghost text-sm text-[var(--rupestre)]"
              >
                Confirmar baja
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function Dato({ k, v }: { k: string; v?: string | null }) {
  return (
    <div>
      <dt className="text-xs text-[var(--text-muted)]">{k}</dt>
      <dd className="text-sm text-[var(--text-primary)]">{v ?? "—"}</dd>
    </div>
  );
}
