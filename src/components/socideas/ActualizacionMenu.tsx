"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Menú interno `Actualizar datos`: vive JUNTO a Descargar XLSX en la barra
 * operativa de la ficha (no dentro de cards ni tablas). Visible SOLO en entorno
 * interno; fuera de él no renderiza nada. Todo es dry-run o estado preparado:
 * cero escrituras R2/Supabase, cero tokens en cliente, sin fingir actualización.
 */
export default function ActualizacionMenu({
  codigoINE,
  ultimaDemografia,
  ultimaEconomia,
}: {
  codigoINE: string;
  ultimaDemografia?: string | null;
  ultimaEconomia?: string | null;
}) {
  const isInternal = process.env.NEXT_PUBLIC_SOCIDEAS_INTERNAL === "true";
  const [abierto, setAbierto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setAbierto(false); btnRef.current?.focus(); }
    };
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [abierto]);

  if (!isInternal) return null;

  const accionar = async (accion: "demografia" | "economia" | "provisional") => {
    if (accion === "demografia") {
      setMsg("Demografía: actualización real disponible desde la herramienta interna autorizada. Esta vista no ejecuta escrituras (dry-run planificado, alcance solo este municipio).");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
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
    } catch {
      setMsg("Error de red. No se ha ejecutado ninguna actualización.");
    } finally {
      setBusy(false);
    }
  };

  const itemCls =
    "flex w-full flex-col gap-0.5 rounded-lg px-3 py-2 text-left text-xs hover:bg-[var(--color-input-bg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)] disabled:opacity-50";

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={abierto}
        onClick={() => { setAbierto((v) => !v); setMsg(null); }}
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
          <p className="px-3 pb-1 pt-2 text-[11px] text-[var(--color-text-muted)]">
            Escritura real: no activada en esta versión. Dry-run por defecto.
          </p>
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
