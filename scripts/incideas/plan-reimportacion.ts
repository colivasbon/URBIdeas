// Copia de seguridad y plan de la reimportación de la plantilla municipal de
// Benidorm (INE 03031), calculado contra lo que hay realmente en la base.
//
// No escribe en Supabase. Solo lee y escribe ficheros locales en `salida/`.
//
// Uso: npx tsx scripts/incideas/plan-reimportacion.ts
//
// Variables: las mismas que el resto de scripts de INCideas (.env.local).

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";

import {
  identidadPartida,
  leerPartidas,
  ORTOGRAFIA_PARTIDAS,
} from "../../src/lib/incideas/plantilla-partidas";

config({ path: ".env.local", quiet: true });

const INE = "03031";
const RAIZ = process.cwd();
const PLANTILLA = path.join(RAIZ, "INCIDEAS DOCUMENTOS", "Limpieza info.xlsx");
const SALIDA = path.join(RAIZ, "salida", "incideas_reimportacion_03031");

type Fila = Record<string, unknown>;

const t = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !clave) {
    console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
    process.exit(2);
  }
  const sb = createClient(url, clave, { auth: { persistSession: false } });

  // ---------------------------------------------------------------------
  // 1. Copia de seguridad de todo lo que se puede ver afectado
  // ---------------------------------------------------------------------

  const copia: Record<string, unknown> = {
    generado_en: new Date().toISOString(),
    proposito:
      "Copia restaurable previa a la reimportación de la plantilla municipal de Benidorm.",
    proyecto_supabase: new URL(url).host,
    codigo_ine: INE,
    restauracion:
      "Cada bloque lleva la tabla de origen y el identificador. Para restaurar, " +
      "insertar o actualizar por id con los mismos valores.",
  };

  const tablas = [
    { nombre: "incideas_registros", filtro: { codigo_ine: INE } },
    { nombre: "incideas_historial", filtro: {} },
    { nombre: "incideas_revisiones", filtro: {} },
    { nombre: "incideas_ejecuciones", filtro: { codigo_ine: INE } },
    { nombre: "municipios", filtro: { codigo_ine: INE } },
  ];

  // Supabase corta cada respuesta en 1.000 filas por defecto. Una copia truncada
  // no es restaurable, así que se lee por páginas y se comprueba contra el
  // recuento real que informa la propia respuesta.
  const PAGINA = 1000;
  for (const { nombre, filtro } of tablas) {
    const filas: Fila[] = [];
    for (let desde = 0; ; desde += PAGINA) {
      let q = sb.from(nombre).select("*", { count: "exact" }).range(desde, desde + PAGINA - 1);
      for (const [k, v] of Object.entries(filtro)) q = q.eq(k, v);
      const { data, error, count } = await q;
      if (error) throw new Error(`Copia de ${nombre}: ${error.message}`);
      filas.push(...((data ?? []) as Fila[]));
      if (filas.length >= (count ?? 0) || (data?.length ?? 0) === 0) {
        if (count !== null && filas.length !== count) {
          throw new Error(
            `Copia de ${nombre} incompleta: ${filas.length} de ${count} filas. No continuar.`
          );
        }
        break;
      }
    }
    copia[nombre] = filas;
    console.log(`copia ${nombre}: ${filas.length} filas`);
  }

  await fs.mkdir(SALIDA, { recursive: true });
  const rutaCopia = path.join(SALIDA, "copia-antes.json");
  const texto = JSON.stringify(copia, null, 1);
  await fs.writeFile(rutaCopia, texto, "utf8");
  const hashCopia = createHash("sha256").update(texto).digest("hex");

  // Comprobación de restaurabilidad: lo que se ha copiado tiene que ser able de
  // volverse a insertar. Se comprueba que cada fila de registros trae su id y que
  // las claves que se van a tocar están todas dentro de la copia.
  const registros = copia.incideas_registros as Fila[];
  const sinId = registros.filter((r) => !t(r.id)).length;
  const ids = new Set(registros.map((r) => t(r.id)));
  console.log("");
  console.log("Comprobación de la copia");
  console.log(`  filas de registros sin identificador: ${sinId}`);
  console.log(`  identificadores únicos: ${ids.size} de ${registros.length}`);
  console.log(`  sha256 de la copia: ${hashCopia}`);
  console.log(`  fichero: ${path.relative(RAIZ, rutaCopia)}`);

  // ---------------------------------------------------------------------
  // 2. Lectura de la plantilla con el lector corregido
  // ---------------------------------------------------------------------

  const hashPlantilla = createHash("sha256")
    .update(await fs.readFile(PLANTILLA))
    .digest("hex")
    .toUpperCase();
  const libro = XLSX.readFile(PLANTILLA);
  const hojas = libro.SheetNames;
  const matriz = XLSX.utils.sheet_to_json<(string | number | null)[]>(
    libro.Sheets["Núcleos_partidas"],
    { header: 1, blankrows: true, defval: null }
  ) as (string | number | null)[][];
  const lectura = leerPartidas(matriz);

  console.log("");
  console.log("Plantilla");
  console.log(`  fichero: ${path.basename(PLANTILLA)}`);
  console.log(`  sha256: ${hashPlantilla}`);
  console.log(`  hojas: ${hojas.join(", ")}`);
  console.log(`  bloques detectados en Núcleos_partidas: ${lectura.bloques.length}`);
  for (const b of lectura.bloques) {
    console.log(
      `    encabezado en la fila ${b.fila_encabezado}, desplazamiento ${b.desplazamiento}, ${b.filas} filas`
    );
  }
  console.log(`  filas leídas: ${lectura.filas.length}`);
  console.log(`  filas descartadas: ${lectura.descartadas.length}`);
  for (const d of lectura.descartadas) {
    console.log(`    fila ${d.fila} (${d.motivo}): ${JSON.stringify(d.crudo)}`);
  }

  // Entidades que producirá la importación, agrupadas por (distrito, nombre) con
  // las áreas acumuladas. Es la misma agrupación que hace `construirPartidas`.
  const entidadesPlantilla = new Map<string, { nombre: string; distrito: string; areas: string[]; filas: number[] }>();
  for (const f of lectura.filas) {
    // `leerPartidas` ya aplicó las erratas declaradas en ORTOGRAFIA_PARTIDAS.
    const k = `partida|${f.distrito}|${f.partida}`;
    if (!entidadesPlantilla.has(k)) {
      entidadesPlantilla.set(k, { nombre: f.partida, distrito: f.distrito, areas: [], filas: [] });
    }
    const acc = entidadesPlantilla.get(k)!;
    for (const a of f.area.split(",").map((s) => s.trim()).filter(Boolean)) {
      if (!acc.areas.includes(a)) acc.areas.push(a);
    }
    acc.filas.push(f.fila);
  }
  for (const acc of entidadesPlantilla.values()) {
    acc.areas.sort((a, b) => (Number(a) || 0) - (Number(b) || 0) || a.localeCompare(b, "es"));
  }

  // ---------------------------------------------------------------------
  // 3. Estado actual en la base
  // ---------------------------------------------------------------------

  const actuales = registros.filter(
    (r) => t(r.categoria) === "territorio" && t(r.subcategoria) === "partida"
  );

  // Índice por identidad (distrito, nombre). El área no forma parte de la
  // identidad: la hoja documenta cada partida dos veces y meter el área en la
  // clave multiplicaba las entidades.
  const porIdentidad = new Map<string, Fila[]>();
  const identidades = (r: Fila): { identidad: string; artefacto: boolean } =>
    identidadPartida(t(r.id_origen));
  for (const r of actuales) {
    const { identidad } = identidades(r);
    porIdentidad.set(identidad, [...(porIdentidad.get(identidad) ?? []), r]);
  }
  const bajasHistoricas = actuales.filter((r) => t(r.desactualizado_desde) !== "");
  const activos = actuales.filter((r) => t(r.desactualizado_desde) === "");

  // ---------------------------------------------------------------------
  // 4. Plan
  // ---------------------------------------------------------------------

  interface Movimiento {
    tipo: "alta" | "retirada" | "fusion" | "reactivacion" | "renombrado" | "revision" | "sin_cambio";
    clave: string;
    identidad: string;
    id: string | null;
    detalle: string;
  }
  const movimientos: Movimiento[] = [];
  const vistas = new Set<string>();

  for (const [clave, acc] of entidadesPlantilla) {
    const { identidad } = identidadPartida(clave);
    const porIdent = porIdentidad.get(identidad) ?? [];
    const vivos = porIdent.filter((r) => t(r.desactualizado_desde) === "");
    const yaCaducados = porIdent.filter((r) => t(r.desactualizado_desde) !== "");

    // Si ya existe una baja con la clave canónica correcta, esa fila es la que
    // se revive. Adoptarla en la fila activa en vez de reescribir 53 claves
    // históricas, y evita además que dos filas compartan id_origen: la búsqueda
    // del pipeline usa maybeSingle() y fallaría con duplicados.
    const revived = yaCaducados.find((r) => t(r.id_origen) === clave);

    if (revived) {
      movimientos.push({
        tipo: "reactivacion",
        clave,
        identidad,
        id: t(revived.id),
        detalle:
          `Se revive la fila que ya tenía la clave correcta (v${t(revived.version_registro)})` +
          (vivos.length > 0 ? ` y se retira la fila activa con el área en la clave (${t(vivos[0].id)})` : "") +
          `. Áreas: ${acc.areas.join(", ")}`,
      });
      vistas.add(identidad);
      for (const v of vivos) {
        movimientos.push({
          tipo: "retirada",
          clave: t(v.id_origen),
          identidad,
          id: t(v.id),
          detalle: `Fila con el área dentro de la clave; la entidad vive en ${t(revived.id)} (${clave})`,
        });
      }
      continue;
    }

    if (vivos.length > 0) {
      // Todos los registros vigentes de la misma entidad se fusionan en el
      // primero: el área pasa a ser la lista acumulada.
      const superviviente = vivos[0];
      const duplicados = vivos.slice(1);
      movimientos.push({
        tipo: duplicados.length > 0 ? "fusion" : "sin_cambio",
        clave,
        identidad,
        id: t(superviviente.id),
        detalle:
          duplicados.length > 0
            ? `${duplicados.length} registro(s) duplicado(s) por área se fusionan en este; ` +
              `áreas: ${acc.areas.join(", ")}`
            : `sin cambios; áreas: ${acc.areas.join(", ")}`,
      });
      vistas.add(identidad);
      for (const d of duplicados) {
        movimientos.push({
          tipo: "retirada",
          clave: t(d.id_origen),
          identidad,
          id: t(d.id),
          detalle: `Duplicado por área de «${acc.nombre}» (${t(d.nombre_oficial)}); se fusiona en ${t(superviviente.id)}`,
        });
      }
      continue;
    }

    // Sin fila con la clave exacta: puede ser una falta de ortografía
    // («Amanello» / «Armanello») o una entidad nueva. No se decide a ciegas.
    const zona = `${acc.distrito}|${acc.areas.join(", ")}`;
    const mismaZona = activos.filter((r) => {
      if (t(r.subcategoria) !== "partida") return false;
      const { artefacto } = identidades(r);
      if (artefacto) return false;
      const partes = t(r.id_origen).split("|");
      const distrito = (partes[1] ?? "").trim();
      const attrs = r.atributos as Record<string, unknown> | null;
      return distrito === acc.distrito && t(attrs?.area) === acc.areas.join(", ");
    });
    const yaCaducadaEnZona = bajasHistoricas.filter((r) => {
      const partes = t(r.id_origen).split("|");
      const attrs = r.atributos as Record<string, unknown> | null;
      return (
        (partes[1] ?? "").trim() === acc.distrito &&
        t(attrs?.area) === acc.areas.join(", ") &&
        !identidades(r).artefacto
      );
    });
    const candidatos = [...mismaZona, ...yaCaducadaEnZona].filter((r) => {
      // Solo el nombre casi idéntico sirve de candidato: ocho núcleos pueden
      // compartir distrito y área sin ser el mismo lugar.
      const partes = t(r.id_origen).split("|");
      const nombre = (partes[2] ?? "").trim();
      return distanciaCorta(nombre.toLowerCase(), acc.nombre.toLowerCase()) <= 2;
    });
    // Varias filas con el mismo nombre son la misma entidad repetida, no varias
    // candidatas: se agrupan por identidad y se prefiere la que ya lleva la clave
    // canónica, que es la que el pipeline puede volver a encontrar.
    const porIdentidadCandidata = new Map<string, Fila[]>();
    for (const r of candidatos) {
      const idn = identidades(r).identidad;
      porIdentidadCandidata.set(idn, [...(porIdentidadCandidata.get(idn) ?? []), r]);
    }
    const candidatosDistintos = [...porIdentidadCandidata.values()];
    if (candidatosDistintos.length === 1) {
      const filas = candidatosDistintos[0];
      const conClaveCanonica = filas.find((r) => t(r.id_origen).split("|").length === 3) ?? filas[0];
      const nombreViejo = t(conClaveCanonica.nombre_oficial);
      movimientos.push({
        tipo: "renombrado",
        clave,
        identidad,
        id: t(conClaveCanonica.id),
        detalle:
          `Falta de ortografía en la fila ${acc.filas[0]} de la plantilla: «${nombreViejo}» → ` +
          `«${acc.nombre}». Se corrige el nombre y se guarda el anterior. Zona ${zona}`,
      });
      vistas.add(identidad);
      for (const r of filas) {
        if (r.id === conClaveCanonica.id) continue;
        movimientos.push({
          tipo: "retirada",
          clave: t(r.id_origen),
          identidad,
          id: t(r.id),
          detalle: `Fila con el área dentro de la clave; la entidad vive en ${t(conClaveCanonica.id)} (${clave})`,
        });
        // La fila retirada lleva la grafía antigua en su clave, así que su
        // identidad también queda vista: si no, el barrido final la daría de
        // baja por segunda vez como si la plantilla ya no la documentara.
        vistas.add(identidades(r).identidad);
      }
      continue;
    }
    if (candidatosPlanos.length > 1) {
      movimientos.push({
        tipo: "revision",
        clave,
        identidad,
        id: null,
        detalle:
          `CONFLICTO: ${candidatosPlanos.length} candidatos con nombre casi idéntico en la zona ${zona}: ` +
          `${candidatosPlanos.map((r) => t(r.nombre_oficial)).join(", ")}. Requiere decisión manual`,
      });
    } else {
      movimientos.push({
        tipo: "alta",
        clave,
        identidad,
        id: null,
        detalle: `Entidad nueva. Distrito ${acc.distrito}. Áreas: ${acc.areas.join(", ")}`,
      });
      vistas.add(identidad);
    }
  }

  // Registros vigentes que la plantilla no documenta. Aquí se separan los
  // artefactos de la lectura antigua, que no son lugares, de los que serían
  // bajas legítimas.
  const artefactos: Movimiento[] = [];
  const bajasLegitimas: Movimiento[] = [];
  for (const r of activos) {
    const { identidad, artefacto } = identidades(r);
    if (vistas.has(identidad)) continue;
    const m: Movimiento = {
      tipo: "retirada",
      clave: t(r.id_origen),
      identidad,
      id: t(r.id),
      detalle: artefacto
        ? `Artefacto de la lectura antigua: el nombre «${t(r.nombre_oficial)}» es el número ` +
          `de distrito, no un topónimo. No es un lugar.`
        : `Nombre vigente «${t(r.nombre_oficial)}»: la plantilla corregida ya no lo documenta`,
    };
    (artefacto ? artefactos : bajasLegitimas).push(m);
    movimientos.push(m);
  }

  const porTipo = (x: Movimiento["tipo"]) => movimientos.filter((m) => m.tipo === x);

  console.log("");
  console.log("Plan");
  console.log("");
  console.log(`  Registros de partida en la base: ${actuales.length}`);
  console.log(`    vigentes: ${activos.length}`);
  console.log(`    ya marcados como posible baja: ${bajasHistoricas.length}`);
  console.log(`  Entidades distintas que documenta la plantilla: ${entidadesPlantilla.size}`);
  console.log("");
  console.log(`  Altas propuestas: ${porTipo("alta").length}`);
  console.log(`  Casos que requieren revisión humana: ${porTipo("revision").length}`);
  console.log(`  Renombrados (errata de la plantilla): ${porTipo("renombrado").length}`);
  console.log(`  Fusiones por área (duplicados que se reducen a uno): ${porTipo("fusion").length}`);
  console.log(`  Reactivaciones (vuelven a vigente): ${porTipo("reactivacion").length}`);
  console.log(`  Registros sin cambio: ${porTipo("sin_cambio").length}`);
  console.log(`  Retiradas lógicas, en total: ${porTipo("retirada").length}`);
  console.log(`    de ellas, artefactos de la lectura antigua (no son lugares): ${artefactos.length}`);
  console.log(`    de ellas, bajas legítimas: ${bajasLegitimas.length}`);
  console.log("");

  // Alcance: nada fuera del municipio ni de la plantilla. Un alta no tiene id
  // porque no existe todavía, así que solo se comprueban los movimientos que
  // apuntan a un registro real.
  const conId = movimientos.filter((m) => m.id !== null);
  const fueraDeAlcance = conId.filter((m) => !actuales.some((r) => t(r.id) === m.id));
  const retiradasDeOtrasFuentes = porTipo("retirada").filter((m) => !m.clave.startsWith("partida|"));
  console.log("Comprobación de alcance");
  console.log(`  movimientos sobre registros existentes: ${conId.length}`);
  console.log(`  de ellos, sobre registros que no son partidas de 03031: ${fueraDeAlcance.length}`);
  console.log(`  retiradas cuya clave no es de la plantilla (partida|…): ${retiradasDeOtrasFuentes.length}`);
  console.log("");

  // Las bajas históricas se dejan como están: ya no son visibles. Se declara si
  // alguna coincide con una entidad que la plantilla sigue documentando.
  const historicasQueVuelven = bajasHistoricas.filter((r) => {
    const { identidad } = identidades(r);
    return entidadesPlantilla.has([...entidadesPlantilla.keys()].find((k) => identidadPartida(k).identidad === identidad) ?? "");
  });
  console.log("Bajas históricas que la plantilla vuelve a documentar");
  console.log(`  ${historicasQueVuelven.length} de ${bajasHistoricas.length}`);
  for (const r of historicasQueVuelven.slice(0, 20)) {
    console.log(`    ${t(r.id_origen)} (desactualizado desde ${t(r.desactualizado_desde)})`);
  }
  console.log("");

  // Origen de los registros vigentes: cuántos son lugares reales y cuántos
  // artefactos de la lectura que tomaba la columna Distrito por nombre.
  const artefactosVigentes = activos.filter((r) => identidades(r).artefacto);
  console.log("Origen de los 99 registros de partida vigentes");
  console.log(`  lugares con nombre real: ${activos.length - artefactosVigentes.length}`);
  console.log(`  artefactos con nombre numérico o «Distrito»: ${artefactosVigentes.length}`);
  console.log(`    nombres: ${[...new Set(artefactosVigentes.map((r) => t(r.nombre_oficial)))].sort().join(", ")}`);
  console.log("");

  // Inconsistencias de la propia plantilla: dos nombres casi idénticos dentro de
// la misma zona (distrito y áreas). Un distrito con área 12 tiene legítimamente
// muchos núcleos, así que compartir zona no dice nada; lo que delata una errata es
// que dos nombres se parezcan de más. No se elige aquí cuál es el bueno: se
// declara con la fila exacta de cada bloque, para que se corrija en el origen y
// no se invente un topónimo.
function distanciaCorta(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  let previo = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const fila = [i];
    for (let j = 1; j <= n; j++) {
      fila[j] = Math.min(
        previo[j] + 1,
        fila[j - 1] + 1,
        previo[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    previo = fila;
  }
  return previo[n];
}
const porZona = new Map<string, { nombre: string; filas: number[] }[]>();
for (const [, acc] of entidadesPlantilla) {
  const zona = `${acc.distrito}|${acc.areas.join(", ")}`;
  porZona.set(zona, [...(porZona.get(zona) ?? []), { nombre: acc.nombre, filas: acc.filas }]);
}
const paresSospechosos: [string, string, string, string, number][] = [];
for (const [zona, items] of porZona) {
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      const d = distanciaCorta(a.nombre.toLowerCase(), b.nombre.toLowerCase());
      // A partir de tres caracteres de diferencia ya no es una errata de escritura
      // sino dos nombres distintos, aunque convivan en la misma zona.
      if (d > 0 && d <= 2 && Math.min(a.nombre.length, b.nombre.length) >= 6) {
        paresSospechosos.push([zona, a.nombre, a.filas.join(", "), b.nombre, d]);
      }
    }
  }
}
console.log("Nombres casi idénticos en la misma zona: posibles erratas de la plantilla");
console.log(`  ${paresSospechosos.length}`);
for (const [zona, n1, f1, n2, d] of paresSospechosos) {
  console.log(`  «${n1}» (fila ${f1})  vs  «${n2}»   ·  distancia ${d}  ·  distrito y áreas «${zona}»`);
}
console.log("");

console.log("Correcciones ortográficas aplicadas a la plantilla");
for (const [mala, { correcta, motivo }] of Object.entries(ORTOGRAFIA_PARTIDAS)) {
  const filas = lectura.filas
    .filter((f) => f.partida_original === mala)
    .map((f) => `${f.fila}`);
  console.log(`  «${mala}» → «${correcta}» (fila ${filas.join(", ")})`);
  console.log(`      ${motivo}`);
}
console.log("");

console.log("Altas propuestas:");
  for (const m of porTipo("alta")) console.log(`  + ${m.clave}   ${m.detalle}`);
  console.log("");
  console.log("Casos que requieren revisión humana antes de escribir:");
  for (const m of porTipo("revision")) console.log(`  ? ${m.clave}   ${m.detalle}`);
  console.log("");
  console.log("Fusiones por área (la entidad no desaparece, deja de estar repetida):");
  for (const m of porTipo("fusion")) console.log(`  ~ ${m.clave}   ${m.detalle}`);
  console.log("");
  console.log("Reactivaciones (vuelven a vigente):");
  for (const m of porTipo("reactivacion")) console.log(`  ~ ${m.clave}   ${m.detalle}`);
  console.log("");
  console.log("Renombrados (errata de la plantilla):");
  for (const m of porTipo("renombrado")) console.log(`  ~ ${m.clave}   ${m.detalle}`);
  console.log("");
  console.log(`Artefactos de la lectura antigua que se retiran (${artefactos.length}):`);
  for (const m of artefactos) console.log(`  - ${m.clave}`);
  console.log("");
  console.log(`Bajas legítimas, entities que la plantilla ya no documenta (${bajasLegitimas.length}):`);
  for (const m of bajasLegitimas) console.log(`  - ${m.clave}   ${m.detalle}`);
  console.log("");

  await fs.writeFile(
    path.join(SALIDA, "plan.json"),
    JSON.stringify(
      {
        generado_en: copia.generado_en,
        codigo_ine: INE,
        hash_plantilla: hashPlantilla,
        copia_sha256: hashCopia,
        recuentos: {
          registros_actuales: actuales.length,
          vigentes: activos.length,
          bajas_historicas: bajasHistoricas.length,
          claves_nuevas: entidadesPlantilla.size,
          altas: porTipo("alta").length,
          revision: porTipo("revision").length,
          fusiones: porTipo("fusion").length,
          reactivaciones: porTipo("reactivacion").length,
          renombrados: porTipo("renombrado").length,
          retiradas: porTipo("retirada").length,
          retiradas_artefacto: artefactos.length,
          retiradas_legitimas: bajasLegitimas.length,
          sin_cambio: porTipo("sin_cambio").length,
        },
        movimientos,
        entidades: [...entidadesPlantilla].map(([clave, v]) => ({
          clave,
          nombre: v.nombre,
          distrito: v.distrito,
          areas: [...v.areas],
          filas_hoja: v.filas,
        })),
      },
      null,
      1
    ),
    "utf8"
  );
  console.log(`Plan escrito en ${path.relative(RAIZ, path.join(SALIDA, "plan.json"))}`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.stack ?? e.message : String(e));
  process.exitCode = 1;
});