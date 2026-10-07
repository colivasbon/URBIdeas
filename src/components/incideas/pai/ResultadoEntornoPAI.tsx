"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { ElementoCercano, ResultadoEntorno } from "@/lib/incideas/pai/entorno";
import { fmtDistancia } from "@/lib/incideas/pai/geo";
import { copiarTablas } from "./copiarTabla";

interface Props {
  resultado: ResultadoEntorno;
  nombre: string;
}

const nf = (n: number, d = 0) => n.toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: "always" as unknown as boolean });

function Casilla({ marcada, onCambio, children }: { marcada: boolean; onCambio: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onCambio}
      aria-pressed={marcada}
      className="inline-flex items-center gap-2 rounded-[6px] px-1 text-left hover:bg-[var(--surface-hover)]"
      title="Clic para cambiar"
    >
      <span aria-hidden="true">{marcada ? "☒" : "☐"}</span>
      <span>{children}</span>
    </button>
  );
}

/** Celda de texto editable (cada frase en su línea), para ajustar la redacción antes de copiar. */
function Lineas({ textos, vacio }: { textos: string[]; vacio: string }) {
  const lineas = textos.length ? textos : [vacio];
  return (
    <div contentEditable suppressContentEditableWarning className="space-y-1 outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)]">
      {lineas.map((t, i) => (
        <p key={i}>{t}</p>
      ))}
    </div>
  );
}

const donde = (m: ElementoCercano) => `${fmtDistancia(m.distancia, true)}${m.rumbo ? ` al ${m.rumbo}` : ""}`;

const frases = (els: ElementoCercano[]) => els.map((e) => e.frase);

function rangoMinutos(min: number): string {
  const desde = Math.max(5, Math.floor(min / 5) * 5);
  return `${desde}-${desde + 5}`;
}

export default function ResultadoEntornoPAI({ resultado: r, nombre }: Props) {
  const [tipologia, setTipologia] = useState(r.tipologia);
  const [espacios, setEspacios] = useState(r.espacios.si);
  const [forestal, setForestal] = useState(r.masaForestal.si);
  const [cauces, setCauces] = useState(r.cauces.si);
  const [aviso, setAviso] = useState<string | null>(null);
  const tUbicacion = useRef<HTMLTableElement>(null);
  const tEntorno = useRef<HTMLTableElement>(null);
  const tAccesos = useRef<HTMLTableElement>(null);
  const tDirectorio = useRef<HTMLTableElement>(null);

  async function copiar(tablas: (HTMLTableElement | null)[]) {
    const ok = await copiarTablas(tablas);
    setAviso(ok ? "Copiado. Pégalo en Word con Ctrl+V." : "No se pudo acceder al portapapeles.");
    setTimeout(() => setAviso(null), 4000);
  }

  const u = r.ubicacion;
  const bomberos = r.mediosExternos.filter((m) => m.categoria === "bomberos");
  const parque = bomberos[0];
  const directorio: { entidad: string; telefono: string }[] = [
    { entidad: "Emergencias", telefono: "112" },
    ...r.mediosExternos.map((m) => ({
      entidad: m.nombre,
      telefono: m.telefono ?? (m.categoria === "guardia_civil" ? "062" : m.categoria === "policia" ? "091" : "—"),
    })),
  ];

  const filaSiNo = (etiqueta: string, si: boolean, set: (v: boolean) => void, textos: string[], vacio: string) => (
    <>
      <tr>
        <td rowSpan={2} data-aspecto className="font-semibold text-[var(--text-primary)]">
          {etiqueta}
        </td>
        <td data-alinear="center">
          <Casilla marcada={si} onCambio={() => set(!si)}>Sí</Casilla>
        </td>
        <td rowSpan={2} colSpan={3}>
          <Lineas textos={textos} vacio={vacio} />
        </td>
      </tr>
      <tr>
        <td data-alinear="center">
          <Casilla marcada={!si} onCambio={() => set(!si)}>No</Casilla>
        </td>
      </tr>
    </>
  );

  const superficieM2 = u.superficieHa ? Math.round(u.superficieHa * 10000) : null;
  const enlaceRiesgo = `/incideas/pai/riesgo-intrinseco?${new URLSearchParams({
    ...(nombre ? { nombre } : {}),
    ...(superficieM2 ? { superficie: String(superficieM2) } : {}),
  })}`;

  return (
    <section aria-labelledby="res-entorno" className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4 border-t border-[var(--border-subtle)] pt-8">
        <div>
          <p className="type-label text-[var(--moss-ink)]">Resultado</p>
          <h2 id="res-entorno" className="type-h2 mt-1 text-[var(--text-primary)]">
            Entorno de la instalación{nombre ? ` ${nombre}` : ""}
          </h2>
          <p className="mt-2 max-w-[70ch] text-sm text-[var(--text-secondary)]">
            Las casillas y los textos son editables: haz clic para cambiar una casilla o sobre el texto para ajustar la redacción antes de copiar.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => copiar([tUbicacion.current, tEntorno.current, tAccesos.current, tDirectorio.current])}>
            Copiar todo para Word
          </button>
          <Link href={enlaceRiesgo} className="btn btn-secondary btn-sm">
            Calcular riesgo intrínseco
          </Link>
        </div>
      </div>
      {aviso && (
        <p role="status" className="rounded-[6px] bg-[var(--surface-note)] px-4 py-2 text-sm text-[var(--text-primary)]">
          {aviso}
        </p>
      )}
      {r.avisos.length > 0 && (
        <div role="alert" className="rounded-[6px] border border-[var(--rupestre-200,#E1B7B6)] bg-[var(--status-danger-bg)] p-4 text-sm text-[var(--status-danger-fg)]">
          <p className="font-semibold">Fuentes no disponibles en esta consulta (revisa manualmente esos apartados):</p>
          <ul className="mt-1 list-disc pl-5">
            {r.avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Ubicación */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="type-h4 text-[var(--text-primary)]">Ubicación y superficie</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => copiar([tUbicacion.current])}>Copiar</button>
        </div>
        <div className="data-table-wrap mt-3">
          <table ref={tUbicacion} className="data-table" data-titulo="Ubicación de la instalación. Fuente: Ideas Medioambientales.">
            <tbody>
              <tr>
                <td data-aspecto className="w-[34%] font-semibold">Término municipal</td>
                <td>{[u.municipio, u.provincia && `(${u.provincia})`, u.comunidad && `· ${u.comunidad}`].filter(Boolean).join(" ") || "—"}</td>
              </tr>
              <tr>
                <td data-aspecto className="font-semibold">Parcela catastral (centro del ámbito)</td>
                <td>{u.parcelas.length ? u.parcelas.map((p) => `${p.descripcion} · RC ${p.referencia}`).join("; ") : "—"}</td>
              </tr>
              <tr>
                <td data-aspecto className="font-semibold">Coordenadas UTM del centro (ETRS89, huso {u.utm.huso}N)</td>
                <td>X: {nf(u.utm.x)} m · Y: {nf(u.utm.y)} m</td>
              </tr>
              <tr>
                <td data-aspecto className="font-semibold">Altitud</td>
                <td>{u.altitud !== null ? `${nf(u.altitud)} m s.n.m.` : "—"}</td>
              </tr>
              {u.superficieHa !== null && (
                <tr>
                  <td data-aspecto className="font-semibold">Superficie del ámbito</td>
                  <td>{nf(u.superficieHa, 2)} ha</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tabla de entorno (réplica de la tabla de los PAI) */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="type-h4 text-[var(--text-primary)]">Descripción del entorno</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => copiar([tEntorno.current])}>Copiar tabla</button>
        </div>
        <div className="data-table-wrap mt-3">
          <table ref={tEntorno} className="data-table pai-tabla-entorno" data-titulo="Tabla. Descripción entorno de la instalación. Fuente: Ideas Medioambientales.">
            <thead>
              <tr>
                <th className="w-[26%]">ASPECTO</th>
                <th colSpan={4}>DESCRIPCIÓN</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td data-aspecto className="font-semibold">Tipología del entorno</td>
                <td><Casilla marcada={tipologia.urbano} onCambio={() => setTipologia((t) => ({ ...t, urbano: !t.urbano }))}>urbano</Casilla></td>
                <td><Casilla marcada={tipologia.industrial} onCambio={() => setTipologia((t) => ({ ...t, industrial: !t.industrial }))}>industrial</Casilla></td>
                <td><Casilla marcada={tipologia.agricola} onCambio={() => setTipologia((t) => ({ ...t, agricola: !t.agricola }))}>agrícola</Casilla></td>
                <td><Casilla marcada={tipologia.forestal} onCambio={() => setTipologia((t) => ({ ...t, forestal: !t.forestal }))}>forestal</Casilla></td>
              </tr>
              <tr>
                <td data-aspecto className="font-semibold">Distancia al núcleo urbano más próximo</td>
                <td colSpan={4}><Lineas textos={frases(r.nucleos)} vacio="No se localizan núcleos de población en 25 km." /></td>
              </tr>
              <tr>
                <td data-aspecto className="font-semibold">Infraestructuras lineales y energéticas próximas</td>
                <td colSpan={4}><Lineas textos={frases(r.infraestructuras)} vacio="No se localizan infraestructuras lineales próximas." /></td>
              </tr>
              <tr>
                <td data-aspecto className="font-semibold">Instalaciones de generación eléctrica próximas</td>
                <td colSpan={4}><Lineas textos={frases(r.generacion)} vacio="No se localizan instalaciones de generación eléctrica en 5 km." /></td>
              </tr>
              {filaSiNo("Espacios naturales protegidos", espacios, setEspacios, r.espacios.textos, "No se localizan espacios protegidos próximos.")}
              {filaSiNo("Proximidad a masa forestal", forestal, setForestal, r.masaForestal.textos, "No se localiza terreno forestal próximo.")}
              {filaSiNo("Cauces de agua y zonas inundables", cauces, setCauces, r.cauces.textos, "No se localizan cauces próximos.")}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-10 xl:grid-cols-2">
        {/* Accesos */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="type-h4 text-[var(--text-primary)]">Vías de acceso a la zona</h3>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => copiar([tAccesos.current])}>Copiar tabla</button>
          </div>
          <div className="data-table-wrap mt-3">
            <table ref={tAccesos} className="data-table" data-titulo="Tabla. Características de las vías de acceso a la zona. Fuente: Ideas Medioambientales.">
              <thead>
                <tr>
                  <th>Denominación</th>
                  <th>Ancho</th>
                  <th>Sentido</th>
                  <th>Accesibilidad</th>
                </tr>
              </thead>
              <tbody>
                {r.accesos.length ? (
                  r.accesos.map((a) => (
                    <tr key={a.denominacion + a.tipo}>
                      <td>
                        <span contentEditable suppressContentEditableWarning className="outline-none">{a.denominacion}</span>
                        <span data-no-copiar className="ml-2 text-xs text-[var(--text-muted)]">{a.tipo} · {nf(a.distancia)} m</span>
                      </td>
                      <td contentEditable suppressContentEditableWarning data-alinear="center">{a.ancho}</td>
                      <td data-alinear="center">{a.sentido}</td>
                      <td contentEditable suppressContentEditableWarning data-alinear="center">A validar</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4}>No se localizan vías próximas en OpenStreetMap.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-[var(--text-muted)]">Ancho según la etiqueta width de OSM cuando existe; la accesibilidad debe validarse en campo.</p>
        </div>

        {/* Medios externos */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="type-h4 text-[var(--text-primary)]">Coordinación con medios externos</h3>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => copiar([tDirectorio.current])}>Copiar directorio</button>
          </div>
          <div contentEditable suppressContentEditableWarning className="mt-3 space-y-2 text-sm text-[var(--text-primary)] outline-none">
            {parque ? (
              <>
                <p>Para el control o supresión de la emergencia se cuenta con el {parque.nombre}{parque.nombre.toLowerCase().includes("bombero") ? "" : " (parque de bomberos)"}, a {donde(parque)}.</p>
                {parque.ruta && (
                  <p>
                    Se estima que el tiempo de respuesta aproximado sería de entre {rangoMinutos(parque.ruta.minutos)} minutos ({nf(parque.ruta.km, 1)} km por carretera).
                  </p>
                )}
              </>
            ) : (
              <p>No se localizan parques de bomberos en 60 km en OpenStreetMap.</p>
            )}
          </div>
          <div className="data-table-wrap mt-4">
            <table ref={tDirectorio} className="data-table" data-titulo="Teléfonos de ayuda exterior y asistencia sanitaria.">
              <thead>
                <tr>
                  <th>Entidad</th>
                  <th>Distancia</th>
                  <th>Teléfono</th>
                </tr>
              </thead>
              <tbody>
                {directorio.map((d, i) => {
                  const m = i > 0 ? r.mediosExternos[i - 1] : null;
                  return (
                    <tr key={d.entidad + i}>
                      <td contentEditable suppressContentEditableWarning>{d.entidad}</td>
                      <td className="whitespace-nowrap">
                        {m ? `${donde(m)}${m.ruta ? ` · ${m.ruta.minutos} min` : ""}` : "—"}
                      </td>
                      <td contentEditable suppressContentEditableWarning className="whitespace-nowrap">{d.telefono}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Teléfonos de OpenStreetMap cuando están cartografiados; 062 y 091 son los números generales de Guardia Civil y Policía Nacional. Verificar antes de emitir.
          </p>
        </div>
      </div>

      <details className="rounded-[6px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 text-sm text-[var(--text-secondary)]">
        <summary className="cursor-pointer font-medium text-[var(--text-primary)]">Criterios y fuentes</summary>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          {r.criterios.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <ul className="mt-4 space-y-1">
          {r.fuentes.map((f) => (
            <li key={f.nombre}>
              <a href={f.url} target="_blank" rel="noreferrer" className="link">
                {f.nombre}
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-[var(--text-muted)]">Consulta generada el {new Date(r.generado).toLocaleString("es-ES")}.</p>
      </details>
    </section>
  );
}
