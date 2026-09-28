import DataStatusBadge from "./DataStatusBadge";
import { FuenteOficial, Metodologia } from "./ConsultaTools";
import type {
  ConprelFamiliaPresentacion,
  ConprelIndicadorFila,
  ConprelPresentacion,
} from "@/lib/conprel-presentation";
import { CONPREL_NO_PUBLICADO_TEXTO } from "@/lib/conprel-textos";

/**
 * Sección CONPREL de la ficha: Presupuestos (PPTO-2025) y Liquidaciones
 * (LIQ-2024) como familias separadas, detrás de NEXT_PUBLIC_CONPREL_UI.
 *
 * - Cada indicador declara período, unidad, fuente y definición.
 * - Badge `partial` por familia con cobertura congelada (90,3 % / 84,4 %).
 * - Ausencia = «No consta registro municipal en el fichero consultado»;
 *   un 0 publicado se distingue visualmente de ND.
 * - Sin mezcla AEAT/ADRH: bloque propio `hacienda_conprel`.
 */
export default function ConprelSeccion({
  presentacion,
}: {
  /** null = flag ON pero dataset sin cargar → «preparado, no publicado». */
  presentacion: ConprelPresentacion | null;
}) {
  if (!presentacion) {
    return (
      <section aria-label="Presupuestos y liquidaciones (CONPREL)" className="border-t border-[var(--border-subtle)] py-10">
        <h2 className="type-h3 text-[var(--text-primary)]">Presupuestos y liquidaciones (CONPREL)</h2>
        <div className="mt-4 rounded-[6px] border border-dashed border-[var(--border-default)] px-5 py-4" data-state="pending" role="status">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="type-h4 text-[var(--text-primary)]">Bloque CONPREL</p>
            <span className="socideas-badge" data-tone="draft">
              <span aria-hidden="true" className="socideas-badge__dot" />
              Preparado, no publicado
            </span>
          </div>
          <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-[var(--text-secondary)]">{CONPREL_NO_PUBLICADO_TEXTO}</p>
        </div>
      </section>
    );
  }

  const { ppto, liq, cruceTexto, notasTerritoriales } = presentacion;

  return (
    <section aria-label="Presupuestos y liquidaciones (CONPREL)" className="border-t border-[var(--border-subtle)] py-10">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="type-h3 text-[var(--text-primary)]">Presupuestos y liquidaciones (CONPREL)</h2>
        <DataStatusBadge estado="parcial" />
      </div>

      <p className="note mt-4 max-w-[70ch]" role="note">
        <span className="font-medium text-[var(--text-primary)]">{presentacion.notaSerie}</span>
      </p>

      <p className="mt-3 max-w-[70ch] text-sm leading-relaxed text-[var(--text-secondary)]" role="status">
        {cruceTexto}
      </p>

      {notasTerritoriales.map((nota) => (
        <p
          key={nota}
          className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-[var(--text-muted)]"
          role="note"
        >
          {nota}
        </p>
      ))}

      <div className="mt-8 grid grid-cols-1 gap-x-10 gap-y-10 xl:grid-cols-2">
        <FamiliaConprel bloqueId={`conprel-ppto-${presentacion.codigoINE}`} familia={ppto} />
        <FamiliaConprel bloqueId={`conprel-liq-${presentacion.codigoINE}`} familia={liq} />
      </div>

      <p className="mt-6 max-w-[70ch] text-[13px] leading-relaxed text-[var(--text-muted)]">{presentacion.notaNd}</p>
      <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-[var(--text-muted)]">{presentacion.notaAntiComparacion}</p>
    </section>
  );
}

function FamiliaConprel({
  bloqueId,
  familia,
}: {
  bloqueId: string;
  familia: ConprelFamiliaPresentacion;
}) {
  const ausente = !familia.presente;
  return (
    <div className="min-w-0 border-t border-[var(--border-strong)] pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="type-h4 text-[var(--text-primary)]">{familia.titulo}</h3>
        <DataStatusBadge estado="parcial" />
      </div>
      <p className="mt-1 text-[13px] text-[var(--text-muted)]">
        Ejercicio <span className="tabular-nums">{familia.ejercicio}</span>, {familia.etiquetaCorte}, tabla {familia.tableId}
      </p>
      <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-[var(--text-secondary)]">
        {familia.coberturaTexto}
      </p>

      {ausente && (
        <p
          className="mt-4 rounded-[6px] border border-dashed border-[var(--border-default)] px-4 py-3 text-sm leading-relaxed text-[var(--text-secondary)]"
          role="status"
        >
          <span className="socideas-badge mr-2" role="status">
            ND
          </span>
          {familia.ausenciaTexto}
        </p>
      )}

      {!ausente && (
        <div className="socideas-table-shell__scroll overflow-x-auto" role="region" aria-label={`Tabla: ${familia.titulo}`} tabIndex={0}>
        <table id={bloqueId} className="socideas-table">
          <caption className="sr-only">
            {familia.titulo} — indicadores CONPREL del municipio
          </caption>
          <thead>
            <tr>
              <th scope="col" className="socideas-table__year">
                Ejercicio
              </th>
              <th scope="col" className="socideas-table__text">
                Concepto
              </th>
              <th scope="col" className="socideas-table__text">
                Magnitud
              </th>
              <th scope="col" className="socideas-table__numeric">
                Valor
              </th>
            </tr>
          </thead>
          <tbody>
            {familia.filas.map((fila) => (
              <FilaConprel key={`${fila.slug}-${fila.cdcta}-${fila.tipreig}`} fila={fila} />
            ))}
          </tbody>
        </table>
        </div>
      )}

      {ausente && (
        <ul className="mt-4">
          {familia.filas.map((fila) => (
            <li
              key={fila.slug}
              className="border-t border-[var(--border-subtle)] py-3"
            >
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {fila.nombre}
              </p>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                Período: {fila.periodo}. Unidad: {fila.unidad}. Fuente: {fila.fuente}.
              </p>
              <p className="mt-0.5 max-w-[70ch] text-xs leading-relaxed text-[var(--text-secondary)]">
                {fila.definicion}
              </p>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 max-w-[70ch] text-[13px] leading-relaxed text-[var(--text-muted)]">{familia.pie}</p>
      <div className="mt-2">
        <FuenteOficial url={familia.fuenteUrl} etiqueta="Descarga oficial CONPREL" />
      </div>

      {!ausente && (
        <div className="mt-3">
          <Metodologia
            nombre={`${familia.titulo} (CONPREL)`}
            definicion={
              familia.familia === "ppto"
                ? "Presupuesto de la publicación definitiva CONPREL del ejercicio 2025 por cuenta EHA (capítulos 1 ingresos y 2 gastos)."
                : "Liquidaciones definitivas CONPREL 2024: presupuesto (imported), reconocidos (importer), liquidado (importel) y ejercicios cerrados (importec)."
            }
            fuente={familia.fuente}
            periodo={String(familia.ejercicio)}
            cobertura={familia.coberturaTexto}
            estado="Cobertura parcial (partial) por familia y ejercicio"
            limitacion="Presupuesto y liquidación son ficheros distintos: no se calcula ejecución cruzando familias. ND ≠ 0."
          />
        </div>
      )}
    </div>
  );
}

function FilaConprel({ fila }: { fila: ConprelIndicadorFila }) {
  return (
    <tr>
      <td className="socideas-table__year">{fila.ejercicio}</td>
      <td className="socideas-table__text">
        <span className="block">{fila.concepto}</span>
        <span className="mt-0.5 block text-xs font-normal text-[var(--text-muted)]">
          {fila.nombre}
        </span>
        <span className="mt-0.5 block text-xs font-normal text-[var(--text-muted)]">
          {fila.definicion}
        </span>
        <span className="mt-0.5 block text-xs font-normal text-[var(--text-muted)]">
          Período: {fila.periodo}. Unidad: {fila.unidad}.
        </span>
      </td>
      <td className="socideas-table__text">{fila.magnitud}</td>
      <td className="socideas-table__numeric">
        {fila.ausente ? (
          <span className="socideas-badge" role="status" title={fila.concepto}>
            ND
          </span>
        ) : fila.esCeroPublicado ? (
          <span className="tabular-nums" title="Cero publicado por la fuente (no es ND)">
            0 €
            <span className="ml-1 text-xs font-medium text-[var(--text-muted)]">
              cero publicado
            </span>
          </span>
        ) : (
          <span className="tabular-nums">
            {(fila.valor ?? 0).toLocaleString("es-ES", { maximumFractionDigits: 2 })} €
          </span>
        )}
      </td>
    </tr>
  );
}
