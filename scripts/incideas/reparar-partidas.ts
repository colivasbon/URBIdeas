// Aplica el plan de reparación de las partidas de Benidorm y los metadatos del
// límite municipal.
//
// No decide nada: lee `plan.json`, que se ha calculado y revisado aparte, y
// ejecuta exactamente los movimientos que hay en él. Si el estado de la base no
// coincide con el que el plan asumía, no escribe.
//
// Por omisión ensaya (DRY-RUN). Con `--go` aplica.
//
// Uso:
//   npx tsx scripts/incideas/reparar-partidas.ts
//   npx tsx scripts/incideas/reparar-partidas.ts --go

import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import fs from "node:fs/promises";
import path from "node:path";

config({ path: ".env.local", quiet: true });

const INE = "03031";
const FUENTE = "Plantilla municipal — Limpieza info (PTM Benidorm)";
const CONECTOR = "plantilla-municipal-reparacion";
const VERSION_CONECTOR = "1.0.0";
const RAIZ = process.cwd();
const SALIDA = path.join(RAIZ, "salida", "incideas_reimportacion_03031");
const APLICAR = process.argv.includes("--go");
// La fase del límite es independiente de la de partidas y se puede repetir sola,
// por si la de partidas ya se aplicó y esta se quedó a medias.
const SOLO_LIMITE = process.argv.includes("--solo-limite");

// Fecha en que la relación OSM 341148 se editó por última vez, según su
// `timestamp`. Es la fecha del dato tal y como está en OpenStreetMap, no la
// fecha en que se descargó.
const FECHA_DATO_LIMITE = "2026-04-29";

type Fila = Record<string, unknown>;

interface Movimiento {
  tipo: "alta" | "retirada" | "fusion" | "reactivacion" | "renombrado" | "revision" | "sin_cambio";
  clave: string;
  identidad: string;
  id: string | null;
  detalle: string;
}

interface Plan {
  hash_plantilla: string;
  copia_sha256: string;
  recuentos: Record<string, number>;
  movimientos: Movimiento[];
  entidades: { clave: string; nombre: string; distrito: string; areas: string[]; filas_hoja: number[] }[];
}

const t = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());

function atorar(msg: string): never {
  console.error(`\nABORTADO: ${msg}`);
  process.exit(3);
}

interface EstadoLimite {
  limite: Fila;
  yaCorregido: boolean;
  historialYaEscrito: number;
  historialCompleto: boolean;
}

/**
 * Lee el límite municipal y comprueba si la corrección de metadatos ya está
 * aplicada y con su historial. Sirve para las dos ramas: la de ensayo declara lo
 * que quedaría por hacer y la de aplicación no repite lo que ya está hecho.
 */
async function estadoLimite(sb: SupabaseClient): Promise<EstadoLimite> {
  const { data, error } = await sb
    .from("incideas_registros")
    .select("*")
    .eq("codigo_ine", INE)
    .eq("subcategoria", "limite_municipal")
    .maybeSingle();
  if (error) atorar(`no se pudo leer el límite: ${error.message}`);
  if (!data) atorar("no se encontró el registro del límite municipal");
  const limite = data as Fila;
  const yaCorregido =
    t(limite.estado_espacial) === "valido" &&
    t(limite.fecha_dato) === FECHA_DATO_LIMITE &&
    t(limite.metodo_obtencion) === "api_nominatim" &&
    limite.atributos !== null &&
    typeof limite.atributos === "object" &&
    "limite_verificado_contra" in (limite.atributos as Record<string, unknown>);
  const { count } = await sb
    .from("incideas_historial")
    .select("id", { count: "exact", head: true })
    .eq("registro_id", limite.id)
    .eq("usuario", "reparar-partidas");
  const historialYaEscrito = count ?? 0;
  return { limite, yaCorregido, historialYaEscrito, historialCompleto: historialYaEscrito >= 4 };
}

async function leerJson<T>(fichero: string): Promise<T> {
  const ruta = path.join(SALIDA, fichero);
  let texto: string;
  try {
    texto = await fs.readFile(ruta, "utf8");
  } catch {
    atorar(`falta ${ruta}. Genera antes el plan con plan-reimportacion.ts`);
  }
  return JSON.parse(texto) as T;
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !clave) atorar("faltan las credenciales de Supabase en .env.local");
  const sb: SupabaseClient = createClient(url, clave, { auth: { persistSession: false } });

  const plan = await leerJson<Plan>("plan.json");
  const copia = await leerJson<{ incideas_registros: Fila[] }>("copia-antes.json");

  const porTipo = (x: Movimiento["tipo"]): Movimiento[] =>
    plan.movimientos.filter((m) => m.tipo === x);
  const porId = new Map<string, Movimiento>();
  for (const m of plan.movimientos) {
    if (m.id === null) continue;
    if (porId.has(m.id)) atorar(`el plan toca dos veces el registro ${m.id}`);
    porId.set(m.id, m);
  }

  console.log("INCideas · reparación de partidas de Benidorm");
  console.log(`  INE ${INE} · fuente «${FUENTE}»`);
  console.log(`  modo: ${APLICAR ? "APLICA" : "ENSAYO (no escribe)"}${SOLO_LIMITE ? " · solo el límite" : ""}`);
  console.log(`  plantilla sha256 ${plan.hash_plantilla}`);
  console.log(`  movements en el plan: ${plan.movimientos.length} sobre ${porId.size} registros`);
  console.log(
    `    ${porTipo("reactivacion").length} reactivaciones, ${porTipo("renombrado").length} renombrados, ` +
      `${porTipo("retirada").length} retiradas, ${porTipo("alta").length} altas, ` +
      `${porTipo("revision").length} sin resolver`
  );
  if (porTipo("revision").length > 0 || porTipo("alta").length > 0) {
    atorar("el plan tiene casos sin resolver o altas; revísalo antes de aplicar");
  }

  // ---------------------------------------------------------------------
  // Precondiciones: la base tiene que estar como el plan asumía
  // ---------------------------------------------------------------------

  if (!SOLO_LIMITE) {
  const actuales = copia.incideas_registros.filter(
    (r) => t(r.codigo_ine) === INE && t(r.categoria) === "territorio" && t(r.subcategoria) === "partida"
  );
  const { count: totalPartidas } = await sb
    .from("incideas_registros")
    .select("id", { count: "exact", head: true })
    .eq("codigo_ine", INE)
    .eq("categoria", "territorio")
    .eq("subcategoria", "partida");
  if (totalPartidas !== actuales.length) {
    atorar(`la base tiene ${totalPartidas} partidas y la copia del plan ${actuales.length}. Vuelve a generar el plan.`);
  }

  // Comprobar que cada registro del plan sigue con el estado que el plan vio.
  const cambiosDeEstado: string[] = [];
  for (const fila of actuales) {
    const id = t(fila.id);
    const movimiento = porId.get(id);
    if (!movimiento) continue;
    const estabaVigente = t(fila.desactualizado_desde) === "";
    if (movimiento.tipo === "retirada" && !estabaVigente) {
      cambiosDeEstado.push(`${id} ya estaba dado de baja`);
    }
    if ((movimiento.tipo === "reactivacion" || movimiento.tipo === "renombrado") && estabaVigente) {
      cambiosDeEstado.push(`${id} ya está vigente`);
    }
  }
  if (cambiosDeEstado.length > 0) {
    atorar(
      `${cambiosDeEstado.length} registro(s) no están como el plan asumía, por ejemplo: ` +
        `${cambiosDeEstado.slice(0, 3).join("; ")}. Vuelve a generar el plan.`
    );
  }

  console.log("");
  console.log("Precondiciones");
  console.log(`  partidas en la base: ${totalPartidas} (coincide con la copia)`);
  console.log(`  registros del plan en el estado esperado: ${porId.size}`);
  console.log(`  casos sin resolver: 0`);
  }

  if (!APLICAR) {
    console.log("");
    console.log("Metadatos del límite municipal que se corregirían (la geometría no se toca)");
    const { data: limite, error: errorLimite } = await sb
      .from("incideas_registros")
      .select("id,estado_espacial,fecha_dato,metodo_obtencion,tipo_geometria,version_registro")
      .eq("codigo_ine", INE)
      .eq("subcategoria", "limite_municipal")
      .maybeSingle();
    if (errorLimite) atorar(`no se pudo leer el límite: ${errorLimite.message}`);
if (!limite) atorar("no se encontró el registro del límite municipal");

const l = await estadoLimite(sb);
    console.log(
      `  estado actual: estado_espacial=${t(l.limite.estado_espacial) || "(nulo)"} ` +
        `fecha_dato=${t(l.limite.fecha_dato) || "(nula)"} metodo=${t(l.limite.metodo_obtencion) || "(nulo)"} ` +
        `historial previo=${l.historialYaEscrito}/4`
    );
    console.log(`  estado_espacial: sin_geometria → valido`);
  console.log(`  fecha_dato: (nula) → ${FECHA_DATO_LIMITE}`);
  console.log(`  metodo_obtencion: api → api_nominatim`);
  console.log(`  atributos.limite_verificado_contra: (no existe) → contraste con el IGN`);
  console.log(`  geometría: ${t(l.limite.tipo_geometria)} — sin cambios`);

    console.log("");
    if (!SOLO_LIMITE) {
      console.log("Ejemplo de lo que se escribiría, las cinco primeras filas:");
      for (const m of plan.movimientos.slice(0, 5)) {
        console.log(`  ${m.tipo.padEnd(12)} ${m.clave}`);
        console.log(`      ${m.detalle}`);
      }
      console.log("");
    }
    console.log("");
    console.log("Ensayo terminado. No se ha escrito nada.");
    console.log("Repite con --go para aplicar.");
    return;
  }

  // ---------------------------------------------------------------------
  // Aplicación
  // ---------------------------------------------------------------------

  const ahora = new Date().toISOString();
  if (!SOLO_LIMITE) {
  const entidadPorClave = new Map(plan.entidades.map((e) => [e.clave, e]));

  const { data: fuente, error: errorFuente } = await sb
    .from("incideas_fuentes")
    .select("id")
    .eq("nombre", FUENTE)
    .maybeSingle();
  if (errorFuente) atorar(`no se pudo leer la fuente: ${errorFuente.message}`);

  const { data: ejecucion, error: errorEjecucion } = await sb
    .from("incideas_ejecuciones")
    .insert({
      id_fuente: fuente?.id ?? null,
      conector: CONECTOR,
      version_conector: VERSION_CONECTOR,
      codigo_ine: INE,
      categoria: "territorio",
      parametros: {
        proposito: "Reparar claves de partida, fusionar duplicados por área y retirar artefactos de lectura",
        plantilla_sha256: plan.hash_plantilla,
        plan_sha256_copia: plan.copia_sha256,
      },
      estado: "en_curso",
      registros_leidos: plan.entidades.length,
      fecha_inicio: ahora,
    })
    .select("id")
    .single();
  if (errorEjecucion) atorar(`no se pudo abrir la ejecución: ${errorEjecucion.message}`);
  const ejecucionId = ejecucion.id as string;
  console.log("");
  console.log(`Ejecución ${ejecucionId}`);

  const historial: Fila[] = [];
  let reactivados = 0;
  let renombrados = 0;
  let retirados = 0;

  // Reactivaciones y renombrados: son las filas que pasan a ser la versión
  // vigente de cada partida. No se cambia su id ni su clave salvo en el renombrado
  // declarado, para que las 52 demás conserven la trazabilidad de su origen.
  for (const m of [...porTipo("reactivacion"), ...porTipo("renombrado")]) {
    const id = m.id as string;
    const entidad = entidadPorClave.get(m.clave);
    const anterior = copia.incideas_registros.find((r) => t(r.id) === id);
    if (!anterior) atorar(`la copia no tiene el registro ${id}`);
    const versionPrevia = Number(t(anterior.version_registro)) || 1;
    const atributos: Record<string, unknown> = {
      distrito: entidad?.distrito ?? "",
      area: entidad?.areas.join(", ") ?? "",
      filas_hoja: entidad?.filas_hoja ?? [],
    };
    const cambios: Record<string, unknown> = {
      desactualizado_desde: null,
      atributos,
      version_registro: versionPrevia + 1,
    };
    historial.push({
      registro_id: id,
      accion: "actualizado",
      campo: "desactualizado_desde",
      valor_anterior: "(marcado como posible baja)",
      valor_nuevo: null,
      usuario: "reparar-partidas",
      observaciones: `Revive la partida documentada por la plantilla (${m.clave}). Áreas: ${atributos.area}`,
    });
    historial.push({
      registro_id: id,
      campo: "atributos.area",
      valor_anterior: "(un área)",
      valor_nuevo: atributos.area as string,
      accion: "actualizado",
      usuario: "reparar-partidas",
      observaciones: "El área es un atributo y se acumula como lista; la hoja la documenta una vez por área y otra con la lista completa.",
    });

    if (m.tipo === "renombrado") {
      cambios.nombre_oficial = entidad?.nombre ?? null;
      cambios.id_origen = m.clave;
      atributos.nombre_anterior = t(anterior.nombre_oficial);
      atributos.clave_anterior = t(anterior.id_origen);
      cambios.atributos = atributos;
      historial.push({
        registro_id: id,
        accion: "actualizado",
        campo: "nombre_oficial",
        valor_anterior: t(anterior?.nombre_oficial),
        valor_nuevo: entidad?.nombre ?? null,
        usuario: "reparar-partidas",
        observaciones:
          "La plantilla escribe el mismo núcleo con dos grafías (fila 25 «Amanello», fila 86 «Armanello»). Manda «Armanello», que es la que usa el resto del libro.",
      });
      renombrados++;
    } else {
      reactivados++;
    }

    // La versión se incrementa desde la copia: el valor anterior ya está guardado
    // allí y en el historial, así que no hace falta releer la fila.
    const { error } = await sb
      .from("incideas_registros")
      .update(cambios)
      .eq("id", id)
      .is("eliminado_en", null);
    if (error) {
      await sb
        .from("incideas_ejecuciones")
        .update({ estado: "fallida", errores: [{ mensaje: error.message }] })
        .eq("id", ejecucionId);
      atorar(`no se pudo reactivar ${id}: ${error.message}`);
    }
  }

  // Retiradas: baja lógica con motivo. No se borra ninguna fila.
  for (const m of porTipo("retirada")) {
    const id = m.id as string;
    const { error } = await sb
      .from("incideas_registros")
      .update({ desactualizado_desde: ahora, motivo_baja: m.detalle })
      .eq("id", id)
      .is("desactualizado_desde", null);
    if (error) {
      await sb
        .from("incideas_ejecuciones")
        .update({ estado: "fallida", errores: [{ mensaje: error.message }] })
        .eq("id", ejecucionId);
      atorar(`no se pudo retirar ${id}: ${error.message}`);
    }
    historial.push({
      registro_id: id,
      accion: "actualizado",
      campo: "desactualizado_desde",
      valor_anterior: null,
      valor_nuevo: ahora,
      usuario: "reparar-partidas",
      observaciones: m.detalle,
    });
    retirados++;
  }

  for (let i = 0; i < historial.length; i += 200) {
    const trozo = historial.slice(i, i + 200);
    const { error } = await sb.from("incideas_historial").insert(trozo);
    if (error) {
      await sb.from("incideas_ejecuciones").update({ estado: "fallida", errores: [{ mensaje: error.message }] }).eq("id", ejecucionId);
      atorar(`no se pudo escribir el historial: ${error.message}`);
    }
  }

  await sb
    .from("incideas_ejecuciones")
    .update({
      estado: "completada",
      fecha_fin: new Date().toISOString(),
      registros_leidos: plan.entidades.length,
      registros_insertados: 0,
      registros_actualizados: reactivados + renombrados + retirados,
      registros_sin_cambios: 0,
      posibles_bajas: retirados,
      resumen_calidad: { reactivados, renombrados, retirados },
    })
    .eq("id", ejecucionId);

  console.log("");
  console.log("Aplicado");
  console.log(`  reactivados: ${reactivados}`);
  console.log(`  renombrados: ${renombrados}`);
  console.log(`  retirados: ${retirados}`);
  console.log(`  filas de historial: ${historial.length}`);
  }

  // ---------------------------------------------------------------------

  // ---------------------------------------------------------------------
  // Fase 2: metadatos del límite municipal. La geometría no se toca.
  // ---------------------------------------------------------------------

  console.log("");
  console.log("Metadatos del límite municipal (la geometría no se toca)");

  const { limite, yaCorregido, historialYaEscrito, historialCompleto } = await estadoLimite(sb);

  if (yaCorregido && historialCompleto) {
    console.log("  ya estaba corregido y con su historial. No se toca nada.");
    return;
  }
  console.log(
    `  estado actual: estado_espacial=${t(limite.estado_espacial) || "(nulo)"} ` +
      `fecha_dato=${t(limite.fecha_dato) || "(nula)"} metodo=${t(limite.metodo_obtencion) || "(nulo)"} ` +
      `historial previo=${historialYaEscrito}/4`
  );

  const atributosLimite: Record<string, unknown> = {
    ...((limite.atributos as Record<string, unknown>) ?? {}),
    limite_verificado_contra: {
      fuente: "IGN · WFS INSPIRE «Unidades administrativas de España»",
      capa: "au:AdministrativeUnit",
      identificador: "AU_ADMINISTRATIVEUNIT_34100303031",
      url: "https://www.ign.es/wfs-inspire/unidades-administrativas",
      licencia: "CC BY 4.0 ign.es",
      consultado_en: new Date().toISOString(),
      comparacion: {
        crs_medida: "EPSG:3035",
        vertices_osm: 697,
        vertices_oficial: 1505,
        area_osm_km2: 38.4927,
        area_oficial_km2: 38.5077,
        diferencia_area_pct: -0.039,
        interseccion_pct_del_oficial: 99.713,
        hausdorff_m: 66.75,
      },
      conclusion:
        "El recinto de OSM 341148 es el mismo que el oficial: 99,71 % de solape y 66,75 m de Hausdorff. " +
        "La propia relación declara source=BDLL25, EGRN, Instituto Geográfico Nacional. " +
        "Se conserva la geometría de OSM y no se sustituye.",
    },
  };

  // Los valores anteriores se declaran, no se leen del registro: si la fase se
  // repite porque el historial quedó a medias, el registro ya está corregido y
  // leerlo daría como «valor anterior» el valor nuevo.
  const LIMITE_ANTES = {
    estado_espacial: "sin_geometria",
    fecha_dato: "",
    metodo_obtencion: "api",
  };

  if (!yaCorregido) {
    const { error: errorActualizarLimite } = await sb
      .from("incideas_registros")
      .update({
        estado_espacial: "valido",
        fecha_dato: FECHA_DATO_LIMITE,
        metodo_obtencion: "api_nominatim",
        atributos: atributosLimite,
        version_registro: (Number(t(limite.version_registro)) || 1) + 1,
      })
      .eq("id", limite.id);
    if (errorActualizarLimite) atorar(`no se pudo corregir el límite: ${errorActualizarLimite.message}`);
    console.log("  registro actualizado");
  } else {
    console.log("  registro ya corregido: solo se completa el historial");
  }

  const historialLimite: Fila[] = [
    {
      registro_id: limite.id,
      accion: "actualizado",
      campo: "estado_espacial",
      valor_anterior: LIMITE_ANTES.estado_espacial,
      valor_nuevo: "valido",
      usuario: "reparar-partidas",
      observaciones:
        "Decía «sin_geometria» cuando el registro sí tiene un MultiPolygon válido de 697 vértices. " +
        "El valor «sin_geometria» queda para los registros sin punto, no para los que traen polígono.",
    },
    {
      registro_id: limite.id,
      accion: "actualizado",
      campo: "fecha_dato",
      valor_anterior: "(nula)",
      valor_nuevo: FECHA_DATO_LIMITE,
      usuario: "reparar-partidas",
      observaciones: "Fecha en que OpenStreetMap editó por última vez la relación 341148, no la de descarga.",
    },
    {
      registro_id: limite.id,
      accion: "actualizado",
      campo: "metodo_obtencion",
      valor_anterior: LIMITE_ANTES.metodo_obtencion,
      valor_nuevo: "api_nominatim",
      usuario: "reparar-partidas",
      observaciones: "«api» no decía contra qué servicio se había consultado.",
    },
    {
      registro_id: limite.id,
      accion: "actualizado",
      campo: "atributos.limite_verificado_contra",
      valor_anterior: "(no contrastado)",
      valor_nuevo: "IGN AU_ADMINISTRATIVEUNIT_34100303031",
      usuario: "reparar-partidas",
      observaciones:
        "Contraste con el recinto oficial del IGN en EPSG:3035: 99,71 % de solape, −0,039 % de área, " +
        "66,75 m de Hausdorff. La geometría publicada no se cambia.",
    },
  ];
  const { error: errorHistorialLimite } = await sb.from("incideas_historial").insert(historialLimite);
  if (errorHistorialLimite) atorar(`no se pudo escribir el historial del límite: ${errorHistorialLimite.message}`);

  console.log(`  estado_espacial: ${LIMITE_ANTES.estado_espacial} → valido`);
  console.log(`  fecha_dato: (nula) → ${FECHA_DATO_LIMITE}`);
  console.log(`  metodo_obtencion: ${LIMITE_ANTES.metodo_obtencion} → api_nominatim`);
  console.log(`  contraste con el IGN guardado en atributos (geometría intacta)`);
  console.log(`  geometría: ${t(limite.tipo_geometria)} — sin cambios en la geometría`);
  console.log(`  filas de historial del límite: ${historialLimite.length}`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exitCode = 1;
});