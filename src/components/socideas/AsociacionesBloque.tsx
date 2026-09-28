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
      className="note mt-6 max-w-[70ch]"
    >
      <strong className="font-semibold text-[var(--text-primary)]">Aviso de verificación. </strong>
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
    <section aria-label="Asociaciones inscritas en el registro autonómico" className="border-t border-[var(--border-subtle)] py-10">
      <h2 className="type-h3 text-[var(--text-primary)]">Asociaciones</h2>
      <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-[var(--text-secondary)]">
        Entidades inscritas en el registro autonómico de asociaciones
        {municipio ? ` con domicilio en ${municipio}` : ""}
        {data.fuenteFecha ? `. Descarga del ${fmtFecha(data.fuenteFecha)}` : ""}.
      </p>

      {!conDatos ? (
        <div className="mt-4">
          <p
            role="status"
            className="max-w-[70ch] rounded-[6px] border border-dashed border-[var(--border-default)] px-4 py-3 text-sm leading-relaxed text-[var(--text-primary)]"
          >
            Sin datos publicados para este municipio.
          </p>
          <p className="mt-3 max-w-[70ch] text-[13px] leading-relaxed text-[var(--text-muted)]">
            SOCideas no ha recuperado registros de este municipio en los registros
            autonómicos con descarga estructurada. Esto no significa que aquí no haya
            asociaciones: significa que no hay datos publicados y comprobables para
            mostrarlos. No se muestra «0» porque no es un hecho verificado.
          </p>
          {buscador && data.buscadorCcaa && (
            <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-[var(--text-muted)]">
              Puede consultarlas en el{" "}
              <a
                href={buscador}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--text-link)] underline underline-offset-2 hover:text-[var(--text-link-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-focus)]"
              >
                registro de asociaciones de {data.buscadorCcaa.nombre}
              </a>{" "}
              ({hostDe(buscador)}).
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-3">
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

          <div className="mt-10">
            <h3 className="type-h4 text-[var(--text-primary)]">
              Distribución por tipo
            </h3>
            <div className="socideas-table-shell__scroll max-w-[40rem] overflow-x-auto">
              <table className="socideas-table min-w-[16rem]">
                <caption className="sr-only">
                  Número de asociaciones por tipo en {municipio ?? "este municipio"}
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className="socideas-table__text">Tipo</th>
                    <th scope="col" className="socideas-table__numeric">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.porTipo.map((t) => (
                    <tr key={t.tipo}>
                      <td className="socideas-table__text">{t.tipo}</td>
                      <td className="socideas-table__numeric">
                        {fmtNumero(t.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-10">
            <h3 className="type-h4 text-[var(--text-primary)]">
              Listado de asociaciones
            </h3>
            <div className="socideas-table-shell__scroll overflow-x-auto">
              <table className="socideas-table min-w-[32rem]">
                <caption className="sr-only">
                  Asociaciones inscritas en {municipio ?? "este municipio"}, con tipo,
                  estado y fecha de inscripción
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className="socideas-table__text">Nombre</th>
                    <th scope="col" className="socideas-table__text">Tipo</th>
                    <th scope="col" className="socideas-table__text">Estado</th>
                    <th scope="col" className="socideas-table__year">Fecha de inscripción</th>
                    <th scope="col" className="socideas-table__text">Enlace</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((it, i) => (
                    <tr
                      key={`${it.nombre}__${it.fecha_inscripcion ?? ""}__${i}`}
                    >
                      <td className="socideas-table__text">{it.nombre}</td>
                      <td className="text-[var(--text-secondary)]">
                        {it.tipo || "—"}
                      </td>
                      <td className="text-[var(--text-secondary)]">
                        {it.estado || "—"}
                      </td>
                      <td className="socideas-table__year text-[var(--text-secondary)]">
                        {fmtFecha(it.fecha_inscripcion)}
                      </td>
                      <td className="text-[var(--text-secondary)]">
                        {it.enlace_estado === "verificado" && it.web_verificada ? (
                          <a
                            href={it.web_verificada}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[var(--text-link)] underline underline-offset-2 hover:text-[var(--text-link-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-focus)]"
                          >
                            Web
                          </a>
                        ) : it.enlace_estado === "verificado" && it.social_verificada ? (
                          <a
                            href={it.social_verificada}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[var(--text-link)] underline underline-offset-2 hover:text-[var(--text-link-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-focus)]"
                          >
                            Social
                          </a>
                        ) : (
                          <span className="text-[var(--text-muted)]">
                            Sin enlace individual verificado
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.total > visibles.length && (
              <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-[var(--text-muted)]">
                Se muestran las primeras {fmtNumero(visibles.length)} de{" "}
                {fmtNumero(data.total)} asociaciones. El listado completo está disponible
                en la exportación XLSX de la ficha.
              </p>
            )}
          </div>
        </>
      )}

      <p className="mt-6 max-w-[70ch] text-[13px] leading-relaxed text-[var(--text-muted)]">
        Fuente:{" "}
        {fuenteUrl ? (
          <a
            href={fuenteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--text-link)] underline underline-offset-2 hover:text-[var(--text-link-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-focus)]"
          >
            registro autonómico de asociaciones
          </a>
        ) : (
          "registro autonómico de asociaciones"
        )}
        {data.fuenteFecha ? `, fecha de descarga: ${fmtFecha(data.fuenteFecha)}` : ""}
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
      className="border-t border-[var(--border-subtle)] py-10"
    >
      <h2 className="type-h3 text-[var(--text-primary)]">Asociaciones</h2>
      <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-[var(--text-secondary)]">
        Registro autonómico de asociaciones
      </p>
      <div className="mt-6">
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
