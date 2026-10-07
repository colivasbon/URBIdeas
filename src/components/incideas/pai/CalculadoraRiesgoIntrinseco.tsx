"use client";

import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Badge from "@/components/ui/Badge";
import {
  NIVELES_QS,
  OPCIONES_R,
  SECTORES_PSF,
  calcularRiesgoIntrinseco,
  entradaPorDefecto,
  fmtNum,
  type EntradaRiesgo,
} from "@/lib/incideas/pai/riesgo-intrinseco";
import { copiarTablas } from "./copiarTabla";

const variantePorRiesgo = { Bajo: "success", Medio: "muted", Alto: "danger" } as const;

/** «21.502,04» y «21502.04» → 21502.04; con coma, los puntos son separadores de miles. */
function numero(v: string): number {
  const s = v.trim().replace(/\s/g, "");
  const miles = /^\d{1,3}(\.\d{3})+$/.test(s);
  const n = Number(s.includes(",") || miles ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Valor del input tal y como lo escribe el usuario (admite coma decimal). */
function useCampo(inicial: number) {
  return useState(inicial ? String(inicial).replace(".", ",") : "");
}

export default function CalculadoraRiesgoIntrinseco() {
  const sp = useSearchParams();
  const [nombre, setNombre] = useState(sp?.get("nombre") ?? "");
  const [potencia, setPotencia] = useCampo(Number(sp?.get("potencia") ?? 0));
  const [cts, setCts] = useCampo(Number(sp?.get("cts") ?? 1));
  const [areas, setAreas] = useState<Record<string, string>>(() => {
    const sup = Number(sp?.get("superficie") ?? 0);
    return Object.fromEntries(SECTORES_PSF.map((s) => [s.clave, s.clave === "campo_solar" && sup > 0 ? String(sup).replace(".", ",") : ""]));
  });
  const [rs, setRs] = useState<Record<string, number>>(() => Object.fromEntries(SECTORES_PSF.map((s) => [s.clave, s.rPorDefecto])));
  const [abierto, setAbierto] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [descargando, setDescargando] = useState(false);
  const tablaSectores = useRef<HTMLTableElement>(null);
  const tablaValoracion = useRef<HTMLTableElement>(null);

  const entrada: EntradaRiesgo = useMemo(() => {
    const e = entradaPorDefecto(nombre.trim(), numero(potencia), numero(cts));
    for (const s of SECTORES_PSF) e.sectores[s.clave] = { area: numero(areas[s.clave] ?? ""), r: rs[s.clave] };
    return e;
  }, [nombre, potencia, cts, areas, rs]);

  const resultado = useMemo(() => calcularRiesgoIntrinseco(entrada), [entrada]);
  const presentes = resultado.sectores.filter((s) => s.presente);
  const faltaPotencia = presentes.some((s) => s.definicion.escala === "potencia") && entrada.potenciaMW <= 0;
  const listo = presentes.length > 0 && !faltaPotencia;

  async function copiar() {
    const ok = await copiarTablas([tablaSectores.current, tablaValoracion.current]);
    setAviso(ok ? "Tablas copiadas. Pégalas en Word con Ctrl+V." : "No se pudo acceder al portapapeles.");
    setTimeout(() => setAviso(null), 4000);
  }

  async function descargar() {
    setDescargando(true);
    try {
      const r = await fetch("/api/incideas/pai/riesgo-intrinseco", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entrada),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "Error al generar el XLSX");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `riesgo_intrinseco_${(nombre || "instalacion").replace(/[^\wáéíóúñü-]+/gi, "_")}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setAviso(err instanceof Error ? err.message : "Error al generar el XLSX");
    } finally {
      setDescargando(false);
    }
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
      {/* Datos de entrada */}
      <section aria-labelledby="datos" className="rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 sm:p-6">
        <h2 id="datos" className="type-h4 text-[var(--text-primary)]">Datos de la instalación</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <label htmlFor="ri-nombre" className="field-label">Nombre del proyecto</label>
            <input id="ri-nombre" className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="PSF Talega" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="ri-potencia" className="field-label">Potencia instalada (MW)</label>
            <input id="ri-potencia" className="input" inputMode="decimal" value={potencia} onChange={(e) => setPotencia(e.target.value)} placeholder="1,6" aria-invalid={faltaPotencia} />
          </div>
          <div>
            <label htmlFor="ri-cts" className="field-label">Nº de CT</label>
            <input id="ri-cts" className="input" inputMode="numeric" value={cts} onChange={(e) => setCts(e.target.value)} placeholder="1" />
          </div>
        </div>

        <h3 className="text-base font-semibold mt-7 text-[var(--text-primary)]">Sectores de incendio</h3>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Indica la superficie de cada sector existente. Los sectores sin superficie no se incluyen en la valoración.
        </p>
        <div className="mt-4 space-y-3">
          {SECTORES_PSF.map((s) => (
            <div key={s.clave} className="grid grid-cols-[minmax(0,1fr)_7.5rem_5.5rem] items-end gap-3">
              <div className="min-w-0 pb-2.5">
                <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                  <span className="text-[var(--text-muted)]">S{s.id}</span> {s.nombre}
                </p>
              </div>
              <div>
                <label htmlFor={`ri-a-${s.clave}`} className="field-label">Superficie (m²)</label>
                <input
                  id={`ri-a-${s.clave}`}
                  className="input"
                  inputMode="decimal"
                  value={areas[s.clave]}
                  onChange={(e) => setAreas((a) => ({ ...a, [s.clave]: e.target.value }))}
                  placeholder="—"
                />
              </div>
              <div>
                <label htmlFor={`ri-r-${s.clave}`} className="field-label">R</label>
                <select
                  id={`ri-r-${s.clave}`}
                  className="input"
                  value={rs[s.clave]}
                  onChange={(e) => setRs((r) => ({ ...r, [s.clave]: Number(e.target.value) }))}
                >
                  {OPCIONES_R.map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {String(o.valor).replace(".", ",")}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>

        <details className="mt-6 text-sm text-[var(--text-secondary)]">
          <summary className="cursor-pointer font-medium text-[var(--text-primary)]">Criterios del coeficiente R y escalado</summary>
          <ul className="mt-3 space-y-2">
            {OPCIONES_R.map((o) => (
              <li key={o.valor}>
                <span className="font-medium text-[var(--text-primary)]">R = {String(o.valor).replace(".", ",")}.</span> {o.descripcion}
              </li>
            ))}
            <li>
              Campo solar, grupo electrógeno y sala de celdas escalan con la potencia instalada (kg/MW); las estaciones de potencia,
              con el número de CT; el edificio de control y el almacén, con la superficie cuando supera 10 m².
            </li>
          </ul>
        </details>
      </section>

      {/* Resultados */}
      <section aria-labelledby="resultado" className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="resultado" className="type-h4 text-[var(--text-primary)]">Valoración (R.D. 164/2025)</h2>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-secondary btn-sm" onClick={copiar} disabled={!listo}>
              Copiar tablas para Word
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={descargar} disabled={!listo || descargando}>
              {descargando ? "Generando…" : "Descargar XLSX"}
            </button>
          </div>
        </div>
        {aviso && (
          <p role="status" className="mt-3 rounded-[6px] bg-[var(--surface-note)] px-4 py-2 text-sm text-[var(--text-primary)]">
            {aviso}
          </p>
        )}

        {!listo ? (
          <div className="mt-5 rounded-[6px] border border-dashed border-[var(--border-default)] p-8 text-center text-sm text-[var(--text-secondary)]">
            {faltaPotencia ? "Indica la potencia instalada para calcular los sectores que escalan por MW." : "Introduce la superficie de al menos un sector para obtener la valoración."}
          </div>
        ) : (
          <>
            <div className="data-table-wrap mt-5">
              <table ref={tablaSectores} className="data-table" data-titulo="Tabla. Sectores de riesgo en la instalación. Fuente: Ideas Medioambientales.">
                <thead>
                  <tr>
                    <th>Sector</th>
                    <th>Descripción</th>
                    <th className="num">Superficie (m²)</th>
                  </tr>
                </thead>
                <tbody>
                  {presentes.map((s) => (
                    <tr key={s.definicion.clave}>
                      <td className="whitespace-nowrap">SECTOR {s.definicion.id}</td>
                      <td>{s.definicion.nombreInforme}</td>
                      <td className="num" data-alinear="right">{fmtNum(s.area)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="data-table-wrap mt-5">
              <table ref={tablaValoracion} className="data-table" data-titulo="Tabla. Valoración de riesgo intrínseco de la instalación atendiendo a R.D. 164/2025. Fuente: Ideas Medioambientales.">
                <thead>
                  <tr>
                    <th>Sector</th>
                    <th>Descripción</th>
                    <th className="num">Área (m²)</th>
                    <th className="num">Densidad calorífica (MJ/m²)</th>
                    <th>Nivel de riesgo</th>
                  </tr>
                </thead>
                <tbody>
                  {presentes.map((s) => (
                    <tr key={s.definicion.clave}>
                      <td className="whitespace-nowrap">SECTOR {s.definicion.id}</td>
                      <td>{s.definicion.nombreInforme}</td>
                      <td className="num" data-alinear="right">{fmtNum(s.area)}</td>
                      <td className="num" data-alinear="right">{fmtNum(s.qs ?? 0)}</td>
                      <td data-alinear="center">
                        <Badge variant={variantePorRiesgo[s.nivel!.riesgo]}>{s.nivel!.riesgo}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {resultado.global && (
              <p className="mt-5 max-w-[70ch] text-[var(--text-primary)]">
                En conclusión, el riesgo intrínseco global de la instalación{nombre ? ` ${nombre}` : ""} se clasifica como{" "}
                <strong>{resultado.global.riesgo.toLowerCase()}</strong> (nivel {resultado.global.nivel}, {resultado.global.rango} MJ/m²).
              </p>
            )}

            <h3 className="text-base font-semibold mt-8 text-[var(--text-primary)]">Detalle de carga de fuego por sector</h3>
            <div className="mt-3 divide-y divide-[var(--border-subtle)] rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
              {presentes.map((s) => {
                const abiertoSector = abierto === s.definicion.clave;
                return (
                  <div key={s.definicion.clave}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left text-sm hover:bg-[var(--surface-hover)]"
                      aria-expanded={abiertoSector}
                      onClick={() => setAbierto(abiertoSector ? null : s.definicion.clave)}
                    >
                      <span className="font-medium text-[var(--text-primary)]">
                        Sector {s.definicion.id} · {s.definicion.nombre}
                      </span>
                      <span className="text-[var(--text-secondary)]">
                        Σ qi·Ci·Gi = {fmtNum(s.cargaTotalMJ)} MJ · R {String(s.r).replace(".", ",")}
                      </span>
                    </button>
                    {abiertoSector && (
                      <div className="data-table-wrap mx-4 mb-4">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Material</th>
                              <th>Ubicación</th>
                              <th className="num">{s.definicion.unidadCantidad}</th>
                              <th className="num">qi (MJ/kg)</th>
                              <th className="num">Ci</th>
                              <th className="num">Gi (kg)</th>
                              <th className="num">qi·Ci·Gi (MJ)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {s.materiales.map((m) => (
                              <tr key={m.material + m.ubicacion}>
                                <td>{m.material}</td>
                                <td className="meta">{m.ubicacion}</td>
                                <td className="num">{fmtNum(m.cantidadTipo)}</td>
                                <td className="num">{m.q === null ? "—" : fmtNum(m.q)}</td>
                                <td className="num">{m.ci === null ? "—" : fmtNum(m.ci)}</td>
                                <td className="num">{fmtNum(m.cantidadKg)}</td>
                                <td className="num">{m.cargaMJ === null ? "No combustible" : fmtNum(m.cargaMJ)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <details className="mt-6 text-sm text-[var(--text-secondary)]">
              <summary className="cursor-pointer font-medium text-[var(--text-primary)]">Umbrales de nivel de riesgo intrínseco</summary>
              <div className="data-table-wrap mt-3">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Nivel</th>
                      <th>Riesgo</th>
                      <th>Densidad de carga de fuego (MJ/m²)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {NIVELES_QS.map((n) => (
                      <tr key={n.nivel}>
                        <td>{n.nivel}</td>
                        <td>{n.riesgo}</td>
                        <td>{n.rango}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </section>
    </div>
  );
}
