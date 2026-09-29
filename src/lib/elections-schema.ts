// Esquema electoral independiente — Sin dependencias de indicator_definitions
// Contrato tipado para elecciones municipales

export interface ElectionSource {
  publisher: string;
  dataset: string;
  source_url: string;
  source_file: string;
  source_hash: string;
  downloaded_at: string;
  parsed_at: string;
  parser_version: string;
}

export interface ElectionSummary {
  census: number | null;
  voters: number | null;
  abstentions: number | null;
  participation_percentage: number | null;
  valid_votes: number | null;
  blank_votes: number | null;
  null_votes: number | null;
  votes_to_candidacies: number | null;
  representatives_total: number | null;
  majority_threshold: number | null;
  candidacies_total: number | null;
}

export interface Candidacy {
  official_name: string;
  official_acronym: string;
  ballot_order: number | null;
  votes: number | null;
  percentage_valid_votes: number | null;
  representatives: number | null;
  normalized_family_id: string | null;
  comparability_status: "unreviewed" | "comparable" | "incomparable" | "new" | "disappeared";
  source_record_id: string | null;
}

export interface ValidationRule {
  rule_id: string;
  rule_name: string;
  status: "pass" | "fail" | "warning";
  message: string;
  severity: "error" | "warning" | "info";
}

export interface ValidationReport {
  status: "valid" | "valid_with_warnings" | "invalid";
  rules: ValidationRule[];
  warnings: string[];
  errors: string[];
}

export interface QualityFlag {
  flag_id: string;
  severity: "error" | "warning" | "info";
  message: string;
  affected_fields: string[];
  source_clarification?: string;
}

export interface MunicipalityInfo {
  ine_code: string;
  name: string;
  province_code: string;
  province_name: string;
  autonomous_community: string;
}

export interface MunicipalElection {
  schema_version: "1.0";
  election_type: "municipal";
  election_date: string; // ISO 8601
  election_year: number;
  municipality: MunicipalityInfo;
  scope: {
    votes: "municipality";
    representation: "municipality";
  };
  status: "definitive" | "provisional" | "estimated";
  source: ElectionSource;
  summary: ElectionSummary;
  candidacies: Candidacy[];
  validation: ValidationReport;
  quality_flags: QualityFlag[];
  metadata?: {
    total_rows_parsed?: number;
    total_rows_retained?: number;
    parsing_duration_ms?: number;
  };
}

// Tipos para el loader
export interface LoaderOptions {
  type: "municipal";
  date: string; // ISO 8601 o fecha electoral
  codes?: string[];
  all?: boolean;
  write?: boolean;
  verify?: boolean;
  resume?: boolean;
  concurrency?: number;
  manifest?: string;
  force?: boolean;
}

export interface LoaderResult {
  election_type: "municipal";
  election_date: string;
  timestamp: string;
  summary: {
    detected: number;
    parsed: number;
    written: number;
    unchanged: number;
    failed: number;
    bytes_written: number;
    duration_ms: number;
  };
  manifest_path?: string;
  results: {
    [ine: string]: {
      status: "written" | "unchanged" | "failed" | "skipped";
      bytes?: number;
      hash?: string;
      error?: string;
    };
  };
}
