import Link from "next/link";
import { BloqueElectoral } from "./ElectoralBlocks";
import { EducacionBlock } from "./IneLayersBlocks";
import { SheetPlaceholder } from "./SheetShell";
import { FICHA_SHEETS, type FichaSheetKey } from "./ficha-sheets";
import { buildElectoralPresentation } from "@/lib/socideas-elections";
import type { IndicatorValue } from "@/lib/socideas";
import type { MunicipalIneLayersV1 } from "@/lib/socideas-ine-layers";

function hrefHoja(codigoINE: string, key: FichaSheetKey): string {
  if (key === "demografia") return `/socideas/${codigoINE}`;
  return `/socideas/${codigoINE}?hoja=${key}`;
}

const ESTADO_LABEL: Record<string, string> = {
  datos: "Con datos",
  parcial: "Cobertura parcial",
  pendiente: "Pendiente",
};

/** Hoja 00: portada editorial del libro y mapa de hojas. */
export function ProyectoSheet({ codigoINE }: { codigoINE: string }) {
  return (
    <div>
      <div className="premium-card mb-8 p-5 sm:p-6">
        <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
          SOCideas publica un libro municipal comparativo organizado en nueve hojas. Cada hoja reúne
          un ámbito temático y declara su fuente, su periodo y su cobertura. La ausencia de dato se
          muestra siempre como «ND» o como bloque pendiente: nunca como cero ni con estimaciones.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-[var(--color-text-secondary)]">
          Esta ficha reproduce, apartado a apartado, la misma estructura del libro descargable en
          formato XLSX.
        </p>
      </div>

      <h3 className="ideas-h2 mb-3">Hojas del libro</h3>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FICHA_SHEETS.map((s) => (
          <li key={s.key}>
            <Link
              href={hrefHoja(codigoINE, s.key)}
              className="premium-card premium-card--hover flex h-full items-start gap-3 p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--moss-ink)]"
            >
              <span
                aria-hidden="true"
                className="mt-0.5 font-mono text-sm font-bold tabular-nums text-[var(--color-text-muted)]"
              >
                {s.code}
              </span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-[var(--color-text-primary)]">{s.label}</span>
                  <span
                    className={`rounded-[4px] px-1.5 py-0.5 text-[10px] font-semibold ${
                      s.estado === "pendiente"
                        ? "bg-[var(--color-input-bg)] text-[var(--color-text-muted)]"
                        : "bg-[var(--color-input-bg)] text-[var(--color-secondary)]"
                    }`}
                  >
                    {ESTADO_LABEL[s.estado]}
                  </span>
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-[var(--color-text-muted)]">
                  {s.descripcion}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Hoja 02: contexto político (elecciones municipales). */
export function ContextoPoliticoSheet({
  valores,
  municipio,
}: {
  valores: IndicatorValue[];
  municipio: string;
}) {
  const data = buildElectoralPresentation(valores, municipio);
  return <BloqueElectoral data={data} />;
}

/** Hoja 04: contexto sociocultural (nivel educativo + servicios pendientes). */
export function SocioculturalSheet({ ineLayers }: { ineLayers: MunicipalIneLayersV1 | null }) {
  const education = ineLayers?.layers.education ?? null;
  return (
    <div>
      {education ? (
        <EducacionBlock data={education} />
      ) : (
        <SheetPlaceholder
          title="Nivel educativo"
          description="Sin cobertura municipal verificada en esta ficha (Censo de Población y Viviendas 2021, INE). Solo se incorporará con fuente oficial y periodo homogéneo; no se estima."
          badge="Pendiente de incorporación"
        />
      )}
      <SheetPlaceholder
        title="Centros educativos, formación profesional y servicios"
        description="Pendiente de integración desde registros administrativos y catálogos oficiales. Nada se rellena con valores provisionales."
        source="Fuente prevista: registros administrativos y catálogos oficiales con cobertura municipal verificada."
      />
    </div>
  );
}

const CRITERIOS: { titulo: string; detalle: string }[] = [
  {
    titulo: "La ausencia de dato nunca equivale a 0",
    detalle:
      "Cuando una fuente no publica un valor para el municipio, se muestra «ND» o un bloque pendiente. Nunca se rellena con ceros ni con estimaciones.",
  },
  {
    titulo: "Cada tabla declara su trazabilidad",
    detalle:
      "Toda tabla indica fuente, periodo de referencia, cobertura territorial y estado (consolidado, parcial o pendiente).",
  },
  {
    titulo: "No se mezclan operaciones estadísticas",
    detalle:
      "Indicadores de operaciones distintas (por ejemplo, renta AEAT por declaración y renta ADRH por persona/hogar) se presentan por separado y nunca se combinan en una misma serie.",
  },
  {
    titulo: "Comparativas solo con mismo año y definición",
    detalle:
      "Las series territoriales se comparan únicamente cuando coinciden el año y la definición del indicador; en otro caso se muestran como cobertura parcial.",
  },
];

/** Hoja 08: criterios de lectura y acceso al registro central de fuentes. */
export function CriteriosFuentesSheet() {
  return (
    <div>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {CRITERIOS.map((c) => (
          <li key={c.titulo} className="premium-card p-4">
            <p className="text-sm font-bold text-[var(--color-text-primary)]">{c.titulo}</p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-secondary)]">{c.detalle}</p>
          </li>
        ))}
      </ul>
      <div className="ideas-status mt-6" data-state="pending" role="note">
        <div className="ideas-status__head">
          <p className="ideas-status__title">Registro centralizado de fuentes</p>
          <span className="ideas-status__badge">Hoja 08 del libro</span>
        </div>
        <div className="ideas-status__body">
          <p>
            El registro completo de fuentes —área, organismo, operación, periodo y enlace— se compila
            en la hoja «08_Criterios y fuentes» del libro XLSX, junto con las tablas de cada bloque.
          </p>
        </div>
        <p className="ideas-status__source">
          Descarga el libro desde el botón «Descargar libro XLSX» de la cabecera de esta ficha.
        </p>
      </div>
    </div>
  );
}
