import type { MunicipalStructureWithBenchmarks, TerritorialBenchmark } from "./socideas-population-runtime";
import type { StructureValueStatus } from "./socideas-population-structure";

export const ESTRUCTURA_REF_KEYS = ["espana", "provincia", "ccaa"] as const;
export type EstructuraRefKey = (typeof ESTRUCTURA_REF_KEYS)[number];

export const ESTRUCTURA_MODOS = ["perfil", "diferencia"] as const;
export type EstructuraModo = (typeof ESTRUCTURA_MODOS)[number];

export const ESTRUCTURA_REF_LABEL: Record<EstructuraRefKey, string> = {
  espana: "España",
  provincia: "Provincia",
  ccaa: "Comunidad autónoma",
};

export function isEstructuraRefKey(value: unknown): value is EstructuraRefKey {
  return typeof value === "string" && (ESTRUCTURA_REF_KEYS as readonly string[]).includes(value);
}

export function isEstructuraModo(value: unknown): value is EstructuraModo {
  return typeof value === "string" && (ESTRUCTURA_MODOS as readonly string[]).includes(value);
}

export function benchmarkFor(
  dto: MunicipalStructureWithBenchmarks,
  key: EstructuraRefKey,
): TerritorialBenchmark | null {
  if (key === "espana") return dto.benchmarks.nacional;
  if (key === "provincia") return dto.benchmarks.provincia;
  return dto.benchmarks.ccaa;
}

export interface EstructuraRefOption {
  key: EstructuraRefKey;
  label: string;
  name: string;
  available: boolean;
  total: number | null;
}

export function estructuraRefOptions(
  dto: MunicipalStructureWithBenchmarks,
  fallbackNames: Partial<Record<EstructuraRefKey, string | null | undefined>> = {},
): EstructuraRefOption[] {
  return ESTRUCTURA_REF_KEYS.map((key) => {
    const benchmark = benchmarkFor(dto, key);
    const fallback = fallbackNames[key];
    return {
      key,
      label: ESTRUCTURA_REF_LABEL[key],
      name: benchmark?.name ?? (fallback && fallback.trim().length > 0 ? fallback : ESTRUCTURA_REF_LABEL[key]),
      available: benchmark !== null && benchmark.bands.length === dto.bands.length,
      total: benchmark?.totals.total ?? null,
    };
  });
}

export function formatInt(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "ND";
  return value.toLocaleString("es-ES");
}

export function formatNumber(value: number | null, decimals = 1): string {
  if (value === null || !Number.isFinite(value)) return "ND";
  return value.toLocaleString("es-ES", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatSigned(value: number | null, decimals = 1, suffix = ""): string {
  if (value === null || !Number.isFinite(value)) return "ND";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${formatNumber(Math.abs(value), decimals)}${suffix}`;
}

export function shortBandLabel(band: string): string {
  const text = band.trim().replace(/^De\s+/i, "");
  if (/^100/i.test(text)) return "100+";
  const match = /^(\d{1,3})/.exec(text);
  if (match === null) return band;
  const from = Number(match[1]);
  return `${from}-${from + 4}`;
}

export interface EstructuraViewRow {
  band: string;
  status: StructureValueStatus;
  male: number | null;
  female: number | null;
  total: number | null;
  maleShare: number | null;
  femaleShare: number | null;
  refMaleShare: number | null;
  refFemaleShare: number | null;
  maleDiffPp: number | null;
  femaleDiffPp: number | null;
}

export interface EstructuraCardView {
  key: string;
  label: string;
  unit: string;
  definition: string;
  period: string;
  municipal: number | null;
  municipalCount: number | null;
  reference: number | null;
  difference: number | null;
  differenceUnit: string;
  precision: number;
}

export interface EstructuraNarrative {
  ruleId: string;
  text: string;
}

export interface EstructuraView {
  period: string;
  municipalName: string;
  municipalTotal: number | null;
  municipalMale: number | null;
  municipalFemale: number | null;
  refKey: EstructuraRefKey;
  refName: string;
  refTotal: number | null;
  refMale: number | null;
  refFemale: number | null;
  hasReference: boolean;
  isDifference: boolean;
  scale: number;
  rows: EstructuraViewRow[];
  cards: EstructuraCardView[];
  narrative: EstructuraNarrative[];
  ndBands: number;
}

type CardKind = "share" | "ratio" | "age";

interface CardSpec {
  key: string;
  label: string;
  kind: CardKind;
  unit: string;
  differenceUnit: string;
  precision: number;
  definition: string;
}

const CARD_SPECS: readonly CardSpec[] = [
  {
    key: "edad_media",
    label: "Edad media",
    kind: "age",
    unit: "años",
    differenceUnit: "años",
    precision: 2,
    definition: "Media ponderada por grupos quinquenales de edad (punto medio de cada grupo).",
  },
  {
    key: "menores16",
    label: "Menores de 16 años",
    kind: "share",
    unit: "% del total",
    differenceUnit: "pp",
    precision: 1,
    definition: "Peso de las personas de 0 a 15 años sobre la población total.",
  },
  {
    key: "mayores65",
    label: "65 años o más",
    kind: "share",
    unit: "% del total",
    differenceUnit: "pp",
    precision: 1,
    definition: "Peso de las personas de 65 y más años sobre la población total.",
  },
  {
    key: "mayores80",
    label: "80 años o más",
    kind: "share",
    unit: "% del total",
    differenceUnit: "pp",
    precision: 1,
    definition: "Peso de las personas de 80 y más años sobre la población total.",
  },
  {
    key: "dependencia_total",
    label: "Dependencia total",
    kind: "ratio",
    unit: "%",
    differenceUnit: "pp",
    precision: 1,
    definition: "Población de 0 a 14 y de 65 o más años por cada 100 personas de 16 a 64 años.",
  },
  {
    key: "indice_envejecimiento",
    label: "Envejecimiento",
    kind: "ratio",
    unit: "%",
    differenceUnit: "pp",
    precision: 1,
    definition: "Personas de 65 y más años por cada 100 menores de 15 años.",
  },
];

const round = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const round1 = (value: number): number => round(value, 1);

function share(value: number | null, total: number | null): number | null {
  if (value === null || total === null || total === 0) return null;
  return round((value / total) * 100, 2);
}

function indicatorValue(list: readonly { key: string; value: number | null }[], key: string): number | null {
  const found = list.find((item) => item.key === key);
  return found?.value ?? null;
}

function niceCeil(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const step = value > 20 ? 5 : value > 10 ? 2 : value > 5 ? 1 : 0.5;
  return round(Math.ceil(value / step) * step, 2);
}

function comparePhrase(difference: number, unit: string): string {
  const rounded = round1(difference);
  if (rounded === 0) return `igual (diferencia de 0,0 ${unit})`;
  return `${formatNumber(Math.abs(rounded), 1)} ${unit} ${rounded > 0 ? "superior" : "inferior"}`;
}

export function buildEstructuraView(
  dto: MunicipalStructureWithBenchmarks,
  refKey: EstructuraRefKey,
  modo: EstructuraModo,
  fallbackNames: Partial<Record<EstructuraRefKey, string | null | undefined>> = {},
): EstructuraView {
  const benchmark = benchmarkFor(dto, refKey);
  const ref = benchmark !== null && benchmark.bands.length === dto.bands.length ? benchmark : null;
  const isDifference = modo === "diferencia";

  const rows: EstructuraViewRow[] = dto.bands.map((band, index) => {
    const refBand = ref === null ? null : (ref.bands[index] ?? null);
    const maleShare = share(band.male, dto.totals.total);
    const femaleShare = share(band.female, dto.totals.total);
    const refMaleShare = ref === null || refBand === null ? null : share(refBand.male, ref.totals.total);
    const refFemaleShare = ref === null || refBand === null ? null : share(refBand.female, ref.totals.total);
    return {
      band: band.band,
      status: band.status,
      male: band.male,
      female: band.female,
      total: band.total,
      maleShare,
      femaleShare,
      refMaleShare,
      refFemaleShare,
      maleDiffPp: maleShare !== null && refMaleShare !== null ? round1(maleShare - refMaleShare) : null,
      femaleDiffPp: femaleShare !== null && refFemaleShare !== null ? round1(femaleShare - refFemaleShare) : null,
    };
  });

  const scaleValues = rows.flatMap((row) =>
    isDifference
      ? [row.maleDiffPp === null ? null : Math.abs(row.maleDiffPp), row.femaleDiffPp === null ? null : Math.abs(row.femaleDiffPp)]
      : [row.maleShare, row.femaleShare, row.refMaleShare, row.refFemaleShare],
  );
  const maxValue = scaleValues.reduce<number>((acc, value) => (value !== null && value > acc ? value : acc), 0);

  const cards: EstructuraCardView[] = CARD_SPECS.map((spec) => {
    const municipalIndicator = indicatorValue(dto.indicators, spec.key);
    const referenceIndicator = ref === null ? null : indicatorValue(ref.indicators, spec.key);
    const municipal = spec.kind === "share" ? share(municipalIndicator, dto.totals.total) : municipalIndicator;
    const reference = ref === null ? null : spec.kind === "share" ? share(referenceIndicator, ref.totals.total) : referenceIndicator;
    const difference = municipal !== null && reference !== null ? round(municipal - reference, spec.precision) : null;
    return {
      key: spec.key,
      label: spec.label,
      unit: spec.unit,
      definition: spec.definition,
      period: dto.period,
      municipal,
      municipalCount: spec.kind === "share" ? municipalIndicator : null,
      reference,
      difference,
      differenceUnit: spec.differenceUnit,
      precision: spec.precision,
    };
  });

  const narrative: EstructuraNarrative[] = [];
  if (ref !== null) {
    const share65Municipal = share(indicatorValue(dto.indicators, "mayores65"), dto.totals.total);
    const share65Reference = share(indicatorValue(ref.indicators, "mayores65"), ref.totals.total);
    if (share65Municipal !== null && share65Reference !== null) {
      narrative.push({
        ruleId: "peso-65-vs-referencia",
        text: `El peso de las personas de 65 y más años en ${dto.municipalityName} es ${comparePhrase(share65Municipal - share65Reference, "pp")} al de ${ref.name} en ${dto.period}.`,
      });
    }
    const share80Municipal = share(indicatorValue(dto.indicators, "mayores80"), dto.totals.total);
    const share80Reference = share(indicatorValue(ref.indicators, "mayores80"), ref.totals.total);
    if (share80Municipal !== null && share80Reference !== null) {
      narrative.push({
        ruleId: "peso-80-vs-referencia",
        text: `El peso de las personas de 80 y más años en ${dto.municipalityName} es ${comparePhrase(share80Municipal - share80Reference, "pp")} al de ${ref.name} en ${dto.period}.`,
      });
    }
    const ageMunicipal = indicatorValue(dto.indicators, "edad_media");
    const ageReference = indicatorValue(ref.indicators, "edad_media");
    if (ageMunicipal !== null && ageReference !== null) {
      narrative.push({
        ruleId: "edad-media-vs-referencia",
        text: `La edad media de ${dto.municipalityName} es ${comparePhrase(ageMunicipal - ageReference, "años")} a la de ${ref.name} en ${dto.period}.`,
      });
    }
  }

  return {
    period: dto.period,
    municipalName: dto.municipalityName,
    municipalTotal: dto.totals.total,
    municipalMale: dto.totals.male,
    municipalFemale: dto.totals.female,
    refKey,
    refName: ref?.name ?? fallbackNames[refKey] ?? ESTRUCTURA_REF_LABEL[refKey],
    refTotal: ref?.totals.total ?? null,
    refMale: ref?.totals.male ?? null,
    refFemale: ref?.totals.female ?? null,
    hasReference: ref !== null,
    isDifference,
    scale: niceCeil(maxValue),
    rows,
    cards,
    narrative,
    ndBands: rows.filter((row) => row.status !== "observed").length,
  };
}