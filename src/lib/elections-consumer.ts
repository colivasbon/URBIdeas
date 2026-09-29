// Consumidor electoral — Lee objetos desde R2 sin depender de indicator_definitions

import type { MunicipalElection } from "./elections-schema";

const R2_PUBLIC_BASE = process.env.NEXT_PUBLIC_SOCIDEAS_R2_BASE || "https://pub-ecf1b1fd05e54263b2c664384c92c7b4.r2.dev";

interface ElectionCatalogEntry {
  election_type: "municipal";
  election_date: string;
  election_year: number;
  available_municipalities: number;
  manifest_path: string;
}

interface ElectionCatalog {
  schema_version: "1.0";
  timestamp: string;
  entries: ElectionCatalogEntry[];
}

export async function getElectionCatalog(): Promise<ElectionCatalog | null> {
  try {
    const res = await fetch(`${R2_PUBLIC_BASE}/socideas/elections/catalog.json`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as ElectionCatalog;
  } catch {
    return null;
  }
}

export async function getMunicipalElection(
  municipalityCode: string,
  electionDate: string
): Promise<MunicipalElection | null> {
  if (!/^\d{5}$/.test(municipalityCode)) return null;

  try {
    const res = await fetch(
      `${R2_PUBLIC_BASE}/socideas/elections/normalized/municipal/${electionDate}/${municipalityCode}.json`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;

    const obj = (await res.json()) as MunicipalElection;
    if (obj.municipality.ine_code !== municipalityCode || obj.election_date !== electionDate) {
      return null;
    }
    return obj;
  } catch {
    return null;
  }
}

export async function getMunicipalElectionSeries(
  municipalityCode: string
): Promise<MunicipalElection[]> {
  if (!/^\d{5}$/.test(municipalityCode)) return [];

  const catalog = await getElectionCatalog();
  if (!catalog) return [];

  const elections: MunicipalElection[] = [];
  for (const entry of catalog.entries) {
    if (entry.election_type !== "municipal") continue;
    const obj = await getMunicipalElection(municipalityCode, entry.election_date);
    if (obj) elections.push(obj);
  }
  return elections.sort((a, b) => b.election_year - a.election_year);
}

export async function compareMunicipalElections(
  municipalityCode: string,
  currentDate: string,
  previousDate: string
): Promise<{
  current: MunicipalElection | null;
  previous: MunicipalElection | null;
  changes?: {
    participation_change?: number;
    candidacies_new?: string[];
    candidacies_disappeared?: string[];
    representative_changes?: { [name: string]: { from: number; to: number } };
  };
}> {
  const current = await getMunicipalElection(municipalityCode, currentDate);
  const previous = await getMunicipalElection(municipalityCode, previousDate);

  return { current, previous };
}

// Validación del contrato
export function validateElection(obj: unknown): obj is MunicipalElection {
  if (!obj || typeof obj !== "object") return false;
  const e = obj as any;
  return (
    e.schema_version === "1.0" &&
    e.election_type === "municipal" &&
    typeof e.election_date === "string" &&
    typeof e.election_year === "number" &&
    e.municipality &&
    typeof e.municipality.ine_code === "string" &&
    /^\d{5}$/.test(e.municipality.ine_code) &&
    Array.isArray(e.candidacies) &&
    e.summary &&
    typeof e.summary === "object" &&
    e.validation &&
    typeof e.validation === "object"
  );
}
