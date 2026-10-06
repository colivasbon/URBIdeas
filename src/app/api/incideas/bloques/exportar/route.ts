// GET /api/incideas/bloques/exportar?ine=03031&formato=xlsx|csv|json
//
// Libro Fase 1 por municipio desde UNA misma lectura (cobertura + R2):
// portada con snapshot, una hoja por bloque con fuente/edición/evidencia y
// hoja de estados. Sin datos personales (ya excluidos en la carga).

import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createSupabaseServerSafe } from "@/lib/supabase-server";
import { getCoberturaMunicipio, getUltimaSnapshot } from "@/lib/incideas/fase3/lectura";
import type { EnvoltorioBloque } from "@/lib/incideas/fase3/r2";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const INE_RE = /^\d{5}$/;
const R2_BASE =
  process.env.NEXT_PUBLIC_SOCIDEAS_R2_BASE ||
  "https://pub-ecf1b1fd05e54263b2c664384c92c7b4.r2.dev";

type Fila = Array<string | number | null>;

async function leerBloqueR2(bloque: string, edicion: string, ine: string): Promise<{ objetos: Record<string, unknown>[]; fuente: string; edicion: string; url: string } | null> {
  const ed = edicion.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24) || "sinedicion";
  const clave = `incideas/fase3/${bloque}/${ed}/${ine}.json`;
  try {
    const r = await fetch(`${R2_BASE}/${clave}`, { headers: { "User-Agent": "INCideas-Fase3/0.1" } });
    if (!r.ok) return null;
    const env = (await r.json()) as EnvoltorioBloque<Record<string, unknown>>;
    return { objetos: env.objetos ?? [], fuente: env.fuente, edicion: env.edicion, url: `${R2_BASE}/${clave}` };
  } catch {
    return null;
  }
}

function filasDe(objetos: Record<string, unknown>[]): { columnas: string[]; filas: Fila } {
  const columnas: string[] = [];
  for (const o of objetos.slice(0, 50)) {
    for (const k of Object.keys(o)) {
      if (typeof o[k] !== "object" && !columnas.includes(k)) columnas.push(k);
    }
  }
  const cols = columnas.slice(0, 14);
  const filas = objetos.map((o) =>
    cols.map((c) => {
      const v = o[c];
      if (v === null || v === undefined) return null;
      if (typeof v === "string" || typeof v === "number") return v;
      return String(v);
    })
  );
  return { columnas: cols, filas: filas as unknown as Fila };
}

export async function GET(request: NextRequest) {
  const supabase = createSupabaseServerSafe();
  if (!supabase) return NextResponse.json({ error: "Servicio no configurado" }, { status: 503 });
  const sp = request.nextUrl.searchParams;
  const ine = sp.get("ine") ?? "";
  const formato = (sp.get("formato") ?? "xlsx").toLowerCase();
  if (!INE_RE.test(ine)) return NextResponse.json({ error: "ine de 5 dígitos requerido" }, { status: 400 });

  const cobertura = await getCoberturaMunicipio(ine);
  const snapshot = await getUltimaSnapshot();
  const snapId = snapshot?.id ?? "sin-snapshot";

  const bloques: Array<{ nombre: string; fuente: string; edicion: string; url: string; columnas: string[]; filas: Fila[] }> = [];
  for (const c of cobertura) {
    if (c.objetos_publicados <= 0) continue;
    const b = await leerBloqueR2(c.bloque, c.edicion, ine);
    if (!b) continue;
    const { columnas, filas } = filasDe(b.objetos);
    bloques.push({ nombre: `${c.bloque_nombre} [${c.fuente}]`, fuente: c.fuente_organismo, edicion: c.edicion, url: b.url, columnas, filas: filas as unknown as Fila[] });
  }

  if (formato === "json") {
    const res = NextResponse.json({ snapshot: snapId, ine, cobertura, bloques });
    res.headers.set("X-Incideas-Snapshot", snapId);
    return res;
  }

  if (formato === "csv") {
    const partes: string[] = [`# snapshot;${snapId}`, `# ine;${ine}`, ""];
    for (const b of bloques) {
      partes.push(`# bloque;${b.nombre};fuente;${b.fuente};edicion;${b.edicion}`);
      partes.push(b.columnas.join(";"));
      for (const f of b.filas as unknown as Array<Array<string | number | null>>) {
        partes.push(f.map((v) => (v === null ? "" : String(v).replace(/;/g, ","))).join(";"));
      }
      partes.push("");
    }
    const res = new NextResponse("\uFEFF" + partes.join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8" } });
    res.headers.set("Content-Disposition", `attachment; filename="incideas_bloques_${ine}.csv"`);
    res.headers.set("X-Incideas-Snapshot", snapId);
    return res;
  }

  if (formato !== "xlsx") return NextResponse.json({ error: "formato xlsx|csv|json" }, { status: 400 });
  const wb = new ExcelJS.Workbook();
  wb.creator = "INCideas Fase 3";
  const portada = wb.addWorksheet("Portada");
  portada.columns = [{ header: "Campo", key: "c", width: 24 }, { header: "Valor", key: "v", width: 90 }];
  portada.getRow(1).eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
    c.font = { color: { argb: "FFFFFFFF" }, bold: true };
  });
  portada.addRow(["Municipio (INE)", ine]);
  portada.addRow(["Snapshot", snapId]);
  portada.addRow(["Bloques con objetos", bloques.length]);
  for (const b of bloques) {
    // Las hojas Excel no admiten \ / ? * [ ].
    const hoja = b.nombre.replace(/\s*\[/g, " - ").replace(/[\]\\/?*\]]/g, "").replace(/\s+/g, " ").trim().slice(0, 31);
    const ws = wb.addWorksheet(hoja || b.nombre.slice(0, 31));
    ws.addRow(b.columnas);
    for (const f of b.filas) ws.addRow(f as unknown as Array<string | number | null>);
    ws.getRow(1).eachCell((c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E79" } };
      c.font = { color: { argb: "FFFFFFFF" }, bold: true };
    });
    ws.columns = b.columnas.map((c) => ({ header: c, key: c, width: Math.min(50, Math.max(14, c.length + 2)) }));
  }
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const res = new NextResponse(buf, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } });
  res.headers.set("Content-Disposition", `attachment; filename="incideas_bloques_${ine}.xlsx"`);
  res.headers.set("X-Incideas-Snapshot", snapId);
  return res;
}
