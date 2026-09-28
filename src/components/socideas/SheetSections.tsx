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
// ○ / — más texto sr-only): la representación textual antigua de estado se
// retiró para no duplicar mensajes inaccesibles.

/** Hoja 00: portada editorial del libro y mapa de hojas. */
export function ProyectoSheet({ codigoINE }: { codigoINE: string }) {
  return (
    <div className="border-t border-[var(--border-subtle)] py-10">
      <div className="max-w-[70ch]">
        <p className="leading-relaxed text-[var(--text-secondary)]">
          SOCideas publica un libro municipal comparativo organizado en nueve hojas. Cada hoja reúne
          un ámbito temático y declara su fuente, su periodo y su cobertura. La ausencia de dato se
          muestra siempre como «ND» o como bloque pendiente: nunca como cero ni con estimaciones.
        </p>
        <p className="mt-3 leading-relaxed text-[var(--text-secondary)]">
          Esta ficha reproduce, apartado a apartado, la misma estructura del libro descargable en
          formato XLSX.
        </p>
      </div>

      <h3 className="type-h3 mt-10 text-[var(--text-primary)]">Hojas del libro</h3>
      <ul className="mt-4 border-t border-[var(--border-strong)]">
        {FICHA_SHEETS.map((s) => (
          <li key={s.key} className="border-b border-[var(--border-subtle)]">
            <Link
              href={hrefHoja(codigoINE, s.key)}
              className="group grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 py-4 transition-colors hover:bg-[var(--bg-surface-sunken)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--border-focus)] sm:grid-cols-[2.5rem_14rem_minmax(0,1fr)] sm:gap-x-6"
            >
              <span aria-hidden="true" className="pl-1 text-sm tabular-nums text-[var(--text-muted)]">
                {s.code}
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-[var(--text-link)] underline-offset-4 group-hover:underline">
                  {s.label}
                </span>
                <SheetStatusGlyph sheet={s} selected={false} />
              </span>
              <span className="col-start-2 mt-1 block max-w-[62ch] text-[13px] leading-relaxed text-[var(--text-secondary)] sm:col-start-3 sm:mt-0">
                {s.descripcion}
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
        fuente="Ministerio del Interior, Infoelectoral; Junta de Comunidades de Castilla-La Mancha"
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
          title="Contexto rural: Grupo de Acción Local (GAL)"
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
        fuente="Wikipedia y Wikidata; Red PAC España; datos.gob.es"
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
    uso: "Hoja 07: directorio asociativo con aviso de verificación",
    actualizado: "2026-09-25",
  },
  {
    fuente: "Registros autonómicos sin descarga estructurada (9 CCAA) y sin fuente (5 territorios)",
    uso: "Hoja 07: estado declarado, nunca datos inventados",
    actualizado: "2026-09-25",
  },
  {
    fuente: "Red PAC España, datos.gob.es (GAL/LEADER) y Datos Abiertos CLM (GDR PEPAC 2023-2027)",
    uso: "Hoja 05: Grupo de Acción Local del municipio",
    actualizado: "2026-09-25",
  },
  {
    fuente: "Wikipedia (CC BY-SA 4.0) y Wikidata (P1435, P856, P625, P571, P18)",
    uso: "Hoja 05: resumen y bienes patrimoniales, con atribución",
    actualizado: "2026-09-25",
  },
  {
    fuente: "INE, Censo Anual de Población, tablas 68521 y 68535",
    uso: "Hoja 01: estructura de población 2025 (pirámide)",
    actualizado: "2025-01-01",
  },
  {
    fuente: "Infoelectoral (Congreso y Senado) y Datos Abiertos CLM + DOCM 2023/5411 (Cortes)",
    uso: "Hoja 02: resultados de la circunscripción de Toledo 2023",
    actualizado: "2023-07-23",
  },
];

/** Hoja 08: criterios de lectura y acceso al registro central de fuentes. */
export function CriteriosFuentesSheet() {
  return (
    <div className="border-t border-[var(--border-subtle)] py-10">
      <h3 className="type-h3 text-[var(--text-primary)]">Criterios de lectura</h3>
      <ul className="mt-4 grid grid-cols-1 gap-x-10 sm:grid-cols-2">
        {CRITERIOS.map((c) => (
          <li key={c.titulo} className="border-t border-[var(--border-subtle)] py-4">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{c.titulo}</p>
            <p className="mt-1 max-w-[62ch] text-[13px] leading-relaxed text-[var(--text-secondary)]">{c.detalle}</p>
          </li>
        ))}
      </ul>
      <h3 className="type-h3 mt-12 text-[var(--text-primary)]">Fuentes añadidas en la versión 2.3</h3>
      <div className="socideas-table-shell__scroll mt-4 overflow-x-auto" role="region" aria-label="Tabla: fuentes añadidas en la versión 2.3" tabIndex={0}>
        <table className="socideas-table">
          <caption className="sr-only">
            Fuentes incorporadas en la versión 2.3, su uso en la ficha y su fecha de última
            actualización
          </caption>
          <thead>
            <tr>
              <th scope="col" className="socideas-table__text">Fuente</th>
              <th scope="col" className="socideas-table__text">Uso en la ficha</th>
              <th scope="col" className="socideas-table__year">Última actualización</th>
            </tr>
          </thead>
          <tbody>
            {FUENTES_V23.map((f) => (
              <tr key={f.fuente}>
                <td className="socideas-table__text min-w-[16rem]">{f.fuente}</td>
                <td className="min-w-[14rem] text-[var(--text-secondary)]">{f.uso}</td>
                <td className="socideas-table__year">{f.actualizado}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="note mt-8 max-w-[70ch]" data-state="pending" role="note">
        <p className="font-medium text-[var(--text-primary)]">Registro centralizado de fuentes</p>
        <p className="mt-1">
          El registro completo de fuentes (área, organismo, operación, periodo y enlace) se compila
          en la hoja «08_Criterios y fuentes» del libro XLSX, junto con las tablas de cada bloque.
          Descargue el libro con el botón «Descargar libro XLSX» de la cabecera de esta ficha.
        </p>
      </div>
    </div>
  );
}
