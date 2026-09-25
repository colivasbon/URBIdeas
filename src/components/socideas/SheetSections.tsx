import Link from "next/link";
import { BloqueElectoral } from "./ElectoralBlocks";
import { ElectoralProvincialBloques } from "./ElectoralProvincialBloques";
import { EducacionBlock } from "./IneLayersBlocks";
import { SheetPlaceholder, FreshnessLine } from "./SheetShell";
import { SheetStatusGlyph } from "./DataStatusBadge";
import { PatrimonioBloque } from "./PatrimonioBloque";
import { GalBloque } from "./GalBloque";
import { FICHA_SHEETS, type FichaSheetKey } from "./ficha-sheets";
import { buildElectoralPresentation } from "@/lib/socideas-elections";
import type { ElectoralProvincialBundle } from "@/lib/socideas-electoral-provincial-store";
import type { WikipediaEnrichment } from "@/lib/wikipedia-enrichment";
import type { GalMunicipio } from "@/lib/socideas-gal";
import type { IndicatorValue } from "@/lib/socideas";
import type { MunicipalIneLayersV1 } from "@/lib/socideas-ine-layers";

function hrefHoja(codigoINE: string, key: FichaSheetKey): string {
  if (key === "demografia") return `/socideas/${codigoINE}`;
  return `/socideas/${codigoINE}?hoja=${key}`;
}

// El estado visible de cada hoja lo pinta `SheetStatusGlyph` (glifo ✓ / ~ /
// ⏳ / — más texto sr-only): la representación textual antigua de estado se
// retiró para no duplicar mensajes inaccesibles.

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
                  <SheetStatusGlyph sheet={s} selected={false} />
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

/** Hoja 02: contexto político (elecciones municipales + circunscripción). */
export function ContextoPoliticoSheet({
  valores,
  municipio,
  provincial,
}: {
  valores: IndicatorValue[];
  municipio: string;
  provincial: ElectoralProvincialBundle | null;
}) {
  const data = buildElectoralPresentation(valores, municipio);
  return (
    <div>
      <BloqueElectoral data={data} />
      <ElectoralProvincialBloques bundle={provincial} municipio={municipio} />
      {!provincial && (
        <SheetPlaceholder
          title="Elecciones autonómicas, Congreso y Senado por circunscripción"
          description="Resultados de la circunscripción provincial: no existen desgloses municipales para estas elecciones. Cuando el objeto provincial esté publicado en R2 se mostrarán aquí con su nota de cobertura; nunca se atribuirán escaños ni votos al municipio."
          badge="Pendiente de publicación provincial"
        />
      )}
      <FreshnessLine
        periodo="2023"
        fuente="Ministerio del Interior · Infoelectoral; Junta de Comunidades de Castilla-La Mancha"
        actualizado="2026-09-25"
        nota="Municipales: ámbito municipal. Autonómico, Congreso y Senado: ámbito de la circunscripción provincial."
      />
    </div>
  );
}

/** Hoja 05: patrimonio y turismo (Wikipedia/Wikidata + GAL). */
export function PatrimonioSheet({
  wikipedia,
  gal,
  municipio,
}: {
  wikipedia: WikipediaEnrichment | null;
  gal: GalMunicipio | null;
  municipio: string;
}) {
  return (
    <div>
      <PatrimonioBloque data={wikipedia} municipio={municipio} />
      {gal ? (
        <GalBloque data={gal} municipio={municipio} />
      ) : (
        <SheetPlaceholder
          title="Contexto rural — Grupo de Acción Local (GAL)"
          description="Sin datos publicados de GAL para este municipio. La pertenencia a un Grupo de Acción Local (LEADER/FEADER) se declara solo cuando existe una fuente estructurada que cubra el territorio; nunca se infiere."
          badge="Sin datos"
        />
      )}
      <SheetPlaceholder
        title="Alojamientos turísticos y rutas"
        description="Pendiente de integración desde registros turísticos oficiales con cobertura territorial y licencia verificadas. Categorías no homogéneas entre comunidades autónomas: no se comparan entre CCAA."
        source="Fuente prevista: registros de establecimientos turísticos por CCAA."
      />
      <FreshnessLine
        periodo={wikipedia ? `Consulta ${wikipedia.retrievedAt.slice(0, 10)}` : undefined}
        fuente="Wikipedia / Wikidata · Red PAC España · datos.gob.es"
        actualizado="2026-09-25"
        nota="Contenido de Wikipedia bajo CC BY-SA 4.0 con atribución visible. Verificar en la web del GAL la vigencia del ámbito territorial."
      />
    </div>
  );
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
  {
    titulo: "Un resultado provincial nunca es municipal",
    detalle:
      "Los bloques autonómico, Congreso y Senado corresponden a la circunscripción electoral, no al municipio. Llevan su nota de cobertura, se muestran en tablas separadas y sus escaños jamás se suman entre cámaras.",
  },
  {
    titulo: "Aviso de verificación en asociaciones y GAL",
    detalle:
      "Los datos de registros autonómicos de asociaciones y de Grupos de Acción Local pueden no reflejar bajas, altas o cambios de ámbito posteriores a la fecha de descarga. Verificar en el registro autonómico o en la web del GAL antes de cualquier uso oficial.",
  },
  {
    titulo: "Contenido de Wikipedia con atribución",
    detalle:
      "El resumen y los bienes patrimoniales proceden de Wikipedia/Wikidata bajo licencia CC BY-SA 4.0, con atribución visible, enlace al artículo y fecha de consulta. Solo se publican imágenes con licencia libre verificada.",
  },
];

/** Fuentes nuevas de v2.3 con su fecha real de última actualización. */
const FUENTES_V23: { fuente: string; uso: string; actualizado: string }[] = [
  {
    fuente: "Registros autonómicos de asociaciones (CLM, C. Valenciana, Galicia, La Rioja, Navarra)",
    uso: "Hoja 07 · directorio asociativo con aviso de verificación",
    actualizado: "2026-09-25",
  },
  {
    fuente: "Registros autonómicos sin descarga estructurada (9 CCAA) y sin fuente (5 territorios)",
    uso: "Hoja 07 · estado declarado, nunca datos inventados",
    actualizado: "2026-09-25",
  },
  {
    fuente: "Red PAC España · datos.gob.es (GAL/LEADER) y Datos Abiertos CLM (GDR PEPAC 2023-2027)",
    uso: "Hoja 05 · Grupo de Acción Local del municipio",
    actualizado: "2026-09-25",
  },
  {
    fuente: "Wikipedia (CC BY-SA 4.0) y Wikidata (P1435, P856, P625, P571, P18)",
    uso: "Hoja 05 · resumen y bienes patrimoniales, con atribución",
    actualizado: "2026-09-25",
  },
  {
    fuente: "INE · Censo Anual de Población, tablas 68521 y 68535",
    uso: "Hoja 01 · estructura de población 2025 (pirámide)",
    actualizado: "2025-01-01",
  },
  {
    fuente: "Infoelectoral (Congreso y Senado) y Datos Abiertos CLM + DOCM 2023/5411 (Cortes)",
    uso: "Hoja 02 · resultados de la circunscripción de Toledo 2023",
    actualizado: "2023-07-23",
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
      <h3 className="ideas-h2 mb-3 mt-8">Fuentes añadidas en v2.3</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">
            Fuentes incorporadas en la versión 2.3, su uso en la ficha y su fecha de última
            actualización
          </caption>
          <thead>
            <tr className="text-left text-xs text-[var(--color-text-muted)]">
              <th scope="col" className="py-2 pr-4 font-medium">Fuente</th>
              <th scope="col" className="py-2 pr-4 font-medium">Uso en la ficha</th>
              <th scope="col" className="py-2 font-medium">Última actualización</th>
            </tr>
          </thead>
          <tbody>
            {FUENTES_V23.map((f) => (
              <tr key={f.fuente} className="border-t border-[var(--color-border-subtle)]">
                <td className="py-2 pr-4">{f.fuente}</td>
                <td className="py-2 pr-4">{f.uso}</td>
                <td className="py-2 tabular-nums">{f.actualizado}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
