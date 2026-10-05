// Comprueba la tabla de inventario hidráulico del Plan Territorial Municipal
// leyendo el paquete OOXML, sin convertir el documento ni sus valores.
//
// Uso: npx tsx scripts/incideas/qa-word-hidraulica.ts
//
// El DOCX es un ZIP. Se descomprime en memoria y se leen `word/document.xml` para
// contar tablas y sus filas. No se inventa ningún número de página: el DOCX no los
// tiene y una representación paginada sería una estimación.
import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import zlib from "node:zlib";

const RAIZ = process.cwd();
const DOCX = path.join(RAIZ, "INCIDEAS DOCUMENTOS", "25B0335 PTM Benidorm - v2.docx");

// ---------------------------------------------------------------------------
// Lectura mínima de ZIP y del XML, con la biblioteca estándar
// ---------------------------------------------------------------------------

/** Devuelve el contenido descomprimido de un miembro del ZIP por su nombre. */
function leerMiembro(zip: Buffer, nombre: string): Buffer | null {
  // Firma del final del directorio central.
  let i = zip.length - 22;
  while (i >= 0 && zip.readUInt32LE(i) !== 0x06054b50) i--;
  if (i < 0) return null;
  const total = zip.readUInt16LE(i + 10);
  const tamCentral = zip.readUInt16LE(i + 12);
  const inicioCentral = zip.readUInt32LE(i + 16);

  let p = inicioCentral;
  for (let n = 0; n < total; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) return null;
const metodo = zip.readUInt16LE(p + 10);
    const tamComprimido = zip.readUInt32LE(p + 20);
    const largoNombre = zip.readUInt16LE(p + 28);
    const largoExtra = zip.readUInt16LE(p + 30);
    const largoComentario = zip.readUInt16LE(p + 32);
    const inicioLocal = zip.readUInt32LE(p + 42);
    const nombreArchivo = zip.subarray(p + 46, p + 46 + largoNombre).toString("utf8");

    if (nombreArchivo === nombre) {
      const lf = zip.readUInt16LE(inicioLocal + 26);
      const le = zip.readUInt16LE(inicioLocal + 28);
      const inicioDatos = inicioLocal + 30 + lf + le;
      const datos = zip.subarray(inicioDatos, inicioDatos + tamComprimido);
      if (metodo === 0) return datos;
      if (metodo === 8) return zlib.inflateRawSync(datos);
      throw new Error(`Método de compresión no soportado: ${metodo}`);
    }
    p += 46 + largoNombre + largoExtra + largoComentario;
  }
  void tamCentral;
  return null;
}

/** Texto de una fila de tabla, celda a celda. */
function celdasDeFila(xmlFila: string): string[] {
  const celdas: string[] = [];
  const reCelda = /<w:tc\b[\s\S]*?<\/w:tc>|<w:tc\b[^>]*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = reCelda.exec(xmlFila)) !== null) {
    const textos = [...m[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
      .map((t) => t[1])
      .join("");
    celdas.push(
      textos
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/\s+/g, " ")
        .trim()
    );
  }
  return celdas;
}

/** Todas las tablas del documento, con sus filas ya separadas. */
function tablas(xml: string): string[][][] {
  const tablas: string[][][] = [];
  const reTabla = /<w:tbl\b[\s\S]*?<\/w:tbl>/g;
  let mt: RegExpExecArray | null;
  while ((mt = reTabla.exec(xml)) !== null) {
    const filas: string[][] = [];
    const reFila = /<w:tr\b[\s\S]*?<\/w:tr>/g;
    let mf: RegExpExecArray | null;
    while ((mf = reFila.exec(mt[0])) !== null) filas.push(celdasDeFila(mf[0]));
    if (filas.length) tablas.push(filas);
  }
  return tablas;
}

// ---------------------------------------------------------------------------
// Comprobación
// ---------------------------------------------------------------------------

if (!fs.existsSync(DOCX)) {
  console.error(`No se encuentra el documento: ${DOCX}`);
  process.exit(2);
}

const zip = fs.readFileSync(DOCX);
const documento = leerMiembro(zip, "word/document.xml");
if (!documento) {
  console.error("El DOCX no contiene word/document.xml.");
  process.exit(2);
}

const xml = documento.toString("utf8");
const todas = tablas(xml);

// La tabla del inventario hidráulico es la que reúne más filas de todo el
// documento. Se busca por contenido y no por posición, para que el resultado no
// dependa del orden en que Word haya serializado las tablas.
const candidatas = todas
  .map((t, i) => ({ indice: i, filas: t.length, tabla: t }))
  .sort((a, b) => b.filas - a.filas);

const mayor = candidatas[0];

// Se acumula todo lo impreso y, si se pide, se escribe como Markdown, para que el
// informe sea un fichero revisable y no una copia de la consola.
const lineas: string[] = [];
const imprimir = console.log;
console.log = (...args: unknown[]) => {
  const s = args.map((a) => String(a)).join(" ");
  lineas.push(s);
  imprimir(s);
};

imprimir("## Documento");
imprimir("");
imprimir(`- Fichero: \`${path.basename(DOCX)}\``);
imprimir(`- SHA-256: \`${createHash("sha256").update(zip).digest("hex").toUpperCase()}\``);
imprimir(`- Tablas en el documento: ${todas.length}`);
imprimir(`- Tablas con al menos diez filas: ${todas.filter((t) => t.length >= 10).length}`);
imprimir("");
imprimir("## Tabla más larga del documento");
imprimir("");
imprimir(`- Filas: ${mayor.filas} (índice ${mayor.indice} de ${todas.length})`);
imprimir(`- Encabezado: ${JSON.stringify(mayor.tabla[0])}`);
imprimir(`- Primera fila de datos: ${JSON.stringify(mayor.tabla[1])}`);
imprimir(`- Últimas dos: ${JSON.stringify(mayor.tabla[mayor.tabla.length - 2])}`);
imprimir(`  ${JSON.stringify(mayor.tabla[mayor.tabla.length - 1])}`);
imprimir("");

// Recuento por tipo de elemento. La columna se localiza por el encabezado, no por
// su posición fija: así el recuento no depende de que Word mantenga el orden.
const columnas = (cab: string[], patron: RegExp): number =>
  cab.findIndex((c) => patron.test(c.toLowerCase()));

const colId = columnas(mayor.tabla[0], /^id/);
const colTipo = columnas(mayor.tabla[0], /^tipo/);
const colUbic = columnas(mayor.tabla[0], /^ubicaci/);
const colObs = columnas(mayor.tabla[0], /observ/);
const colEstado = columnas(mayor.tabla[0], /caracter|estado|operativ/);

console.log("## Columnas localizadas por encabezado");
console.log("");
console.log(`- Identificador: ${colId}`);
console.log(`- Tipo: ${colTipo}`);
console.log(`- Ubicación: ${colUbic}`);
console.log(`- Observaciones: ${colObs}`);
console.log(`- Características: ${colEstado}`);
console.log("");

const filasDatos = mayor.tabla
  .filter((f, i) => i > 0 && f.some((c) => c !== ""))
  .filter((f) => (f[colId] ?? "").toLowerCase() !== "id.");

const porTipo = new Map<string, number>();
for (const f of filasDatos) {
  const tipo = (f[colTipo] ?? "").toLowerCase() || "(sin tipo)";
  porTipo.set(tipo, (porTipo.get(tipo) ?? 0) + 1);
}
console.log("## Reparto por tipo de elemento declarado");
console.log("");
for (const [tipo, n] of [...porTipo].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${tipo.padEnd(30)} ${String(n).padStart(6)}`);
}
console.log(`  ${"TOTAL".padEnd(30)} ${String(filasDatos.length).padStart(6)}`);
console.log("");

// Repetidos dentro del propio documento. Se cuentan porque un identificador que se
// repite impide usar la tabla como lista de elementos sin más trabajo.
const porId = new Map<string, number>();
for (const f of filasDatos) {
  const id = (f[colId] ?? "").toLowerCase();
  if (id) porId.set(id, (porId.get(id) ?? 0) + 1);
}
const idsRepetidos = [...porId].filter(([, n]) => n > 1);
console.log("## Identificadores repetidos en el propio documento");
console.log("");
console.log(`- Identificadores distintos: ${porId.size} de ${filasDatos.length} filas`);
console.log(`- Identificadores que aparecen más de una vez: ${idsRepetidos.length}`);
for (const [id, n] of idsRepetidos) console.log(`  ${id} aparece ${n} veces`);
console.log("");

// Elementos descritos como en proyecto, distinguiendo del estado en servicio.
const celdaEstado = (f: string[]): string =>
  [f[colEstado] ?? "", f[colObs] ?? ""].join(" ").toLowerCase();

const enProyecto = filasDatos.filter((f) => /en proyecto/.test(celdaEstado(f)));
const enServicio = filasDatos.filter((f) => /en servicio/.test(celdaEstado(f)));
const sinEstado = filasDatos.filter(
  (f) => !/en proyecto/.test(celdaEstado(f)) && !/en servicio/.test(celdaEstado(f))
);

console.log("## Estado declarado");
console.log("");
console.log(`- En servicio: ${enServicio.length}`);
console.log(`- En proyecto: ${enProyecto.length}`);
console.log(`- Sin estado legible en las columnas de estado y observaciones: ${sinEstado.length}`);
console.log(`- Suma: ${enServicio.length + enProyecto.length + sinEstado.length}`);
console.log("");
const porTipoEnProyecto = new Map<string, number>();
for (const f of enProyecto) {
  const tipo = (f[colTipo] ?? "").toLowerCase() || "(sin tipo)";
  porTipoEnProyecto.set(tipo, (porTipoEnProyecto.get(tipo) ?? 0) + 1);
}
console.log("### Los elementos «en proyecto», por tipo");
console.log("");
for (const [tipo, n] of [...porTipoEnProyecto].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${tipo.padEnd(30)} ${String(n).padStart(6)}`);
}
console.log("");

// Recuento por tipo y ubicación, que es donde se confunde un hidrante aéreo con uno
// subterráneo.
console.log("## Ubicación declarada, por tipo");
console.log("");
const combos = new Map<string, number>();
for (const f of filasDatos) {
  const k = `${(f[colTipo] ?? "").toLowerCase()} / ${(f[colUbic] ?? "").toLowerCase()}`;
  combos.set(k, (combos.get(k) ?? 0) + 1);
}
for (const [k, n] of [...combos].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(46)} ${String(n).padStart(6)}`);
}
console.log("");

// Elementos con coordenada en la propia tabla, que son los que se pueden situar.
const conCoordenada = filasDatos.filter((f) => /coord\./i.test(f.join(" ")));
console.log("## Elementos con coordenada en la propia tabla");
console.log("");
console.log(`- Filas con una coordenada escrita: ${conCoordenada.length}`);
const porTipoCoord = new Map<string, number>();
for (const f of conCoordenada) {
  const tipo = (f[colTipo] ?? "").toLowerCase() || "(sin tipo)";
  porTipoCoord.set(tipo, (porTipoCoord.get(tipo) ?? 0) + 1);
}
for (const [tipo, n] of [...porTipoCoord].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${tipo.padEnd(30)} ${String(n).padStart(6)}`);
}
console.log("");
console.log(`- Filas sin coordenada: ${filasDatos.length - conCoordenada.length}`);
console.log("  Estas necesitan una fuente geográfica o una dirección geocodificada; no se puede");
console.log("  inventar la posición a partir de la descripción del elemento.");

const argInforme = process.argv.indexOf("--informe");
if (argInforme !== -1 && process.argv[argInforme + 1]) {
  const destino = path.resolve(process.argv[argInforme + 1]);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(
    destino,
    `# Inventario hidráulico del Plan Territorial Municipal de Benidorm\n\n` +
      `Comprobación estructural sobre el paquete OOXML del documento, sin convertirlo ni\n` +
      `interpretar sus valores. Ejecutado el ${new Date().toISOString().slice(0, 10)}.\n\n` +
      lineas.join("\n") +
      "\n",
    "utf8"
  );
  console.log("");
  console.log(`Informe escrito en ${path.relative(RAIZ, destino)}`);
}
console.log("");
console.log("## Lo que este documento no permite concluir");
console.log("");
console.log("- El DOCX no tiene números de página: no se cita ninguno.");
console.log("- «En proyecto» describe el estado documentado, no que el elemento exista en la calle.");
console.log("- Una boca de riego y un hidrante son elementos distintos y no intercambiables; el documento los separa.");
console.log("- La cifra de filas de una tabla depende de si los encabezados repetidos se cuentan como filas; aquí se cuentan todas las filas del XML y se dice cuál es el total.");