"use client";

import { useState } from "react";

/**
 * Acciones internas por bloque (UNA vez por bloque activo, nunca por card/tabla).
 * Seguridad: sin tokens en cliente, sin NEXT_PUBLIC_* como autorización, sin
 * pedir secretos. Dry-run por defecto; escritura real deshabilitada en esta versión.
 * Solo visible en UI interna (NEXT_PUBLIC_SOCIDEAS_INTERNAL === "true").
 */
export default function MunicipioDataActions({
  codigoINE,
  bloque,
  ultimaReferencia,
}: {
  codigoINE: string;
  bloque: "Demografía" | "Economía";
  ultimaReferencia?: string | null;
}) {
  const isInternal = process.env.NEXT_PUBLIC_SOCIDEAS_INTERNAL === "true";
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!isInternal) return null;

  const scope = bloque === "Economía" ? "economia" : "demografia";
  const endpoint =
    scope === "economia"
      ? `/api/socideas/sync-economia/${codigoINE}?dryRun=true`
      : null;

  const runDryRun = async (provisional: boolean) => {
    if (scope === "demografia") {
      setMsg(
        provisional
          ? "Demografía: no hay fuente provisional configurada. Se conserva el último dato consolidado."
          : "Demografía: actualización real disponible desde la herramienta interna autorizada. Esta vista no ejecuta escrituras (dry-run planificado).",
      );
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(
        provisional
          ? `/api/socideas/sync-economia/${codigoINE}?dryRun=true&provisional=true`
          : (endpoint as string),
        { method: "POST" },
      );
      const j = (await res.json()) as { data?: { motivo?: string; registros_actualizados?: number; estado?: string }; error?: string };
      if (!res.ok) {
        setMsg(j.error ?? "No autorizado. Actualización real disponible desde la herramienta interna autorizada.");
      } else if (provisional) {
        setMsg(j.data?.motivo ?? "No hay fuente provisional configurada para economía.");
      } else {
        setMsg(
          `Dry-run Economía ${codigoINE}: ${j.data?.registros_actualizados ?? 0} registros, estado ${j.data?.estado ?? "—"}. Sin escrituras en R2 ni Supabase.`,
        );
      }
    } catch {
      setMsg("Error de red. No se ha ejecutado ninguna actualización.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="premium-card mb-6 p-4 sm:p-5" aria-label={`Acciones internas del bloque ${bloque}`}>
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
        Control interno · {bloque} · {codigoINE}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => runDryRun(false)}
          disabled={busy}
          title={`Comprueba actualización oficial de ${bloque} sin escribir (dry-run)`}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card-bg)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-input-bg)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]"
        >
          {busy ? "Comprobando…" : "Actualizar datos oficiales"}
        </button>
        <button
          type="button"
          onClick={() => runDryRun(true)}
          disabled={busy}
          title={`Consulta fuentes provisionales de ${bloque} sin sobrescribir el consolidado`}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card-bg)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-input-bg)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]"
        >
          Comprobar datos provisionales
        </button>
        <span
          className="inline-flex items-center rounded-xl bg-[var(--color-input-bg)] px-4 py-2 text-xs font-semibold text-[var(--color-text-muted)]"
          title="La escritura real está deshabilitada en esta versión"
        >
          Escritura real: no activada en esta versión
        </span>
      </div>
      <p className="mt-2 text-xs text-[var(--color-text-muted)]">
        Alcance limitado al municipio {codigoINE} y al bloque {bloque}
        {ultimaReferencia ? ` · Última referencia visible: ${ultimaReferencia}` : ""}.
        Dry-run por defecto: no escribe R2 ni Supabase. Provisional nunca sobrescribe consolidado.
      </p>
      {msg && (
        <p role="status" className="mt-3 rounded-lg bg-[var(--color-input-bg)] p-3 text-sm text-[var(--color-text-secondary)]">
          {msg}
        </p>
      )}
    </div>
  );
}
