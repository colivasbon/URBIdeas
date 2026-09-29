"use client";

import type { MunicipalElection } from "@/lib/elections-schema";
import styles from "./HemicycleRepresentation.module.css";

interface HemicycleRepresentationProps {
  election: MunicipalElection;
}

interface Seat {
  x: number;
  y: number;
  angle: number;
}

const ACRONYM_COLORS: [string, string][] = [
  ["PP", "#1D84CE"],
  ["PSOE", "#E30613"],
  ["PSC", "#E30613"],
  ["VOX", "#63BE21"],
  ["SUMAR", "#E6007E"],
  ["PODEMOS", "#6B2C91"],
  ["IU", "#B0102B"],
  ["CS", "#EB6109"],
  ["ERC", "#F5B800"],
  ["JXCAT", "#00C3B2"],
  ["JUNTS", "#00C3B2"],
  ["PNV", "#0B7A3B"],
  ["EAJ", "#0B7A3B"],
  ["BILDU", "#B5CF18"],
  ["BNG", "#6CB4E4"],
  ["CC", "#FFD100"],
  ["COMPROMIS", "#E9822A"],
  ["MASMADRID", "#0DA35B"],
];

const NAME_COLORS: [string, string][] = [
  ["PARTIDOPOPULAR", "#1D84CE"],
  ["SOCIALISTAOBRERO", "#E30613"],
  ["SOCIALISTASDECATALUNYA", "#E30613"],
  ["VOX", "#63BE21"],
  ["SUMAR", "#E6007E"],
  ["PODEMOS", "#6B2C91"],
  ["IZQUIERDAUNIDA", "#B0102B"],
  ["CIUDADANOS", "#EB6109"],
  ["ESQUERRAREPUBLICANA", "#F5B800"],
  ["JUNTS", "#00C3B2"],
  ["NACIONALISTAVASCO", "#0B7A3B"],
  ["BILDU", "#B5CF18"],
  ["GALLEGO", "#6CB4E4"],
  ["COALICIONCANARIA", "#FFD100"],
  ["COMPROMIS", "#E9822A"],
  ["MASMADRID", "#0DA35B"],
];

const FALLBACK_COLORS = ["#3E665C", "#86B73D", "#B0BDB0", "#643335", "#C2E189", "#3C403E", "#6E6111"];

const normKey = (v: string): string =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

function colorFor(acronym: string, name: string, index: number): string {
  const ac = normKey(acronym);
  const nm = normKey(name);
  const byAcronym = ACRONYM_COLORS.find(([k]) => ac === k || (ac.length > 2 && ac.startsWith(k)));
  if (byAcronym) return byAcronym[1];
  const byName = NAME_COLORS.find(([k]) => nm.includes(k));
  if (byName) return byName[1];
  return FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

function textColorFor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? "#3C403E" : "#F1F1F1";
}

function layoutSeats(total: number): { seats: Seat[]; radius: number } {
  const rows = total <= 12 ? 2 : total <= 30 ? 3 : total <= 60 ? 4 : 5;
  const radii = Array.from({ length: rows }, (_, i) => 60 + i * 28);
  const sum = radii.reduce((a, b) => a + b, 0);
  const counts = radii.map((r) => Math.max(1, Math.round((total * r) / sum)));
  counts[rows - 1] += total - counts.reduce((a, b) => a + b, 0);

  const seats: Seat[] = [];
  let minSpacing = 28;
  radii.forEach((r, i) => {
    const n = counts[i];
    if (n > 1) minSpacing = Math.min(minSpacing, (Math.PI * r) / (n - 1));
    for (let j = 0; j < n; j++) {
      const angle = n === 1 ? Math.PI / 2 : Math.PI * (1 - j / (n - 1));
      seats.push({ x: 150 + r * Math.cos(angle), y: 150 - r * Math.sin(angle), angle });
    }
  });
  seats.sort((a, b) => b.angle - a.angle);
  return { seats, radius: Math.min(11, minSpacing * 0.42) };
}

export function HemicycleRepresentation({ election }: HemicycleRepresentationProps) {
  const totalSeats = election.summary.representatives_total ?? 0;
  const majority = election.summary.majority_threshold ?? Math.floor(totalSeats / 2) + 1;

  const groups = election.candidacies
    .filter((c) => (c.representatives ?? 0) > 0)
    .sort((a, b) => (b.representatives ?? 0) - (a.representatives ?? 0))
    .map((c, i) => ({ ...c, color: colorFor(c.official_acronym, c.official_name, i) }));

  if (totalSeats <= 0 || groups.length === 0) return null;

  const { seats, radius } = layoutSeats(totalSeats);
  const assigned: { color: string; label: string; name: string }[] = [];
  for (const g of groups) {
    for (let k = 0; k < (g.representatives ?? 0); k++) {
      assigned.push({ color: g.color, label: g.official_acronym, name: g.official_name });
    }
  }

  const summary = groups.map((g) => `${g.official_acronym || g.official_name} ${g.representatives}`).join(", ");

  return (
    <div className={styles.container}>
      <svg
        className={styles.svg}
        viewBox="0 0 300 165"
        role="img"
        aria-label={`Hemiciclo del pleno con ${totalSeats} concejales: ${summary}`}
      >
        {seats.map((seat, i) => {
          const a = assigned[i];
          if (!a) return null;
          return (
            <g key={i}>
              <circle cx={seat.x} cy={seat.y} r={radius} fill={a.color}>
                <title>{`${a.name}: 1 concejal`}</title>
              </circle>
              {radius >= 8.5 && a.label ? (
                <text
                  x={seat.x}
                  y={seat.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={radius * 0.62}
                  fontWeight={600}
                  fill={textColorFor(a.color)}
                  pointerEvents="none"
                >
                  {a.label.slice(0, 4)}
                </text>
              ) : null}
            </g>
          );
        })}
        <text x="150" y="146" textAnchor="middle" fontSize="20" fontWeight={600} fill="currentColor">
          {totalSeats}
        </text>
        <text x="150" y="160" textAnchor="middle" fontSize="8" fill="currentColor">
          concejales
        </text>
      </svg>

      <div className={styles.info}>
        <p>
          <strong>Mayoría absoluta:</strong> {majority} de {totalSeats} concejales
        </p>
        <ul className={styles.legend}>
          {groups.map((g) => (
            <li key={`${g.official_name}-${g.official_acronym}`} className={styles.legendItem}>
              <span className={styles.legendColor} style={{ backgroundColor: g.color }} aria-hidden="true" />
              <span>
                {g.official_name} ({g.representatives})
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
