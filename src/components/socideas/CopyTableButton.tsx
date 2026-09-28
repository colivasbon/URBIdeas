"use client";

import { useState } from "react";

// Copia una tabla en DOS formatos: text/html (tabla real que Word y Excel
// convierten en tabla nativa con formato) y text/plain TSV como alternativa.
// Solo con texto plano, Word pega líneas sueltas en vez de tabla.
export default function CopyTableButton({ tableId, label, className }: { tableId: string; label: string; className?: string }) {
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
      className={className ?? "btn btn-secondary btn-sm"}
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
        {estado === "ok" ? (
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
        )}
      </svg>
      {estado === "ok" ? "Tabla copiada" : estado === "error" ? "No se ha podido copiar" : label}
    </button>
  );
}
