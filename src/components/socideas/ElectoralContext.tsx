"use client";

import { useEffect, useState } from "react";
import {
  getMunicipalElection,
  getMunicipalElectionSeries,
  validateElection,
} from "@/lib/elections-consumer";
import type { MunicipalElection } from "@/lib/elections-schema";
import styles from "./ElectoralContext.module.css";

interface ElectoralContextProps {
  municipalityCode: string;
  municipalityName?: string;
}

export function ElectoralContext({ municipalityCode, municipalityName }: ElectoralContextProps) {
  const [elections, setElections] = useState<MunicipalElection[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(2023);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const data = await getMunicipalElectionSeries(municipalityCode);
        if (data.length === 0) {
          setError("No hay datos electorales disponibles");
          setElections([]);
        } else {
          setElections(data);
          setSelectedYear(data[0].election_year);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error desconocido");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [municipalityCode]);

  if (loading) {
    return <div className={styles.loading}>Cargando datos electorales...</div>;
  }

  if (error || elections.length === 0) {
    return <div className={styles.error}>{error || "No hay datos"}</div>;
  }

  const current = elections.find((e) => e.election_year === selectedYear);
  if (!current) return null;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Elecciones municipales</h2>
        <p>{municipalityName || current.municipality.name}</p>
      </div>

      <div className={styles.controls}>
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(parseInt(e.target.value))}
          className={styles.select}
        >
          {elections.map((e) => (
            <option key={e.election_date} value={e.election_year}>
              {e.election_year}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.summary}>
        <div className={styles.metric}>
          <span className={styles.label}>Censo</span>
          <span className={styles.value}>{current.summary.census?.toLocaleString() ?? "—"}</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.label}>Votantes</span>
          <span className={styles.value}>{current.summary.voters?.toLocaleString() ?? "—"}</span>
        </div>
        <div className={styles.metric}>
          <span className={styles.label}>Participación</span>
          <span className={styles.value}>{current.summary.participation_percentage?.toFixed(1) ?? "—"}%</span>
        </div>
      </div>

      <div className={styles.candidacies}>
        <h3>Candidaturas ({current.candidacies.length})</h3>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Candidatura</th>
              <th>Votos</th>
              <th>%</th>
              <th>Concejales</th>
            </tr>
          </thead>
          <tbody>
            {current.candidacies
              .filter((c) => c.votes !== null || c.representatives !== null)
              .sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0))
              .map((c, idx) => (
                <tr key={idx}>
                  <td>
                    {c.official_name} {c.official_acronym ? `(${c.official_acronym})` : ""}
                  </td>
                  <td>{c.votes?.toLocaleString() ?? "—"}</td>
                  <td>{c.percentage_valid_votes?.toFixed(1) ?? "—"}%</td>
                  <td>{c.representatives ?? "—"}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className={styles.source}>
        <p>
          <strong>Fuente:</strong> {current.source.publisher} · {current.source.dataset}
        </p>
        <p>
          <strong>Fecha:</strong> {new Date(current.election_date).toLocaleDateString("es-ES")}
        </p>
        <p>
          <strong>Estado:</strong> {current.status}
        </p>
      </div>
    </div>
  );
}
