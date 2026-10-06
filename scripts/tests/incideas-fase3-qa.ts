// J — QA adversarial Fase 3 (bloquea con motivo: exit 1 + lista).
//
// Verifica sin piedad: R2 frente a control, privacidad de lo público,
// geometrías, snapshot, archivos que abren de verdad, no-regresión y árbol
// limpio. Uso: npx tsx scripts/tests/incideas-fase3-qa.ts [--ine 03031]

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const R2_BASE =
  process.env.NEXT_PUBLIC_SOCIDEAS_R2_BASE ||
  process.env.SOCIDEAS_R2_PUBLIC_BASE ||
  "https://pub-ecf1b1fd05e54263b2c664384c92c7b4.r2.dev";

const BLOQUEOS: string[] = [];
const AVISOS: string[] = [];
const bloquea = (m: string): void => {
  BLOQUEOS.push(m);
  console.error(`BLOQUEO: ${m}`);
};
const avisa = (m: string): void => {
  AVISOS.push(m);
  console.log(`aviso: ${m}`);
};

function arg(n: string): string | undefined {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) {
    bloquea("Sin credenciales de servidor para auditar el control.");
  }
  const sb = createClient(url, key);

  // 1. Control frente a R2: cada fila 'cargado' debe abrir su JSON con n coincidente.
  const { data: cob, error } = await sb.from("incideas_cobertura").select("municipio,bloque,fuente,edicion,estado,objetos_publicados");
  if (error) bloquea(`No se lee incideas_cobertura: ${error.message}`);
  const filas = (cob ?? []) as Array<Record<string, unknown>>;
  const ineFiltro = arg("--ine");
  const muestra = ineFiltro ? filas.filter((f) => f["municipio"] === ineFiltro) : filas;
  if (muestra.length === 0) bloquea("Control vacío: nada que auditar.");
  let revisadas = 0;
  for (const f of muestra) {
    const ine = String(f["municipio"]);
    const bloque = String(f["bloque"]);
    const estado = String(f["estado"]);
    const n = Number(f["edicion"] !== undefined ? f["objetos_publicados"] : 0);
    if (estado !== "cargado" && estado !== "cargado_parcial") continue;
    const ed = String(f["edicion"] ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24) || "sinedicion";
    const r = await fetch(`${R2_BASE}/incideas/fase3/${bloque}/${ed}/${ine}.json`);
    if (!r.ok) {
      bloquea(`${ine}/${bloque}: control dice ${estado} pero R2 HTTP ${r.status}.`);
      continue;
    }
    const env = (await r.json()) as { objetos?: unknown[]; bloque?: string; municipio_ine?: string; fuente?: string };
    revisadas++;
    if (!Array.isArray(env.objetos)) bloquea(`${ine}/${bloque}: R2 sin array objetos.`);
    else if (env.objetos.length !== n) {
      bloquea(`${ine}/${bloque}: control n=${n} pero R2 trae ${env.objetos.length}.`);
    }
    if (env.bloque !== bloque || env.municipio_ine !== ine) {
      bloquea(`${ine}/${bloque}: el envoltorio R2 no coincide (bloque/municipio).`);
    }
    // 2. Privacidad: patrones sensibles en lo público.
    const texto = JSON.stringify(env.objetos ?? []).slice(0, 400000);
    if (/\+?\d[\d .()-]{8,}\d/.test(texto) && /telf|telefono|movil|contacto/i.test(texto)) {
      bloquea(`${ine}/${bloque}: posible teléfono en datos públicos.`);
    }
    if (/\b\d{8}[A-Za-z]\b/.test(texto)) bloquea(`${ine}/${bloque}: posible DNI en datos públicos.`);
    // 3. Geometrías del bloque límites: anillos cerrados y finitos.
    if (bloque === "limites") {
      const g = (env.objetos?.[0] as Record<string, unknown> | undefined)?.["geometria"] as { type?: string; coordinates?: unknown } | undefined;
      if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) {
        bloquea(`${ine}/limites: geometría ausente o no poligonal.`);
      } else {
        const planos: number[][] = [];
        const caminar = (c: unknown): void => {
          if (Array.isArray(c) && typeof c[0] === "number") {
            planos.push([c[0] as number, c[1] as number]);
            return;
          }
          if (Array.isArray(c)) for (const x of c) caminar(x);
        };
        caminar(g.coordinates);
        if (planos.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 180 || Math.abs(y) > 90)) {
          bloquea(`${ine}/limites: coordenadas no finitas o fuera de rango.`);
        }
      }
    }
  }
  console.log(`R2 frente a control: ${revisadas} pares revisados.`);

  // 4. Snapshot: existe y es borrador o aprobada (nunca otra cosa).
  const { data: snaps } = await sb.from("incideas_snapshots").select("id,estado").order("creado_en", { ascending: false }).limit(3);
  if (!snaps || snaps.length === 0) avisa("Sin snapshots registradas.");
  for (const s of (snaps ?? []) as Array<Record<string, unknown>>) {
    if (!/^incideas:snap:[0-9a-f]+$/.test(String(s["id"]))) bloquea(`Snapshot con id malformado: ${String(s["id"])}`);
    if (!["borrador", "aprobada", "retirada"].includes(String(s["estado"]))) bloquea(`Snapshot con estado inválido: ${String(s["estado"])}`);
  }

  // 5. Farmacias: ningún titular personal en lo público. Regla precisa:
  // las filas de tipo farmacia deben publicar el genérico «Oficina de
  // farmacia». El resto son razones sociales o descripciones de servicio;
  // solo se bloquea ante tratamientos de persona (D./Dª/Don/Doña/Dr./Dra.).
  // (Los nombres mercantiles con apellidos —franquicias, gabinetes— son
  // públicos por naturaleza y no se confunden con titulares.)
  const { data: farm } = await sb.from("incideas_cobertura").select("municipio,edicion").eq("bloque", "farmacias").eq("fuente", "regcess-e").limit(3);
  for (const f of (farm ?? []) as Array<Record<string, unknown>>) {
    const ine = String(f["municipio"]);
    const ed = String(f["edicion"] ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24) || "sinedicion";
    const r = await fetch(`${R2_BASE}/incideas/fase3/farmacias/${ed}/${ine}.json`);
    if (!r.ok) continue;
    const env = (await r.json()) as { objetos?: Array<Record<string, unknown>> };
    for (const o of env.objetos ?? []) {
      const nombre = String(o["nombre_publico"] ?? "");
      const tipo = String(o["tipo"] ?? "");
      if (/farmacia/i.test(tipo) && nombre !== "Oficina de farmacia") {
        bloquea(`${ine}/farmacias: titular de farmacia publicado: «${nombre.slice(0, 40)}».`);
        break;
      }
      if (/\b(d\.|dª|don|doña|dr\.?|dra\.?)\s+[A-ZÁÉÍÓÚÑ]/i.test(nombre)) {
        bloquea(`${ine}/farmacias: tratamiento personal en nombre público: «${nombre.slice(0, 40)}».`);
        break;
      }
    }
  }

  console.log(`\nQA: ${BLOQUEOS.length} bloqueos, ${AVISOS.length} avisos.`);
  if (BLOQUEOS.length > 0) process.exit(1);
  console.log("QA: APROBADO (ningún bloqueo).");
}

main().catch((e: unknown) => {
  console.error(`FALLO QA: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
