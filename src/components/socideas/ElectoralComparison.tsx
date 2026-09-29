"use client";

import { useMemo, useState } from "react";
import type { Candidacy, MunicipalElection } from "@/lib/elections-schema";
import styles from "./ElectoralComparison.module.css";

interface ElectoralComparisonProps {
  current: MunicipalElection;
  previous: MunicipalElection;
}

type MetricType = "votes" | "percentage" | "representatives";

const norm = (v: string): string =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

interface Row {
  current: Candidacy | null;
  previous: Candidacy | null;
}

function buildRows(current: MunicipalElection, previous: MunicipalElection): Row[] {
  const remaining = [...previous.candidacies];
  const rows: Row[] = [];
  for (const c of current.candidacies) {
    const idx = remaining.findIndex(
      (p) =>
        norm(p.official_name) === norm(c.official_name) ||
        (norm(p.official_acronym) !== "" && norm(p.official_acronym) === norm(c.official_acronym)),
    );
    const match = idx >= 0 ? remaining.splice(idx, 1)[0] : null;
    rows.push({ current: c, previous: match });
  }
  for (const p of remaining) rows.push({ current: null, previous: p });
  const relevant = (c: Candidacy | null) => c !== null && ((c.representatives ?? 0) > 0 || (c.percentage_valid_votes ?? 0) >= 1);
  return rows
    .filter((r) => relevant(r.current) || relevant(r.previous))
    .sort((a, b) => (b.current?.votes ?? b.previous?.votes ?? 0) - (a.current?.votes ?? a.previous?.votes ?? 0));
}

const nf = new Intl.NumberFormat("es-ES");
const pf = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function value(c: Candidacy | null, metric: MetricType): number | null {
  if (!c) return null;
  if (metric === "votes") return c.votes;
  if (metric === "percentage") return c.percentage_valid_votes;
  return c.representatives;
}

function fmt(v: number | null, metric: MetricType): string {
  if (v === null) return "ND";
  return metric === "percentage" ? `${pf.format(v)} %` : nf.format(v);
}

export function ElectoralComparison({ current, previous }: ElectoralComparisonProps) {
  const [metric, setMetric] = useState<MetricType>("percentage");
  const rows = useMemo(() => buildRows(current, previous), [current, previous]);

  const maxValue = Math.max(
    0,
    ...rows.flatMap((r) => [value(r.current, metric) ?? 0, value(r.previous, metric) ?? 0]),
  );

  const options: { key: MetricType; label: string }[] = [
    { key: "percentage", label: "Porcentaje" },
    { key: "votes", label: "Votos" },
    { key: "representatives", label: "Concejales" },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.controls} role="radiogroup" aria-label="Magnitud a comparar">
        {options.map((o) => (
          <label key={o.key}>
            <input type="radio" name="comparison-metric" checked={metric === o.key} onChange={() => setMetric(o.key)} />
            {o.label}
          </label>
        ))}
      </div>

      <div className={styles.bars}>
        {rows.map((r) => {
          const cv = value(r.current, metric);
          const pv = value(r.previous, metric);
          const both = cv !== null && pv !== null;
          const delta = both ? cv - pv : null;
          const name = r.current?.official_name ?? r.previous?.official_name ?? "";
          return (
            <div key={`${name}-${r.current ? "c" : "p"}`} className={styles.barRow}>
              <div className={styles.label} title={name}>
                {r.current?.official_acronym || name}
              </div>
              <div className={styles.barContainer}>
                <div className={styles.barLine} title={`${current.election_year}: ${fmt(cv, metric)}`}>
                  <div
                    className={`${styles.bar} ${styles.current}`}
                    style={{ width: `${maxValue > 0 && cv ? (cv / maxValue) * 88 : 0}%` }}
                  />
                  <span className={styles.barLabel}>{fmt(cv, metric)}</span>
                </div>
                <div className={styles.barLine} title={`${previous.election_year}: ${fmt(pv, metric)}`}>
                  <div
                    className={`${styles.bar} ${styles.previous}`}
                    style={{ width: `${maxValue > 0 && pv ? (pv / maxValue) * 88 : 0}%` }}
                  />
                  <span className={styles.barLabel}>{fmt(pv, metric)}</span>
                </div>
              </div>
              <div className={styles.change}>
                {delta === null ? (
                  <span title="Candidatura sin equivalente directo en la otra convocatoria: no se calcula variación">
                    sin equiv.
                  </span>
                ) : delta !== 0 ? (
                  <span className={delta > 0 ? styles.increase : styles.decrease}>
                    {delta > 0 ? "+" : "−"}
                    {metric === "percentage" ? `${pf.format(Math.abs(delta))} pp` : nf.format(Math.abs(delta))}
                  </span>
                ) : (
                  <span>0</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.legend}>
        <div className={styles.legendItem}>
          <div className={`${styles.legendColor} ${styles.current}`} />
          {current.election_year}
        </div>
        <div className={styles.legendItem}>
          <div className={`${styles.legendColor} ${styles.previous}`} />
          {previous.election_year}
        </div>
      </div>
      <p className={styles.note}>
        Solo se calcula variación entre candidaturas equivalentes (mismo nombre oficial o mismas siglas). Coaliciones o
        listas con denominación distinta se muestran sin variación.
      </p>
    </div>
  );
}
