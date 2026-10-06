// POST /api/incideas/bloques/actualizar?ine=03031&bloque=combustible
//
// Actualización manual por municipio y bloque. Solo bloques rápidos se
// ejecutan aquí (MINETUR, padrón-R2); el resto responde 202 con el motivo y
// la vía por lotes. Un fallo registra fuente_caida sin borrar lo válido.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const INE_RE = /^\d{5}$/;
const RAPIDOS = new Set(["combustible", "poblacion"]);

export async function POST(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const ine = sp.get("ine") ?? "";
  const bloque = sp.get("bloque") ?? "";
  if (!INE_RE.test(ine) || !bloque) {
    return NextResponse.json({ error: "ine (5 dígitos) y bloque requeridos" }, { status: 400 });
  }
  if (!RAPIDOS.has(bloque)) {
    return NextResponse.json(
      {
        estado: "diferido",
        motivo: `El bloque «${bloque}» se actualiza por lotes fuera de la web (npm run fase3:muestra -- --ines ${ine} --solo ${bloque}:${ine} --go).`,
      },
      { status: 202 }
    );
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const basePublica =
    process.env.NEXT_PUBLIC_SOCIDEAS_R2_BASE || "https://pub-ecf1b1fd05e54263b2c664384c92c7b4.r2.dev";
  if (!url || !key) return NextResponse.json({ error: "Servicio no configurado" }, { status: 503 });
  const inicio = new Date().toISOString();
  try {
    // Reutiliza la misma descarga pública que el lote (sin duplicar lógica
    // pesada): lee el envoltorio ya publicado y revalida su presencia.
    const { data: filas } = await createClient(url, key)
      .from("incideas_cobertura")
      .select("fuente,edicion")
      .eq("municipio", ine)
      .eq("bloque", bloque)
      .order("fin", { ascending: false })
      .limit(1);
    const f = (filas?.[0] ?? null) as { fuente?: string; edicion?: string } | null;
    if (!f?.fuente) {
      return NextResponse.json({ estado: "sin_cobertura", motivo: "Sin carga previa para revalidar." }, { status: 200 });
    }
    const ed = String(f.edicion ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24) || "sinedicion";
    const r = await fetch(`${basePublica}/incideas/fase3/${bloque}/${ed}/${ine}.json`, {
      headers: { "User-Agent": "INCideas-Fase3/0.1" },
    });
    if (!r.ok) throw new Error(`R2 HTTP ${r.status}`);
    const env = (await r.json()) as { objetos?: unknown[]; edicion?: string };
    await createClient(url, key).from("incideas_cobertura").upsert(
      {
        municipio: ine,
        bloque,
        fuente: f.fuente,
        edicion: f.edicion,
        estado: "cargado",
        inicio,
        fin: new Date().toISOString(),
        objetos_leidos: (env.objetos ?? []).length,
        objetos_publicados: (env.objetos ?? []).length,
        errores: 0,
        reintentos: 0,
        version_conector: "fase3-web-revalidacion",
      },
      { onConflict: "municipio,bloque,fuente,edicion" }
    );
    return NextResponse.json({ estado: "cargado", objetos: (env.objetos ?? []).length, edicion: env.edicion ?? null });
  } catch (e: unknown) {
    return NextResponse.json(
      { estado: "fuente_caida", motivo: String(e instanceof Error ? e.message : e).slice(0, 200) },
      { status: 200 }
    );
  }
}
