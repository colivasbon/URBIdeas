"use client";

import { useState } from "react";
import type { MunicipalElection } from "@/lib/elections-schema";
import { HemicycleRepresentation } from "./HemicycleRepresentation";
import { ElectoralComparison } from "./ElectoralComparison";
import styles from "./ElectoralContext.module.css";

interface ElectoralContextProps {
  elections: MunicipalElection[];
  municipalityName?: string;
}

const nf = new Intl.NumberFormat("es-ES");
const pf = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const int = (v: number | null | undefined): string => (v === null || v === undefined ? "ND" : nf.format(v));
const pct = (v: number | null | undefined): string => (v === null || v === undefined ? "ND" : `${pf.format(v)} %`);

export function ElectoralContext({ elections, municipalityName }: ElectoralContextProps) {
  const [selectedYear, setSelectedYear] = useState<number>(elections[0]?.election_year ?? 0);

  const current = elections.find((e) => e.election_year === selectedYear) ?? elections[0];
  if (!current) return null;

  const previous = elections.find((e) => e.election_year < current.election_year) ?? null;
  const s = current.summary;
  const candidacies = current.candidacies.filter((c) => c.votes !== null || c.representatives !== null);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Elecciones municipales {current.election_year}</h2>
        <p>{municipalityName || current.municipality.name}</p>
      </div>

      {elections.length > 1 && (
        <div className={styles.controls}>
          <label>
            <span className="sr-only">Convocatoria</span>
            <select
              value={current.election_year}
              onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
              className={styles.select}
            >
              {elections.map((e) => (
                <option key={e.election_date} value={e.election_year}>
                  {e.election_year}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className={styles.summary}>
        <div className={styles.metric}>
          <span className={styles.label}>Censo</span>
          <span className={styles.value}>{int(s.census)}</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.label}>Votantes</span>
          <span className={styles.value}>{int(s.voters)}</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.label}>Participación</span>
          <span className={styles.value}>{pct(s.participation_percentage)}</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.label}>Votos válidos</span>
          <span className={styles.value}>{int(s.valid_votes)}</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.label}>En blanco</span>
          <span className={styles.value}>{int(s.blank_votes)}</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.label}>Nulos</span>
          <span className={styles.value}>{int(s.null_votes)}</span>
        </div>
      </div>

      <div className={styles.candidacies}>
        <h3>Votos y concejales por candidatura ({candidacies.length})</h3>
        <div style={{ overflowX: "auto" }}>
          <table className={styles.table}>
            <caption className="sr-only">
              Votos, porcentaje sobre votos válidos y concejales por candidatura, elecciones municipales{" "}
              {current.election_year}
            </caption>
            <thead>
              <tr>
                <th scope="col">Candidatura</th>
                <th scope="col">Siglas</th>
                <th scope="col">Votos</th>
                <th scope="col">% válidos</th>
                <th scope="col">Concejales</th>
              </tr>
            </thead>
            <tbody>
              {candidacies.map((c) => (
                <tr key={`${c.official_name}-${c.official_acronym}`}>
                  <td>{c.official_name}</td>
                  <td>{c.official_acronym || "—"}</td>
                  <td>{int(c.votes)}</td>
                  <td>{pct(c.percentage_valid_votes)}</td>
                  <td>{int(c.representatives)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {s.representatives_total ? (
        <div className={styles.candidacies}>
          <h3>Composición del pleno</h3>
          <HemicycleRepresentation election={current} />
        </div>
      ) : null}

      {previous && (
        <div className={styles.candidacies}>
          <h3>
            Comparativa {current.election_year} y {previous.election_year}
          </h3>
          <ElectoralComparison current={current} previous={previous} />
        </div>
      )}

      <div className={styles.source}>
        <p>
          <strong>Fuente:</strong> {current.source.publisher}, {current.source.dataset}. Datos abiertos de elecciones
          a municipios.
        </p>
        <p>
          <strong>Fecha de la convocatoria:</strong>{" "}
          {new Date(`${current.election_date}T00:00:00Z`).toLocaleDateString("es-ES", {
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          })}
        </p>
        <p>
          El porcentaje se calcula sobre votos válidos (incluidos los votos en blanco). La ausencia de dato se muestra
          como ND; nunca como 0. Las candidaturas de listas distintas entre convocatorias solo se comparan por nombre
          oficial.
        </p>
      </div>
    </div>
  );
}
