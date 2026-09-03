"use client";

import { useState } from "react";

// Copia una tabla en DOS formatos: text/html (tabla real que Word y Excel
// convierten en tabla nativa con formato) y text/plain TSV como alternativa.
// Solo con texto plano, Word pega líneas sueltas en vez de tabla.
export default function CopyTableButton({ tableId, label }: { tableId: string; label: string }) {
  const [estado, setEstado] = useState<"idle" | "ok" | "error">("idle");

  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const copiar = async () => {
    try {
      const table = document.getElementById(tableId);
      if (!table) throw new Error("Tabla no encontrada");
      const rows = [...table.querySelectorAll("tr")];
      const tsv = rows
        .map((row) =>
          [...row.querySelectorAll("th, td")]
            .map((c) => (c.textContent ?? "").trim().replace(/\s+/g, " "))
            .join("\t"),
        )
        .join("\n");
      const html =
        `<table border="1" cellpadding="4" cellspacing="0"><tbody>` +
        rows
          .map((row) => {
            const tag = row.querySelector("th") ? "th" : "td";
            const cells = [...row.querySelectorAll("th, td")]
              .map((c) => `<${tag}>${esc((c.textContent ?? "").trim().replace(/\s+/g, " "))}</${tag}>`)
              .join("");
            return `<tr>${cells}</tr>`;
          })
          .join("") +
        `</tbody></table>`;

      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([tsv], { type: "text/plain" }),
          }),
        ]);
      } else if (navigator.clipboard?.writeText) {
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
