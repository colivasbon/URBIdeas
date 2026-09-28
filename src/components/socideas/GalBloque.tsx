// Bloque «Contexto rural — GAL» (Grupos de Acción Local · LEADER/FEADER/PAC).
// Componente de SERVIDOR, presentacional y sin datos propios: recibe el
// resultado de readGalMunicipio() (src/lib/socideas-gal.ts).
//
// Estilos: SOLO clases y variables ya existentes (ideas-h2, premium-card,
// premium-skeleton, data-card, --color-*). Sin dependencias nuevas, sin JS de
// cliente. Tabla nativa (copiable a Word/Excel) con caption + scope para
// lectores de pantalla; `overflow-x-auto` para móvil; aviso de verificación
// siempre visible con role="note".
//
// Copy de estados (regla de la misión): `sin_datos` NUNCA dice «no pertenece»;
// `sin_gal` informa sin alarmar.
import type { ReactNode } from "react";
import type { GalMunicipio } from "@/lib/socideas-gal";
import { GAL_AVISO_POR_DEFECTO } from "@/lib/socideas-gal";

interface GalBloqueProps {
  data: GalMunicipio;
  /** Nombre del municipio, solo para el subtítulo editorial. */
  municipio?: string;
}

/** Solo URLs http(s): los datos vienen de terceros y se enlazan sin sanitizar. */
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

function mailSeguro(email: string | null | undefined): string | null {
  const e = (email ?? "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });
}

function Aviso({ texto }: { texto: string }) {
  return (
    <p
      role="note"
      className="note mt-6 max-w-[70ch]"
    >
      {texto}
    </p>
  );
}

function Fila({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <tr>
      <th
        scope="row"
        className="w-1/3 border-t border-[var(--border-subtle)] py-3 pr-4 align-top text-left text-sm font-medium text-[var(--text-secondary)]"
      >
        {etiqueta}
      </th>
      <td className="border-t border-[var(--border-subtle)] py-3 align-top text-sm text-[var(--text-primary)]">{children}</td>
    </tr>
  );
}

function Traza({ fuenteUrl, fuenteFecha }: { fuenteUrl: string; fuenteFecha: string }) {
  const url = httpSegura(fuenteUrl);
  return (
    <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-[var(--text-muted)]">
      Fuente:{" "}
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--text-link)] underline underline-offset-2 hover:text-[var(--text-link-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-focus)]"
        >
          dataset estructurado publicado por la administración
        </a>
      ) : (
        "dataset estructurado publicado por la administración"
      )}
      {", recuperado el "}
      {fmtFecha(fuenteFecha)}. La ausencia de dato se muestra como «—»; nunca como 0.
    </p>
  );
}

export function GalBloque({ data, municipio }: GalBloqueProps) {
  const { estado, gal, totalGalEnTerritorio } = data;
  const titulo = "Contexto rural: Grupo de Acción Local (GAL)";

  return (
    <section aria-label="Contexto rural: grupos de acción local" className="border-t border-[var(--border-subtle)] py-10">
      <h2 className="type-h3 text-[var(--text-primary)]">{titulo}</h2>
      <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-[var(--text-secondary)]">
        Pertenencia {municipio ? `de ${municipio} ` : ""}a un Grupo de Acción Local (LEADER, FEADER,
        PAC), ámbito de desarrollo rural.
      </p>

      {estado === "sin_datos" && (
        <div className="mt-4">
          <p
            role="status"
            className="max-w-[70ch] rounded-[6px] border border-dashed border-[var(--border-default)] px-4 py-3 text-sm leading-relaxed text-[var(--text-secondary)]"
          >
            Sin datos publicados de GAL para este municipio.
          </p>
          <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-[var(--text-muted)]">
            Todavía no hay información de grupos de acción local disponible en la fuente
            consultada por SOCideas. Esto no significa que el municipio carezca de GAL:
            significa que aún no se han publicado datos comprobables.
          </p>
        </div>
      )}

      {estado === "sin_gal" && (
        <div className="mt-4">
          <p
            role="status"
            className="max-w-[70ch] rounded-[6px] border border-dashed border-[var(--border-default)] px-4 py-3 text-sm leading-relaxed text-[var(--text-secondary)]"
          >
            Este municipio no está incluido en el ámbito de ningún GAL con datos publicados.
          </p>
          <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-[var(--text-muted)]">
            Con datos publicados en la fuente: {totalGalEnTerritorio} grupos de acción local.
            La ausencia de inclusión responde al ámbito territorial publicado, no a una
            deficiencia del municipio: la intervención LEADER solo alcanza zonas rurales
            concretas.
          </p>
        </div>
      )}

      {estado === "pertenece" && gal && (
        <div className="mt-6">
          <p className="max-w-[70ch] text-[var(--text-primary)]">
            Pertenece al grupo de acción local <strong className="font-semibold">{gal.nombre}</strong>
            {gal.codigo ? ` (${gal.codigo})` : ""}
          </p>

          <div className="mt-5 max-w-[48rem] overflow-x-auto">
            <table className="w-full min-w-[18rem] border-b border-[var(--border-subtle)] text-sm">
              <caption className="sr-only">
                Datos de publicados del grupo de acción local de{" "}
                {municipio ?? "este municipio"}
              </caption>
              <tbody>
                <Fila etiqueta="Nombre">{gal.nombre}</Fila>
                <Fila etiqueta="Código">{gal.codigo ?? "—"}</Fila>
                <Fila etiqueta="Ámbito territorial">{gal.ambito ?? "—"}</Fila>
                <Fila etiqueta="Período de programación">{gal.periodo ?? "—"}</Fila>
                <Fila etiqueta="Web oficial">
                  {httpSegura(gal.web) ? (
                    <a
                      href={httpSegura(gal.web)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--text-link)] underline underline-offset-2 hover:text-[var(--text-link-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-focus)]"
                    >
                      {hostDe(httpSegura(gal.web)!)}
                    </a>
                  ) : (
                    "—"
                  )}
                </Fila>
                <Fila etiqueta="Estado del enlace">
                  {gal.estado_enlace === "verificado" ? (
                    <span className="text-[var(--status-success-fg)]">Verificado</span>
                  ) : gal.estado_enlace === "pendiente" ? (
                    <span className="text-[var(--text-muted)]">Pendiente de verificación</span>
                  ) : gal.estado_enlace === "no_verificado" ? (
                    <span className="text-[var(--text-muted)]">No verificado</span>
                  ) : (
                    <span className="text-[var(--text-muted)]">Fuente caída</span>
                  )}
                </Fila>
                {gal.fecha_verificacion && (
                  <Fila etiqueta="Fecha de verificación">{fmtFecha(gal.fecha_verificacion)}</Fila>
                )}
                <Fila etiqueta="Correo electrónico">
                  {mailSeguro(gal.email) ? (
                    <a
                      href={`mailto:${mailSeguro(gal.email)}`}
                      className="text-[var(--text-link)] underline underline-offset-2 hover:text-[var(--text-link-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--border-focus)]"
                    >
                      {gal.email}
                    </a>
                  ) : (
                    "—"
                  )}
                </Fila>
                <Fila etiqueta="Teléfono">{gal.telefono ?? "—"}</Fila>
              </tbody>
            </table>
          </div>

          <p className="mt-4 max-w-[70ch] text-[13px] leading-relaxed text-[var(--text-muted)]">
            Este municipio está publicado dentro del ámbito de este GAL. En la fuente hay{" "}
            {totalGalEnTerritorio} grupos de acción local con datos.
          </p>

          <Aviso texto={gal.aviso || GAL_AVISO_POR_DEFECTO} />
          <Traza fuenteUrl={gal.fuenteUrl} fuenteFecha={gal.fuenteFecha} />
        </div>
      )}

      {estado !== "pertenece" && (
        <Aviso texto={GAL_AVISO_POR_DEFECTO} />
      )}
    </section>
  );
}

/** Placeholder de carga: misma estructura y clases que el bloque real. */
export function GalSkeleton() {
  return (
    <section
      aria-label="Contexto rural: grupos de acción local"
      aria-busy="true"
      className="border-t border-[var(--border-subtle)] py-10"
    >
      <h2 className="type-h3 text-[var(--text-primary)]">Contexto rural: Grupo de Acción Local (GAL)</h2>
      <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-[var(--text-secondary)]">
        Grupos de Acción Local (LEADER, FEADER, PAC)
      </p>
      <div className="mt-6">
        <div className="premium-skeleton h-4 w-2/3" />
        <div className="mt-4 space-y-3">
          <div className="premium-skeleton h-3 w-full" />
          <div className="premium-skeleton h-3 w-5/6" />
          <div className="premium-skeleton h-3 w-1/2" />
        </div>
        <div className="premium-skeleton mt-4 h-10 w-full" />
      </div>
    </section>
  );
}
