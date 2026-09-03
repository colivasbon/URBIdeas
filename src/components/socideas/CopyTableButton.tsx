"use client";

import { useState } from "react";

// Copia una tabla HTML al portapapeles en TSV (tabuladores): al pegar en
// Word se convierte directamente en tabla con filas y columnas.
export default function CopyTableButton({ tableId, label }: { tableId: string; label: string }) {
  const [estado, setEstado] = useState<"idle" | "ok" | "error">("idle");

  const copiar = async () => {
    try {
      const table = document.getElementById(tableId);
      if (!table) throw new Error("Tabla no encontrada");
      const lines: string[] = [];
      for (const row of table.querySelectorAll("tr")) {
        const cells = [...row.querySelectorAll("th, td")].map((c) =>
          (c.textContent ?? "").trim().replace(/\s+/g, " "),
        );
        lines.push(cells.join("\t"));
      }
      const tsv = lines.join("\n");
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(tsv);
      } else {
        const ta = document.createElement("textarea");
        ta.value = tsv;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setEstado("ok");
      setTimeout(() => setEstado("idle"), 2500);
    } catch {
      setEstado("error");
      setTimeout(() => setEstado("idle"), 2500);
    }
  };

  return (
    <button
      type="button"
      onClick={copiar}
      aria-live="polite"
      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[var(--color-text-secondary)] bg-[var(--color-input-bg)] border border-[var(--color-border)] rounded-xl hover:text-[var(--color-text-primary)] transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]"
    >
      {estado === "ok" ? "¡Tabla copiada!" : estado === "error" ? "No se pudo copiar" : label}
    </button>
  );
}
