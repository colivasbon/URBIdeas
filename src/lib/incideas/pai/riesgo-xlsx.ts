import ExcelJS from "exceljs";
import { NIVELES_QS, OPCIONES_R, SECTORES_PSF, type EntradaRiesgo } from "./riesgo-intrinseco";

// Exporta el cálculo de riesgo intrínseco con la misma estructura que la hoja interna
// «Cálculos riesgo intrínseco» (hoja PSF) y fórmulas vivas, para que el técnico pueda
// ajustar cantidades o coeficientes en Excel.

const MUSGO = "FF3E665C";
const HUESO = "FFF1F1F1";
const LIMO = "FFB0BDB0";
const CARBON = "FF3C403E";
const FUENTE = "Poppins";

/** Fórmula de nivel idéntica a la de la hoja original (umbrales R.D. 164/2025). */
function formulaNivel(celda: string): string {
  const [n1, n2, n3, n4, n5, n6, n7] = NIVELES_QS.map((n) => n.hasta);
  return `IF(${celda}="","No aplica",IF(${celda}<=${n1},"Bajo",IF(${celda}<=${n2},"Bajo",IF(${celda}<=${n3},"Medio",IF(${celda}<=${n4},"Medio",IF(${celda}<=${n5},"Medio",IF(${celda}<=${n6},"Alto",IF(${celda}<=${n7},"Alto","Alto"))))))))`;
}

function cabecera(row: ExcelJS.Row) {
  row.eachCell((c) => {
    c.font = { name: FUENTE, bold: true, color: { argb: HUESO }, size: 10 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: MUSGO } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.border = { bottom: { style: "thin", color: { argb: LIMO } } };
  });
}

export async function construirXlsxRiesgo(e: EntradaRiesgo): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "INCideas · IDEAS Medioambientales";
  wb.created = new Date();
  wb.calcProperties.fullCalcOnLoad = true;
  const ws = wb.addWorksheet("PSF", { views: [{ showGridLines: false }] });
  ws.properties.defaultRowHeight = 18;
  ws.columns = [
    { width: 3 },
    { width: 9 },
    { width: 28 },
    { width: 38 },
    { width: 16 },
    { width: 10 },
    { width: 16 },
    { width: 14 },
    { width: 28 },
    { width: 18 },
    { width: 20 },
  ];

  ws.getCell("C1").value = "NOMBRE DE LA PLANTA";
  ws.mergeCells("D1:E1");
  ws.getCell("D1").value = e.nombre || "";
  ws.getCell("G1").value = "Nº CTs";
  ws.getCell("H1").value = e.numeroCTs;
  ws.getCell("C2").value = "POTENCIA INSTALADA";
  ws.getCell("D2").value = e.potenciaMW;
  ws.getCell("E2").value = "MW";
  for (const a of ["C1", "C2", "G1"]) ws.getCell(a).font = { name: FUENTE, bold: true, color: { argb: CARBON } };

  // Resumen por sectores (filas 5-10).
  const resumen = ws.getRow(4);
  resumen.values = [, , "SECTOR", "IDENTIFICACIÓN", "ÁREA (m2)", "R", "Densidad calorífica (MJ/m2)", "VALORACIÓN"];
  cabecera(resumen);

  // Detalle de materiales (desde la fila 14) para conocer los rangos de cada sector.
  const primeraDetalle = 14;
  const rangos: Record<number, [number, number]> = {};
  let fila = primeraDetalle;
  for (const s of SECTORES_PSF) {
    rangos[s.id] = [fila, fila + s.materiales.length - 1];
    fila += s.materiales.length;
  }

  SECTORES_PSF.forEach((s, i) => {
    const r = 5 + i;
    const entrada = e.sectores[s.clave] ?? { area: 0, r: s.rPorDefecto };
    const [ini, fin] = rangos[s.id];
    const row = ws.getRow(r);
    row.getCell(3).value = `SECTOR ${s.id}`;
    row.getCell(4).value = s.nombre.toUpperCase();
    row.getCell(5).value = entrada.area > 0 ? entrada.area : null;
    row.getCell(6).value = entrada.r;
    row.getCell(7).value = { formula: `IF(OR(E${r}="",E${r}=0),"",(SUM(K${ini}:K${fin})*F${r})/E${r})` };
    row.getCell(8).value = { formula: formulaNivel(`G${r}`) };
    row.getCell(5).numFmt = "#,##0.00";
    row.getCell(7).numFmt = "#,##0.00";
    row.eachCell((c) => {
      c.font = { name: FUENTE, size: 10, color: { argb: CARBON } };
      c.border = { bottom: { style: "hair", color: { argb: LIMO } } };
    });
  });

  const det = ws.getRow(13);
  det.values = [
    ,
    "SECTOR",
    "MATERIAL",
    "UBICACIÓN",
    "CANTIDAD promedio",
    "UNIDAD",
    "Q (MJ/kg)",
    "Ci",
    "OBSERVACIONES",
    "CANTIDAD INSTALACIÓN (kg)",
    "FÓRMULA (PARÉNTESIS)",
  ];
  cabecera(det);

  fila = primeraDetalle;
  SECTORES_PSF.forEach((s, i) => {
    const filaArea = 5 + i;
    for (const m of s.materiales) {
      const row = ws.getRow(fila);
      row.getCell(2).value = s.id;
      row.getCell(3).value = m.material;
      row.getCell(4).value = m.ubicacion;
      row.getCell(5).value = m.cantidadTipo;
      row.getCell(6).value = s.unidadCantidad;
      row.getCell(7).value = m.q ?? "—";
      row.getCell(8).value = m.ci ?? "—";
      row.getCell(9).value = m.observaciones;
      const formulaCantidad =
        s.escala === "potencia"
          ? `E${fila}*$D$2`
          : s.escala === "centros"
            ? `E${fila}*$H$1`
            : `IF($E$${filaArea}<=10,E${fila},E${fila}*($E$${filaArea}/10))`;
      row.getCell(10).value = { formula: formulaCantidad };
      row.getCell(11).value = m.q !== null ? { formula: `G${fila}*H${fila}*J${fila}` } : "—";
      row.getCell(5).numFmt = "#,##0.00";
      row.getCell(10).numFmt = "#,##0.00";
      row.getCell(11).numFmt = "#,##0.00";
      row.eachCell((c) => {
        c.font = { name: FUENTE, size: 9, color: { argb: CARBON } };
        c.border = { bottom: { style: "hair", color: { argb: LIMO } } };
      });
      fila++;
    }
  });

  const qs = wb.addWorksheet("Qs");
  qs.columns = [{ width: 28 }, { width: 8 }, { width: 24 }];
  const hq = qs.addRow(["Nivel de riesgo intrínseco", "Nivel", "Densidad de carga de fuego (MJ/m²)"]);
  cabecera(hq);
  for (const n of NIVELES_QS) qs.addRow([n.riesgo, n.nivel, n.rango]);

  const rs = wb.addWorksheet("R");
  rs.columns = [{ width: 8 }, { width: 110 }];
  const hr = rs.addRow(["R", "Casuísticas (R.D. 164/2025)"]);
  cabecera(hr);
  for (const o of OPCIONES_R) rs.addRow([o.valor, o.descripcion]).getCell(2).alignment = { wrapText: true };

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}
