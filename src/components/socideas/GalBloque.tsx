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
      className="mt-4 rounded-[6px] border border-[var(--color-border-subtle)] bg-[var(--color-input-bg)] px-4 py-3 text-xs leading-relaxed text-[var(--color-text-muted)]"
    >
      {texto}
    </p>
  );
}

function Fila({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <tr className="border-t border-[var(--color-border-subtle)]">
      <th
        scope="row"
        className="w-1/3 py-2 pr-4 align-top text-left text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]"
      >
        {etiqueta}
      </th>
      <td className="py-2 align-top text-sm text-[var(--color-text-primary)]">{children}</td>
    </tr>
  );
}

function Traza({ fuenteUrl, fuenteFecha }: { fuenteUrl: string; fuenteFecha: string }) {
  const url = httpSegura(fuenteUrl);
  return (
    <p className="mt-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
      Fuente:{" "}
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-[var(--color-secondary)]"
        >
          dataset estructurado publicado por la administración
        </a>
      ) : (
        "dataset estructurado publicado por la administración"
      )}
      {" · recuperado el "}
      {fmtFecha(fuenteFecha)}. La ausencia de dato se muestra como «—»; nunca como 0.
    </p>
  );
}

export function GalBloque({ data, municipio }: GalBloqueProps) {
  const { estado, gal, totalGalEnTerritorio } = data;
  const titulo = "Contexto rural — GAL";

  return (
    <section aria-label="Contexto rural: grupos de acción local" className="mb-10">
      <h2 className="ideas-h2">{titulo}</h2>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
        Grupos de Acción Local (LEADER / FEADER / PAC) · ámbito de desarrollo rural
        {municipio ? ` · ${municipio}` : ""}
      </p>

      {estado === "sin_datos" && (
        <div className="mt-4">
          <p
            role="status"
            className="rounded-[6px] border border-[var(--color-border-subtle)] bg-[var(--color-input-bg)] px-4 py-3 text-sm text-[var(--color-text-muted)]"
          >
            Sin datos publicados de GAL para este municipio.
          </p>
          <p className="mt-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
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
            className="rounded-[6px] border border-[var(--color-border-subtle)] bg-[var(--color-input-bg)] px-4 py-3 text-sm text-[var(--color-text-muted)]"
          >
            Este municipio no está incluido en el ámbito de ningún GAL con datos publicados.
          </p>
          <p className="mt-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
            Con datos publicados en la fuente: {totalGalEnTerritorio} grupos de acción local.
            La ausencia de inclusión responde al ámbito territorial publicado, no a una
            deficiencia del municipio: la intervención LEADER solo alcanza zonas rurales
            concretas.
          </p>
        </div>
      )}

      {estado === "pertenece" && gal && (
        <div className="premium-card mt-4 p-4 sm:p-5">
          <p className="text-sm text-[var(--color-text-primary)]">
            Pertenece al grupo de acción local: <strong>{gal.nombre}</strong>
            {gal.codigo ? ` (${gal.codigo})` : ""}
          </p>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[18rem] text-sm">
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
                      className="underline underline-offset-2 hover:text-[var(--color-secondary)]"
                    >
                      {hostDe(httpSegura(gal.web)!)}
                    </a>
                  ) : (
                    "—"
                  )}
                </Fila>
                <Fila etiqueta="Correo electrónico">
                  {mailSeguro(gal.email) ? (
                    <a
                      href={`mailto:${mailSeguro(gal.email)}`}
                      className="underline underline-offset-2 hover:text-[var(--color-secondary)]"
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

          <p className="mt-4 text-xs text-[var(--color-text-muted)]">
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
      className="mb-10"
    >
      <h2 className="ideas-h2">Contexto rural — GAL</h2>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
        Grupos de Acción Local (LEADER / FEADER / PAC)
      </p>
      <div className="premium-card mt-4 p-4 sm:p-5">
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
