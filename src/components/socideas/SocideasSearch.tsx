"use client";

import Link from "next/link";
import { useState } from "react";

interface Resultado {
  codigo_ine: string;
  nombre: string;
  poblacion: number | null;
  provincia: { nombre: string; comunidad_autonoma: { nombre: string } } | null;
}

export default function SocideasSearch() {
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [buscado, setBuscado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buscar = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const term = q.trim();
    if (term.length < 2) return;
    setBuscando(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (/^\d{2,5}$/.test(term)) {
        params.set("codigo_ine", term);
      } else {
        params.set("q", term);
      }
      params.set("limit", "20");
      const res = await fetch(`/api/socideas/municipios?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error en la búsqueda");
      setResultados(json.data ?? []);
      setBuscado(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error en la búsqueda");
      setResultados([]);
      setBuscado(true);
    } finally {
      setBuscando(false);
    }
  };

  return (
    <section aria-label="Buscador municipal">
      <form onSubmit={buscar} className="flex flex-col sm:flex-row gap-3" role="search">
        <label htmlFor="socideas-q" className="sr-only">
          Buscar municipio por nombre o código INE
        </label>
        <input
          id="socideas-q"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nombre del municipio o código INE (p. ej. La Roda, 02069)"
          autoComplete="off"
          className="flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-input-bg)] px-4 py-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]"
        />
        <button
          type="submit"
          disabled={buscando || q.trim().length < 2}
          className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-[var(--color-primary)] rounded-xl hover:bg-[var(--color-primary-light)] transition-all disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)]"
        >
          {buscando ? "Buscando…" : "Buscar"}
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-500">
          {error}
        </p>
      )}

      {buscado && !error && (
        <div className="mt-6">
          {resultados.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">
              Sin resultados. Prueba con el nombre oficial o el código INE de 5 dígitos.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--color-border-subtle)] border border-[var(--color-border-subtle)] rounded-[var(--border-radius-lg)]">
              {resultados.map((m) => (
                <li key={m.codigo_ine}>
                  <Link
                    href={`/socideas/${m.codigo_ine}`}
                    className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-[var(--color-input-bg)]/50 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-secondary)] rounded-[var(--border-radius-lg)]"
                  >
                    <span>
                      <span className="block text-sm font-semibold text-[var(--color-text-primary)]">
                        {m.nombre}
                      </span>
                      <span className="block text-xs text-[var(--color-text-muted)]">
                        {m.provincia?.nombre ?? "—"} · {m.provincia?.comunidad_autonoma?.nombre ?? "—"} · INE{" "}
                        {m.codigo_ine}
                      </span>
                    </span>
                    <span aria-hidden="true" className="text-[var(--color-secondary)]">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
