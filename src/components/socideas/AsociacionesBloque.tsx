// Bloque «07 Asociaciones» de la ficha municipal (SOCideas).
// Componente de SERVIDOR, presentacional y sin datos propios: recibe el
// resultado de readAsociacionesMunicipio() (src/lib/socideas-asociaciones.ts).
//
// Estilos: SOLO clases y variables ya existentes (ideas-h2, premium-card,
// premium-skeleton, data-card, --color-*). Sin dependencias nuevas, sin JS de
// cliente. Tablas nativas (copiables a Word/Excel) con <caption> + scope para
// lectores de pantalla; `overflow-x-auto` para scroll horizontal en móvil.
//
// Reglas editoriales:
//  · El aviso de verificación es SIEMPRE visible y no colapsable (role="note").
//  · `sin_datos` nunca se pinta como «0 asociaciones»: se reformula como
//    «Sin datos publicados para este municipio» y se enlaza el registro
//    autonómico de la CCAA correspondiente.
//  · La ausencia de dato se muestra como «—»; nunca como 0.
import type { AsociacionesMunicipio } from "@/lib/socideas-asociaciones";
import StatCard from "./StatCard";

interface AsociacionesBloqueProps {
  data: AsociacionesMunicipio;
  /** Nombre del municipio, solo para el subtítulo editorial. */
  municipio?: string;
}

/** Filas visibles del listado; el listado completo vive en la exportación XLSX. */
const LISTA_VISIBLE = 50;

/** Solo URLs http(s): las fuentes vienen de terceros y se enlazan sin sanitizar. */
function httpSegura(url: string | null | undefined): string | null {
  const u = (url ?? "").trim();
  return /^https?:\/\//i.test(u) ? u : null;
}

function hostDe(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function fmtNumero(n: number): string {
  return Math.max(0, n).toLocaleString("es-ES");
}

function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.slice(0, 10));
  if (!m) return iso;
  const meses = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return iso;
  return `${Number(m[3])} de ${meses[mes - 1]} de ${m[1]}`;
}

function Aviso({ texto }: { texto: string }) {
  return (
    <p
      role="note"
      aria-label="Aviso de verificación del registro de asociaciones"
      className="mt-4 max-w-4xl rounded-[6px] border border-[var(--color-border-subtle)] border-l-4 border-l-[var(--color-secondary)] bg-[var(--color-input-bg)] px-4 py-3 text-xs font-medium leading-relaxed text-[var(--color-text-primary)]"
    >
      <strong>Aviso de verificación. </strong>
      {texto}
    </p>
  );
}

export function AsociacionesBloque({ data, municipio }: AsociacionesBloqueProps) {
  const conDatos = data.estado === "con_datos" && data.total > 0;
  const visibles = conDatos ? data.items.slice(0, LISTA_VISIBLE) : [];
  const fuenteUrl = httpSegura(data.fuenteUrl);
  const buscador = data.buscadorCcaa ? httpSegura(data.buscadorCcaa.url) : null;

  return (
    <section aria-label="Asociaciones inscritas en el registro autonómico" className="mb-10">
      <h2 className="ideas-h2">Asociaciones</h2>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
        Registro autonómico de asociaciones
        {municipio ? ` · ${municipio}` : ""}
        {data.fuenteFecha ? ` · descarga del ${fmtFecha(data.fuenteFecha)}` : ""}
      </p>

      {!conDatos ? (
        <div className="mt-4">
          <p
            role="status"
            className="rounded-[6px] border border-[var(--color-border-subtle)] bg-[var(--color-input-bg)] px-4 py-3 text-sm text-[var(--color-text-primary)]"
          >
            Sin datos publicados para este municipio.
          </p>
          <p className="mt-3 max-w-3xl text-xs leading-relaxed text-[var(--color-text-muted)]">
            SOCideas no ha recuperado registros de este municipio en los registros
            autonómicos con descarga estructurada. Esto no significa que aquí no haya
            asociaciones: significa que no hay datos publicados y comprobables para
            mostrarlos. No se muestra «0» porque no es un hecho verificado.
          </p>
          {buscador && data.buscadorCcaa && (
            <p className="mt-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
              Puede consultarlas en el{" "}
              <a
                href={buscador}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-[var(--color-secondary)]"
              >
                registro de asociaciones de {data.buscadorCcaa.nombre}
              </a>{" "}
              ({hostDe(buscador)}).
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              etiqueta="Total de asociaciones"
              valor={fmtNumero(data.total)}
              detalle="Registros inscritos con este municipio en la fuente"
            />
            <StatCard
              etiqueta="Tipos publicados"
              valor={fmtNumero(data.porTipo.length)}
              detalle="Clasificación del registro autonómico"
            />
            <StatCard
              etiqueta="Listado visible"
              valor={`${fmtNumero(visibles.length)} de ${fmtNumero(data.total)}`}
              detalle="El listado completo se entrega en el XLSX"
            />
          </div>

          <div className="premium-card mt-4 p-4 sm:p-5">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
              Distribución por tipo
            </h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[16rem] text-xs">
                <caption className="sr-only">
                  Número de asociaciones por tipo en {municipio ?? "este municipio"}
                </caption>
                <thead>
                  <tr className="text-left text-[var(--color-text-muted)]">
                    <th scope="col" className="py-1 pr-4 font-semibold">Tipo</th>
                    <th scope="col" className="py-1 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.porTipo.map((t) => (
                    <tr key={t.tipo} className="border-t border-[var(--color-border-subtle)]">
                      <td className="py-1 pr-4 text-[var(--color-text-primary)]">{t.tipo}</td>
                      <td className="py-1 text-right tabular-nums text-[var(--color-text-primary)]">
                        {fmtNumero(t.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="premium-card mt-4 p-4 sm:p-5">
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
              Listado de asociaciones
            </h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[32rem] text-sm">
                <caption className="sr-only">
                  Asociaciones inscritas en {municipio ?? "este municipio"}, con tipo,
                  estado y fecha de inscripción
                </caption>
                <thead>
                  <tr className="text-left text-xs text-[var(--color-text-muted)]">
                    <th scope="col" className="py-2 pr-4 font-medium">Nombre</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Tipo</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Estado</th>
                    <th scope="col" className="py-2 font-medium">Fecha de inscripción</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((it, i) => (
                    <tr
                      key={`${it.nombre}__${it.fecha_inscripcion ?? ""}__${i}`}
                      className="border-t border-[var(--color-border-subtle)]"
                    >
                      <td className="py-2 pr-4 text-[var(--color-text-primary)]">{it.nombre}</td>
                      <td className="py-2 pr-4 text-[var(--color-text-secondary)]">
                        {it.tipo || "—"}
                      </td>
                      <td className="py-2 pr-4 text-[var(--color-text-secondary)]">
                        {it.estado || "—"}
                      </td>
                      <td className="py-2 tabular-nums text-[var(--color-text-secondary)]">
                        {fmtFecha(it.fecha_inscripcion)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.total > visibles.length && (
              <p className="mt-3 text-xs text-[var(--color-text-muted)]">
                Se muestran las primeras {fmtNumero(visibles.length)} de{" "}
                {fmtNumero(data.total)} asociaciones. El listado completo está disponible
                en la exportación XLSX de la ficha.
              </p>
            )}
          </div>
        </>
      )}

      <p className="mt-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
        Fuente:{" "}
        {fuenteUrl ? (
          <a
            href={fuenteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-[var(--color-secondary)]"
          >
            registro autonómico de asociaciones
          </a>
        ) : (
          "registro autonómico de asociaciones"
        )}
        {data.fuenteFecha ? ` · fecha de descarga: ${fmtFecha(data.fuenteFecha)}` : ""}
        . La ausencia de dato se muestra como «—»; nunca como 0.
      </p>

      <Aviso texto={data.aviso} />
    </section>
  );
}

/** Placeholder de carga: misma estructura y clases que el bloque real. */
export function AsociacionesSkeleton() {
  return (
    <section
      aria-label="Asociaciones inscritas en el registro autonómico"
      aria-busy="true"
      className="mb-10"
    >
      <h2 className="ideas-h2">Asociaciones</h2>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
        Registro autonómico de asociaciones
      </p>
      <div className="premium-card mt-4 p-4 sm:p-5">
        <div className="premium-skeleton h-4 w-1/3" />
        <div className="mt-4 space-y-3">
          <div className="premium-skeleton h-3 w-full" />
          <div className="premium-skeleton h-3 w-5/6" />
          <div className="premium-skeleton h-3 w-1/2" />
        </div>
        <div className="premium-skeleton mt-4 h-24 w-full" />
      </div>
      <div className="premium-skeleton mt-4 h-16 w-full" />
    </section>
  );
}
