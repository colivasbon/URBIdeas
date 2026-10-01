"use client";

import { useState } from "react";

interface ImportacionManualProps {
  codigoINE: string;
  categoria: string;
}

export default function ImportacionManual({ codigoINE, categoria }: ImportacionManualProps) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState<{
    tipo: "exito" | "error";
    mensaje: string;
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!archivo) return;

    setCargando(true);
    setResultado(null);

    try {
      const formData = new FormData();
      formData.append("archivo", archivo);
      formData.append("codigo_ine", codigoINE);
      formData.append("categoria", categoria);

      const res = await fetch("/api/incideas/importar", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();

      if (!res.ok) {
        setResultado({ tipo: "error", mensaje: json.error ?? "Error en la importación" });
      } else {
        setResultado({
          tipo: "exito",
          mensaje: `Importación registrada. Estado: ${json.importacion.estado}`,
        });
      }
    } catch (error) {
      setResultado({
        tipo: "error",
        mensaje: error instanceof Error ? error.message : "Error de conexión",
      });
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5">
      <h3 className="type-h5 text-[var(--text-primary)]">Importación manual</h3>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">
        Suba un archivo XLSX o CSV con los datos de la categoría. El sistema validará la estructura
        y detectará duplicados antes de publicar.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label htmlFor="archivo-importacion" className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">
            Archivo (XLSX, CSV)
          </label>
          <input
            id="archivo-importacion"
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-[var(--text-secondary)] file:mr-4 file:rounded-[6px] file:border-0 file:bg-[var(--musgo-50)] file:px-4 file:py-2 file:text-sm file:font-medium file:text-[var(--musgo-ink)] hover:file:bg-[var(--musgo-100)]"
          />
        </div>

        <button
          type="submit"
          disabled={!archivo || cargando}
          className="btn btn-primary disabled:opacity-45"
        >
          {cargando ? "Procesando…" : "Importar"}
        </button>
      </form>

      {resultado && (
        <div
          role={resultado.tipo === "error" ? "alert" : "status"}
          className={`mt-4 rounded-[6px] p-4 text-sm ${
            resultado.tipo === "error"
              ? "bg-[var(--rupestre-50)] text-[var(--rupestre)]"
              : "bg-[var(--conifera-50)] text-[var(--conifera-ink)]"
          }`}
        >
          {resultado.mensaje}
        </div>
      )}
    </div>
  );
}
