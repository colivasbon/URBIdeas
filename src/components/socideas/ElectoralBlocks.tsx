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
    <p className="mt-3 text-xs text-[var(--color-text-muted)]">
      Fuente: Ministerio del Interior · Infoelectoral Datos Abiertos · Elecciones municipales{" "}
      {anio} · Tabla MIR_MUNI_202305
    </p>
  );
}

function EstadoLinea({ estado }: { estado: string }) {
  return (
    <p role="status" className="rounded-[6px] border border-[var(--color-border-subtle)] bg-[var(--color-input-bg)] px-4 py-3 text-xs text-[var(--color-text-muted)]">
      {estado === "missing"
        ? "Sin resultados municipales de esta convocatoria para este municipio (p. ej. régimen de concejo abierto ≤250 hab, fuera del alcance actual)."
        : "Cobertura parcial; consultar fuente y período."}
    </p>
  );
}

export function BloqueElectoral({ data }: { data: ElectoralPresentationData }) {
  const ok = data.status === "observed";
  const conOtras = data.candidaturas.some((c) => c.nombre === "Otras candidaturas");
  return (
    <section aria-label="Resultados electorales municipales" className="mb-10">
      <h2 className="ideas-h2">Elecciones municipales</h2>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
        Participación y reparto de concejales · {data.municipio} · {data.anio}
      </p>
      {!ok ? (
        <div className="mt-4"><EstadoLinea estado={data.status} /></div>
      ) : (
        <>
          {data.ganadora && (
            <p className="mt-3 text-sm text-[var(--color-text-primary)]">
              Candidatura más votada: <strong>{data.ganadora.nombre}</strong>
              {data.ganadora.siglas ? ` (${data.ganadora.siglas})` : ""} · {fmt(data.ganadora.votos)} votos ·{" "}
              {fmt(data.ganadora.concejales)} concejales
            </p>
          )}
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              etiqueta="Participación (derivada)"
              valor={fmtPct(data.participacion)}
              detalle={`${fmt(data.votantes)} votantes de ${fmt(data.censo)} electores · cálculo: votantes / censo`}
            />
            <StatCard
              etiqueta="Votos válidos"
              valor={fmt(data.validos)}
              detalle={`Blancos: ${fmt(data.blancos)} · Nulos: ${fmt(data.nulos)}`}
            />
            <StatCard
              etiqueta="Concejales"
              valor={fmt(data.totalConcejales)}
              detalle={`${data.candidaturas.length} candidaturas${conOtras ? " (resto en «Otras candidaturas»)" : ""}`}
            />
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Votos y concejales por candidatura en {data.municipio} ({data.anio})
              </caption>
              <thead>
                <tr className="text-left text-xs text-[var(--color-text-muted)]">
                  <th scope="col" className="py-2 pr-4 font-medium">Candidatura</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Siglas</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Votos</th>
                  <th scope="col" className="py-2 pr-4 font-medium">% válidos</th>
                  <th scope="col" className="py-2 font-medium">Concejales</th>
                </tr>
              </thead>
              <tbody>
                {data.candidaturas.map((c) => (
                  <tr key={`${c.nombre}__${c.siglas}`} className="border-t border-[var(--color-border-subtle)]">
                    <td className="py-2 pr-4">{c.nombre}</td>
                    <td className="py-2 pr-4">{c.siglas || "—"}</td>
                    <td className="py-2 pr-4 tabular-nums">{fmt(c.votos)}</td>
                    <td className="py-2 pr-4 tabular-nums">{fmtPct(c.pctValidos)}</td>
                    <td className="py-2 tabular-nums">{fmt(c.concejales)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <Trace anio={data.anio} />
      <p className="mt-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
        Se muestran las 5 candidaturas más votadas; el resto se agrupa en «Otras candidaturas».
        La participación es un cálculo SOCideas (votantes / censo). La ausencia de dato se muestra
        como ND; nunca como 0. Los municipios en régimen de concejo abierto (generalmente, menos
        de 100 habitantes) no publican resultados por candidatura en esta fuente; los municipios
        pequeños que sí votan por listas se muestran con normalidad.
      </p>
    </section>
  );
}
