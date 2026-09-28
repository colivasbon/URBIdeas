// Bloque electoral municipal (Elecciones 2023-05-28, Ministerio del Interior).
// Presentacional, sin datos propios ni animaciones. SOLO código nuevo, sin
// integrarlo en la ficha existente: reutiliza StatCard + primitivas de texto
// del sistema (clases ya existentes) y tabla HTML nativa (copiable a
// Word/Excel). Sin estilos nuevos.
//
// Decisión de componente: NO se propone mapa electoral en el MVP. El dato es
// tabular por candidatura (votos + concejales) y la ficha ya dispone de
// StatCard/tabla/Trace; una coropleta por candidatura ganadora exigiría
// geometría y rampa categórica nuevas y aportaría poco frente a la tabla de
// reparto. Se documenta como extensión futura posible, no necesaria.
import StatCard from "./StatCard";

export interface ElectoralCandidatura {
  nombre: string;
  siglas: string;
  votos: number | null;
  pctValidos: number | null;
  concejales: number | null;
}

export interface ElectoralPresentationData {
  municipio: string;
  anio: number;
  censo: number | null;
  votantes: number | null;
  /** Derivada votantes/censo (cálculo SOCideas, 1 decimal). */
  participacion: number | null;
  validos: number | null;
  blancos: number | null;
  nulos: number | null;
  totalConcejales: number;
  /** Top 5 por votos + "Otras candidaturas" agregada cuando hay resto. */
  candidaturas: ElectoralCandidatura[];
  /** Candidatura más votada (null si no determinable). */
  ganadora?: { nombre: string; siglas: string; votos: number | null; concejales: number | null } | null;
  /** "observed" | "missing" (municipio ≤250 hab o sin cobertura en la fuente). */
  status: "observed" | "missing";
}

function fmt(n: number | null): string {
  return n === null ? "ND" : n.toLocaleString("es-ES");
}

function fmtPct(n: number | null): string {
  if (n === null) return "ND";
  return `${n.toLocaleString("es-ES", { maximumFractionDigits: 1 })} %`;
}

function Trace({ anio }: { anio: number }) {
  return (
    <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-[var(--text-muted)]">
      Fuente: Ministerio del Interior, Infoelectoral Datos Abiertos, elecciones municipales{" "}
      <span className="tabular-nums">{anio}</span>, tabla MIR_MUNI_202305.
    </p>
  );
}

function EstadoLinea({ estado }: { estado: string }) {
  return (
    <p role="status" className="max-w-[70ch] rounded-[6px] border border-dashed border-[var(--border-default)] px-4 py-3 text-sm leading-relaxed text-[var(--text-secondary)]">
      {estado === "missing"
        ? "Sin resultados municipales de esta convocatoria para este municipio (p. ej. régimen de concejo abierto ≤250 hab, fuera del alcance actual)."
        : "Cobertura parcial: consulte la fuente y el período antes de usar el dato."}
    </p>
  );
}

export function BloqueElectoral({ data }: { data: ElectoralPresentationData }) {
  const ok = data.status === "observed";
  const conOtras = data.candidaturas.some((c) => c.nombre === "Otras candidaturas");
  return (
    <section aria-label="Resultados electorales municipales" className="border-t border-[var(--border-subtle)] py-10">
      <h2 className="type-h3 text-[var(--text-primary)]">Elecciones municipales</h2>
      <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-[var(--text-secondary)]">
        Participación y reparto de concejales en {data.municipio}, <span className="tabular-nums">{data.anio}</span>.
      </p>
      {!ok ? (
        <div className="mt-4"><EstadoLinea estado={data.status} /></div>
      ) : (
        <>
          {data.ganadora && (
            <p className="mt-4 max-w-[70ch] text-sm text-[var(--text-primary)]">
              Candidatura más votada: <strong>{data.ganadora.nombre}</strong>
              {data.ganadora.siglas ? ` (${data.ganadora.siglas})` : ""}, con{" "}
              <span className="tabular-nums">{fmt(data.ganadora.votos)}</span> votos y{" "}
              <span className="tabular-nums">{fmt(data.ganadora.concejales)}</span> concejales.
            </p>
          )}
          <div className="mt-6 grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-3">
            <StatCard
              etiqueta="Participación (derivada)"
              valor={fmtPct(data.participacion)}
              detalle={`${fmt(data.votantes)} votantes de ${fmt(data.censo)} electores; cálculo: votantes / censo`}
            />
            <StatCard
              etiqueta="Votos válidos"
              valor={fmt(data.validos)}
              detalle={`Blancos: ${fmt(data.blancos)}; nulos: ${fmt(data.nulos)}`}
            />
            <StatCard
              etiqueta="Concejales"
              valor={fmt(data.totalConcejales)}
              detalle={`${data.candidaturas.length} candidaturas${conOtras ? " (resto en «Otras candidaturas»)" : ""}`}
            />
          </div>
          <div className="socideas-table-shell__scroll mt-8 overflow-x-auto">
            <table className="socideas-table">
              <caption className="sr-only">
                Votos y concejales por candidatura en {data.municipio} ({data.anio})
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="socideas-table__text">Candidatura</th>
                  <th scope="col" className="socideas-table__text">Siglas</th>
                  <th scope="col" className="socideas-table__numeric">Votos</th>
                  <th scope="col" className="socideas-table__numeric">% válidos</th>
                  <th scope="col" className="socideas-table__numeric">Concejales</th>
                </tr>
              </thead>
              <tbody>
                {data.candidaturas.map((c) => (
                  <tr key={`${c.nombre}__${c.siglas}`}>
                    <td className="socideas-table__text">{c.nombre}</td>
                    <td>{c.siglas || "—"}</td>
                    <td className="socideas-table__numeric">{fmt(c.votos)}</td>
                    <td className="socideas-table__numeric">{fmtPct(c.pctValidos)}</td>
                    <td className="socideas-table__numeric">{fmt(c.concejales)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <Trace anio={data.anio} />
      <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-[var(--text-muted)]">
        Se muestran las 5 candidaturas más votadas; el resto se agrupa en «Otras candidaturas».
        La participación es un cálculo SOCideas (votantes / censo). La ausencia de dato se muestra
        como ND; nunca como 0. Los municipios en régimen de concejo abierto (generalmente, menos
        de 100 habitantes) no publican resultados por candidatura en esta fuente; los municipios
        pequeños que sí votan por listas se muestran con normalidad.
      </p>
    </section>
  );
}
