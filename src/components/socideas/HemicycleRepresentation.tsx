"use client";

import type { MunicipalElection } from "@/lib/elections-schema";
import styles from "./HemicycleRepresentation.module.css";

interface HemicycleRepresentationProps {
  election: MunicipalElection;
}

export function HemicycleRepresentation({ election }: HemicycleRepresentationProps) {
  const totalSeats = election.summary.representatives_total || 0;
  const majorityThreshold = election.summary.majority_threshold || Math.floor(totalSeats / 2) + 1;

  const seatsPerRow = Math.min(11, Math.ceil(totalSeats / 4));
  const rows = Math.ceil(totalSeats / seatsPerRow);

  const candidaciesWithSeats = election.candidacies
    .filter((c) => (c.representatives ?? 0) > 0)
    .sort((a, b) => (b.representatives ?? 0) - (a.representatives ?? 0));

  const seatsArray: Array<{ candidacy: string; color: string; acronym: string }> = [];
  for (const cand of candidaciesWithSeats) {
    for (let i = 0; i < (cand.representatives ?? 0); i++) {
      seatsArray.push({
        candidacy: cand.official_name,
        color: getPartyColor(cand.official_name),
        acronym: cand.official_acronym || cand.official_name.substring(0, 2).toUpperCase(),
      });
    }
  }

  while (seatsArray.length < totalSeats) {
    seatsArray.push({ candidacy: "Vacante", color: "#ccc", acronym: "—" });
  }

  return (
    <div className={styles.container}>
      <div className={styles.hemicycle}>
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <div key={rowIdx} className={styles.row}>
            {Array.from({ length: seatsPerRow }).map((_, seatIdx) => {
              const index = rowIdx * seatsPerRow + seatIdx;
              const seat = seatsArray[index];
              return seat ? (
                <div
                  key={index}
                  className={styles.seat}
                  style={{ backgroundColor: seat.color }}
                  title={`${seat.candidacy}: ${seat.acronym}`}
                >
                  <span className={styles.label}>{seat.acronym}</span>
                </div>
              ) : null;
            })}
          </div>
        ))}
      </div>

      <div className={styles.info}>
        <p>
          <strong>Total de concejales:</strong> {totalSeats}
        </p>
        <p>
          <strong>Mayoría absoluta:</strong> {majorityThreshold}
        </p>
        <div className={styles.legend}>
          {candidaciesWithSeats.map((c, idx) => (
            <div key={idx} className={styles.legendItem}>
              <div
                className={styles.legendColor}
                style={{ backgroundColor: getPartyColor(c.official_name) }}
              />
              <span>
                {c.official_name} ({c.representatives})
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function getPartyColor(partyName: string): string {
  const colors: { [key: string]: string } = {
    "Partido Socialista Obrero Español": "#E74C3C",
    PSOE: "#E74C3C",
    "Partido Popular": "#0066CC",
    PP: "#0066CC",
    "Movimiento 5 Estrellas": "#FFCC00",
    "Ciudadanos Ciudadanos": "#FF6600",
    Ciudadanos: "#FF6600",
    Podemos: "#9B59B6",
    "Esquerra Republicana de Catalunya": "#D4AF37",
    ERC: "#D4AF37",
    "Junts per Catalunya": "#E74C3C",
    JxCat: "#E74C3C",
    "Bloc de l'Esquerra": "#FF6600",
    "Compromiso Abierto": "#008000",
  };

  for (const [name, color] of Object.entries(colors)) {
    if (partyName.includes(name) || name.includes(partyName)) {
      return color;
    }
  }

  return "#999999";
}
