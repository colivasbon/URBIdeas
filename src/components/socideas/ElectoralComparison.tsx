"use client";

import { useMemo, useState } from "react";
import type { MunicipalElection } from "@/lib/elections-schema";
import styles from "./ElectoralComparison.module.css";

interface ElectoralComparisonProps {
  current: MunicipalElection;
  previous: MunicipalElection;
}

type MetricType = "votes" | "percentage" | "representatives";

export function ElectoralComparison({ current, previous }: ElectoralComparisonProps) {
  const [metric, setMetric] = useState<MetricType>("percentage");

  const comparisonData = useMemo(() => {
    const allCandidacies = new Map<string, { current: any; previous: any }>();

    for (const c of current.candidacies) {
      if (!allCandidacies.has(c.official_name)) {
        allCandidacies.set(c.official_name, { current: c, previous: null });
      } else {
        const item = allCandidacies.get(c.official_name)!;
        item.current = c;
      }
    }

    for (const c of previous.candidacies) {
      if (!allCandidacies.has(c.official_name)) {
        allCandidacies.set(c.official_name, { current: null, previous: c });
      } else {
        const item = allCandidacies.get(c.official_name)!;
        item.previous = c;
      }
    }

    return Array.from(allCandidacies.values()).sort((a, b) => {
      const aValue = a.current?.votes ?? a.previous?.votes ?? 0;
      const bValue = b.current?.votes ?? b.previous?.votes ?? 0;
      return (bValue as number) - (aValue as number);
    });
  }, [current, previous]);

  const getValue = (cand: any, type: MetricType): number => {
    if (!cand) return 0;
    switch (type) {
      case "votes":
        return cand.votes ?? 0;
      case "percentage":
        return cand.percentage_valid_votes ?? 0;
      case "representatives":
        return cand.representatives ?? 0;
      default:
        return 0;
    }
  };

  const maxValue = Math.max(
    ...comparisonData.map((d) => Math.max(getValue(d.current, metric), getValue(d.previous, metric)))
  );

  return (
    <div className={styles.container}>
      <div className={styles.controls}>
        <label>
          <input
            type="radio"
            value="percentage"
            checked={metric === "percentage"}
            onChange={(e) => setMetric(e.target.value as MetricType)}
          />
          Porcentaje
        </label>
        <label>
          <input
            type="radio"
            value="votes"
            checked={metric === "votes"}
            onChange={(e) => setMetric(e.target.value as MetricType)}
          />
          Votos
        </label>
        <label>
          <input
            type="radio"
            value="representatives"
            checked={metric === "representatives"}
            onChange={(e) => setMetric(e.target.value as MetricType)}
          />
          Concejales
        </label>
      </div>

      <div className={styles.bars}>
        {comparisonData.map((d, idx) => {
          const currentValue = getValue(d.current, metric);
          const previousValue = getValue(d.previous, metric);
          const currentPct = maxValue > 0 ? (currentValue / maxValue) * 100 : 0;
          const previousPct = maxValue > 0 ? (previousValue / maxValue) * 100 : 0;

          return (
            <div key={idx} className={styles.barRow}>
              <div className={styles.label}>{d.current?.official_name || d.previous?.official_name}</div>
              <div className={styles.barContainer}>
                <div
                  className={`${styles.bar} ${styles.current}`}
                  style={{ width: `${currentPct}%` }}
                  title={`${current.election_year}: ${currentValue}`}
                >
                  {currentPct > 15 && <span className={styles.barLabel}>{currentValue}</span>}
                </div>
                <div
                  className={`${styles.bar} ${styles.previous}`}
                  style={{ width: `${previousPct}%` }}
                  title={`${previous.election_year}: ${previousValue}`}
                >
                  {previousPct > 15 && <span className={styles.barLabel}>{previousValue}</span>}
                </div>
              </div>
              <div className={styles.change}>
                {currentValue !== previousValue && (
                  <span className={currentValue > previousValue ? styles.increase : styles.decrease}>
                    {currentValue > previousValue ? "+" : ""}
                    {currentValue - previousValue}
                  </span>
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
    </div>
  );
}
