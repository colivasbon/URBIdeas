"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import MunicipioLoadingOverlay from "./MunicipioLoadingOverlay";

interface Resultado {
  codigo_ine: string;
  nombre: string;
  poblacion: number | null;
  provincia: { nombre: string; comunidad_autonoma: { nombre: string } } | null;
}

interface Opcion {
  id: string;
  nombre: string;
}

const selectClasses =
  "w-full rounded-[6px] border border-[var(--color-border)] bg-[var(--color-input-bg)] px-4 py-3 text-sm text-[var(--color-text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss-ink)] disabled:opacity-50";

export default function SocideasSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [ccaa, setCcaa] = useState<Opcion[]>([]);
  const [ccaaId, setCcaaId] = useState("");
  const [provincias, setProvincias] = useState<Opcion[]>([]);
  const [provinciaId, setProvinciaId] = useState("");
  const [municipios, setMunicipios] = useState<Resultado[]>([]);
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [buscado, setBuscado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abriendo, setAbriendo] = useState<Resultado | null>(null);

  useEffect(() => {
    fetch("/api/comunidades")
      .then((r) => r.json())
      .then((j) => setCcaa((j.data ?? []) as Opcion[]))
      .catch(() => setCcaa([]));
  }, []);

  useEffect(() => {
    if (!ccaaId) return;
    fetch(`/api/provincias?comunidad_autonoma_id=${ccaaId}`)
      .then((r) => r.json())
      .then((j) => setProvincias((j.data ?? []) as Opcion[]))
      .catch(() => setProvincias([]));
  }, [ccaaId]);

  useEffect(() => {
    if (!provinciaId) return;
    fetch(`/api/socideas/municipios?provincia_id=${provinciaId}&limit=500`)
      .then((r) => r.json())
      .then((j) => setMunicipios((j.data ?? []) as Resultado[]))
      .catch(() => setMunicipios([]));
  }, [provinciaId]);

  const onCcaaChange = (id: string) => {
    if (abriendo) return;
    // Reinicio en cascada en el manejador (no en efecto).
    setCcaaId(id);
    setProvincias([]);
    setProvinciaId("");
    setMunicipios([]);
  };

  const onProvinciaChange = (id: string) => {
    if (abriendo) return;
    setProvinciaId(id);
    setMunicipios([]);
  };

  const navegarMunicipio = (m: Resultado) => {
    if (abriendo) return;
    setAbriendo(m);
    router.push(`/socideas/${m.codigo_ine}`);
  };

  const onMunicipioSelect = (codigoIne: string) => {
    if (!codigoIne || abriendo) return;
    const m = municipios.find((x) => x.codigo_ine === codigoIne);
    if (!m) return;
    navegarMunicipio(m);
  };

  const onResultadoClick = (m: Resultado) => {
    if (abriendo) return;
    setAbriendo(m);
    // La navegación la realiza <Link>; solo mostramos overlay y bloqueamos nueva selección.
  };

  // Si la navegación no completa (error de red), no bloquear indefinidamente.
  useEffect(() => {
    if (!abriendo) return;
    const t = window.setTimeout(() => setAbriendo(null), 10000);
    return () => window.clearTimeout(t);
  }, [abriendo]);

  const buscar = async (e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    if (abriendo) return;
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
        if (provinciaId) params.set("provincia_id", provinciaId);
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
    <section aria-label="Buscador municipal" className="relative">
      {abriendo && (
        <MunicipioLoadingOverlay
          nombre={abriendo.nombre}
          provincia={abriendo.provincia?.nombre ?? null}
          comunidad={abriendo.provincia?.comunidad_autonoma?.nombre ?? null}
        />
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        <div>
          <label htmlFor="socideas-ccaa" className="mb-1 block text-xs font-semibold text-[var(--color-text-muted)]">
            Comunidad autónoma
          </label>
          <select
            id="socideas-ccaa"
            value={ccaaId}
            onChange={(e) => onCcaaChange(e.target.value)}
            disabled={!!abriendo}
            className={selectClasses}
          >
            <option value="">Todas</option>
            {ccaa.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="socideas-prov" className="mb-1 block text-xs font-semibold text-[var(--color-text-muted)]">
            Provincia
          </label>
          <select
            id="socideas-prov"
            value={provinciaId}
            onChange={(e) => onProvinciaChange(e.target.value)}
            disabled={!ccaaId || !!abriendo}
            className={selectClasses}
          >
            <option value="">{ccaaId ? "Todas" : "Elija antes una comunidad"}</option>
            {provincias.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="socideas-mun" className="mb-1 block text-xs font-semibold text-[var(--color-text-muted)]">
            Municipio
          </label>
          <select
            id="socideas-mun"
            value={abriendo?.codigo_ine ?? ""}
            onChange={(e) => onMunicipioSelect(e.target.value)}
            disabled={!provinciaId || !!abriendo}
            className={selectClasses}
          >
            <option value="">{provinciaId ? `Elegir entre ${municipios.length}` : "Elija antes una provincia"}</option>
            {municipios.map((m) => (
              <option key={m.codigo_ine} value={m.codigo_ine}>
                {m.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      <form onSubmit={buscar} className="flex flex-col sm:flex-row gap-3" role="search">
        <label htmlFor="socideas-q" className="sr-only">
          Buscar municipio por nombre o código INE
        </label>
        <input
          id="socideas-q"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={
            provinciaId
              ? "Nombre dentro de la provincia elegida o código INE"
              : "Municipio o provincia (p. ej. La Roda, Álava, 02069)"
          }
          autoComplete="off"
          disabled={!!abriendo}
          className="flex-1 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-input-bg)] px-4 py-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss-ink)] disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!!abriendo || buscando || q.trim().length < 2}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-[var(--color-primary)] rounded-[6px] hover:bg-[var(--color-primary-light)] transition-all disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss-ink)]"
        >
          {buscando ? "Buscando…" : "Buscar"}
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-4 text-sm socideas-error-text">
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
                    onClick={() => onResultadoClick(m)}
                    aria-disabled={!!abriendo}
                    className={`flex items-center justify-between gap-4 px-5 py-4 hover:bg-[var(--color-input-bg)]/50 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss-ink)] rounded-[var(--border-radius-lg)] ${abriendo ? "pointer-events-none opacity-60" : ""}`}
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
