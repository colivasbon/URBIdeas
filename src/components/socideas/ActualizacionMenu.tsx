"use client";

import { useEffect, useRef, useState } from "react";
import type { MunicipalUpdatePreview } from "@/lib/socideas-ine-layers";

/**
 * Menú interno `Actualizar datos`: vive JUNTO a Descargar XLSX en la barra
 * operativa de la ficha (no dentro de cards ni tablas). Visible SOLO en entorno
 * interno; fuera de él no renderiza nada.
 *
 * Seguridad (documentada): el proyecto no dispone de un sistema real de
 * autenticación de usuarios. Por eso el botón nunca aparece en producción, todo
 * es dry-run y la ejecución real exige la cabecera `x-sync-token` en servidor
 * (que el navegador nunca posee). No se crea falsa seguridad con la variable
 * pública: solo controla la visibilidad.
 */
export default function ActualizacionMenu({
  codigoINE,
  ultimaDemografia,
  ultimaEconomia,
  capasPreview = null,
}: {
  codigoINE: string;
  ultimaDemografia?: string | null;
  ultimaEconomia?: string | null;
  capasPreview?: MunicipalUpdatePreview | null;
}) {
  const isInternal = process.env.NEXT_PUBLIC_SOCIDEAS_INTERNAL === "true";
  const [abierto, setAbierto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmandoCapas, setConfirmandoCapas] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setAbierto(false); setConfirmandoCapas(false); btnRef.current?.focus(); }
    };
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setAbierto(false);
        setConfirmandoCapas(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [abierto]);

  if (!isInternal) return null;

  const accionar = async (accion: "demografia" | "economia" | "provisional" | "capas") => {
    if (accion === "demografia") {
      setMsg("Demografía: actualización real disponible desde la herramienta interna autorizada. Esta vista no ejecuta escrituras (dry-run planificado, alcance solo este municipio).");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      if (accion === "capas") {
        // dry-run por defecto; sin x-sync-token en el navegador el servidor responde 401.
        const res = await fetch(`/api/socideas/admin/ine-layers/${codigoINE}?dryRun=true`, {
          method: "POST",
        });
        if (res.status === 401) {
          setMsg("No autorizado. La actualización real de capas solo se ejecuta desde la herramienta interna con autorización de servidor.");
        } else {
          const j = (await res.json()) as { data?: { dryRun?: boolean; preview?: MunicipalUpdatePreview }; error?: string };
          const blocked = j.data?.preview?.blockedReason;
          setMsg(blocked ?? "Vista previa preparada. No se ha escrito nada.");
        }
      } else {
        const res = await fetch(
          accion === "provisional"
            ? `/api/socideas/sync-economia/${codigoINE}?dryRun=true&provisional=true`
            : `/api/socideas/sync-economia/${codigoINE}?dryRun=true`,
          { method: "POST" },
        );
        const j = (await res.json()) as { data?: { motivo?: string; registros_actualizados?: number; estado?: string }; error?: string };
        if (!res.ok) {
          setMsg(j.error ?? "No autorizado. Actualización real disponible desde la herramienta interna autorizada.");
        } else if (accion === "provisional") {
          setMsg(j.data?.motivo ?? "No hay fuente provisional configurada para economía. Se conserva el último dato consolidado.");
        } else {
          setMsg(`Dry-run Economía ${codigoINE}: ${j.data?.registros_actualizados ?? 0} registros, estado ${j.data?.estado ?? "—"}. Sin escrituras en R2 ni Supabase.`);
        }
      }
    } catch {
      setMsg("Error de red. No se ha ejecutado ninguna actualización.");
    } finally {
      setBusy(false);
    }
  };

  const itemCls =
    "flex w-full flex-col gap-0.5 rounded-lg px-3 py-2 text-left text-xs hover:bg-[var(--color-input-bg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)] disabled:opacity-50";

  const municipio = capasPreview?.municipalityName ?? codigoINE;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        onClick={() => { setAbierto((v) => !v); setMsg(null); setConfirmandoCapas(false); }}
        title="Acciones internas de actualización (dry-run, sin escrituras)"
        className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-card-bg)] px-4 py-2 text-xs font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-input-bg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]"
      >
        Actualizar datos
        <span aria-hidden="true" className={`transition-transform ${abierto ? "rotate-180" : ""}`}>▾</span>
      </button>
      {abierto && (
        <div
          role="menu"
          aria-label={`Acciones internas · ${codigoINE}`}
          className="premium-card absolute right-0 z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] p-2"
        >
          {capasPreview && (
            <div className="rounded-lg bg-[var(--color-input-bg)] p-3 text-[11px] text-[var(--color-text-secondary)]">
              <p className="font-semibold text-[var(--color-text-primary)]">Qué puede actualizar · {municipio}</p>
              <p className="mt-1">Última carga: {capasPreview.lastLoadedAt ?? "—"}</p>
              <ul className="mt-2 flex flex-col gap-1">
                {capasPreview.layers.length === 0 && <li>Sin capas INE laterales cargadas.</li>}
                {capasPreview.layers.map((l) => (
                  <li key={l.id} className="flex flex-wrap justify-between gap-1">
                    <span>{l.label}</span>
                    <span className="tabular-nums text-[var(--color-text-muted)]">
                      {l.period ?? "—"} · {l.provisional ? "provisional" : l.definitive ? "definitivo" : "no consolidado"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button type="button" role="menuitem" disabled={busy} onClick={() => { setConfirmandoCapas(true); setMsg(null); }} className={itemCls}>
            <span className="font-semibold text-[var(--color-text-primary)]">Actualizar capas INE (este municipio)</span>
            <span className="text-[var(--color-text-muted)]">Dry-run · solo el municipio abierto · sin escrituras</span>
          </button>
          <button type="button" role="menuitem" disabled={busy} onClick={() => accionar("demografia")} className={itemCls}>
            <span className="font-semibold text-[var(--color-text-primary)]">Actualizar Demografía (dry-run)</span>
            <span className="text-[var(--color-text-muted)]">Alcance: este municipio · Última ref.: {ultimaDemografia ?? "—"}</span>
          </button>
          <button type="button" role="menuitem" disabled={busy} onClick={() => accionar("economia")} className={itemCls}>
            <span className="font-semibold text-[var(--color-text-primary)]">{busy ? "Comprobando…" : "Actualizar Economía (dry-run)"}</span>
            <span className="text-[var(--color-text-muted)]">Alcance: este municipio · Última ref.: {ultimaEconomia ?? "—"}</span>
          </button>
          <button type="button" role="menuitem" disabled={busy} onClick={() => accionar("provisional")} className={itemCls}>
            <span className="font-semibold text-[var(--color-text-primary)]">Comprobar provisionales</span>
            <span className="text-[var(--color-text-muted)]">Nunca sobrescribe el consolidado</span>
          </button>
          {confirmandoCapas ? (
            <div className="m-2 rounded-lg border border-[var(--color-border)] p-3 text-[11px] text-[var(--color-text-secondary)]">
              <p>
                Actualizar los datos de {municipio} ({codigoINE}) desde las fuentes configuradas.
                No se sobrescribirán datos publicados sin crear una versión de rollback.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => { setConfirmandoCapas(false); void accionar("capas"); }}
                  className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-[11px] font-semibold text-white"
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmandoCapas(false)}
                  className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-[11px] font-semibold"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <p className="px-3 pb-1 pt-2 text-[11px] text-[var(--color-text-muted)]">
              Escritura real: no activada en esta versión. Dry-run por defecto.
            </p>
          )}
          {msg && (
            <p role="status" className="m-2 rounded-lg bg-[var(--color-input-bg)] p-3 text-xs text-[var(--color-text-secondary)]">
              {msg}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
