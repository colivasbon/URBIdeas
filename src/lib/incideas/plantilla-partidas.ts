// INCideas — Lectura estructural de la hoja `Núcleos_partidas` de la plantilla
// municipal.
//
// El problema real que resuelve esta hoja, comprobado sobre
// `INCIDEAS DOCUMENTOS/Limpieza info.xlsx` (SHA-256 6080565…):
//
//   · La hoja tiene DOS BLOQUES con distinto desplazamiento de columnas. Las filas
//     2 a 82 guardan la partida en la columna B (índice 1), el distrito en C y el
//     área en D. Desde la fila 83 el bloque se desplaza una columna a la izquierda:
//     la partida pasa a la columna A (índice 0). La fila 83 es, además, un
//     ENCABEZADO repetido («Partida | Distrito | Subsector»).
//   · El importador leía índices fijos (1, 2, 3). A partir de la fila 83 leía el
//     DISTRITO como nombre de partida y el ÁREA como distrito. De ahí salen las
//     partidas con nombre numérico («2», «3», «4») y la fila llamada «Distrito».
//   · Además, cuando el distrito o el área guardan una lista («6, 9, 13»), esa lista
//     se conserva como texto y no se descompone.
//
// Esta lectura es estructural y determinista: no interpreta el contenido, decide
// dónde empieza cada bloque comparando los rótulos de la cabecera con la fila
// actual, y descarta las filas que son encabezado. No inventa ni completa ningún
// valor. Lo que no puede leer se devuelve en `filas_descartadas` con su motivo,
// para que quede declarado como carencia y no como dato perdido en silencio.

/** Una fila de partida ya leída, con el desplazamiento con que se encontró. */
export interface FilaPartida {
  /** Número de fila en la hoja, contando desde 1, como lo ve un humano. */
  fila: number;
  /** Desplazamiento de columnas del bloque al que pertenece la fila. */
  desplazamiento: number;
  partida: string;
  distrito: string;
  area: string;
  /** Grafía tal y como viene en la hoja, si se corrigió por `ORTOGRAFIA_PARTIDAS`. */
  partida_original?: string;
}

/**
 * Erratas de la propia plantilla, decididas una a una y con su motivo.
 *
 * `Núcleos_partidas` documenta un mismo núcleo con dos grafías: la fila 25 del
 * primer bloque pone «Amanello» y la fila 86 del segundo pone «Armanello»,
 * ambas del distrito 3 y con el área 12. El resto del libro usa «Armanello» de
 * forma coherente (la parada «357 - C. Armanello», la calle «C/ Armanello» y el
 * «Camí de l'Armanello»), así que la fila 25 es la que se corrige.
 *
 * Se declara aquí y no se deduce, para que quede escrito por qué se elige una
 * grafía y no la otra. Sin corregirla, la importación crearía dos topónimos para
 * el mismo lugar.
 */
export const ORTOGRAFIA_PARTIDAS: Record<string, { correcta: string; motivo: string }> = {
  Amanello: {
    correcta: "Armanello",
    motivo:
      "La fila 25 de Núcleos_partidas escribe «Amanello» y la fila 86 escribe «Armanello» para el " +
      "mismo núcleo del distrito 3, área 12. Manda «Armanello» porque es la grafía que usa el resto " +
      "del libro (parada «357 - C. Armanello», calle «C/ Armanello», «Camí de l'Armanello»).",
  },
};

/** Una fila que no se ha podido leer como partida, con el motivo. */
export interface FilaDescartada {
  fila: number;
  desplazamiento: number;
  motivo: "encabezado_repetido" | "partida_vacia" | "sin_texto";
  /** Contenido crudo de la fila, para poder revisarla. */
  crudo: string[];
}

export interface BloqueDetectado {
  /** Número de la fila que abre el bloque (la del encabezado). */
  fila_encabezado: number;
  /** Columna donde empieza la partida dentro del bloque. */
  desplazamiento: number;
  filas: number;
}

export interface LecturaPartidas {
  filas: FilaPartida[];
  descartadas: FilaDescartada[];
  bloques: BloqueDetectado[];
  /** Rótulos de la cabecera principal, en su orden. */
  encabezado: string[];
}

type Celda = string | number | null | undefined;

function t(v: Celda): string {
  return v === null || v === undefined ? "" : String(v).trim();
}

/** Normaliza un rótulo para comparar: sin tildes, sin espacios, en minúsculas. */
function rotulo(v: Celda): string {
  return t(v)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const ROTULO_PARTIDA = "partida";
const ROTULO_DISTRITO = "distrito";
const ROTULO_AREA = "area";

/**
 * ¿Esta fila es un encabezado? Se comprueba que contenga los tres rótulos de la
 * tabla, en cualquier orden y con cualquier desplazamiento. Es lo que permite
 * reconocer el segundo bloque y descartar el encabezado repetido de la fila 83.
 */
function filaDeEncabezado(fila: Celda[]): number | null {
  let hayDistrito = false;
  let hayArea = false;
  let columnaPartida = -1;

  fila.forEach((celda, i) => {
    const r = rotulo(celda);
    if (!r) return;
    if (r.startsWith(ROTULO_PARTIDA) && columnaPartida === -1) columnaPartida = i;
    if (r.startsWith(ROTULO_DISTRITO)) hayDistrito = true;
    if (r.startsWith(ROTULO_AREA) || r === "subsector") hayArea = true;
  });

  // Sin los tres rótulos no es una cabecera: es una fila de datos.
  if (!hayDistrito || !hayArea || columnaPartida === -1) return null;
  return columnaPartida;
}

/** Descompone «6, 9, 13» en ["6","9","13"]; deja el texto intacto si no es una lista. */
export function esListaNumerica(valor: string): boolean {
  const partes = valor
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return partes.length > 1 && partes.every((s) => /^\d+$/.test(s));
}

/**
 * Lee la hoja. `hoja` es el resultado de `XLSX.utils.sheet_to_json` con
 * `header: 1`: un array de arrays donde la fila 0 es la primera fila real.
 *
 * No recibe el libro entero a propósito: así la función se puede probar con
 * matrices escritas a mano, sin depender del XLSX real en las pruebas.
 */
export function leerPartidas(hoja: Celda[][]): LecturaPartidas {
  const filas: FilaPartida[] = [];
  const descartadas: FilaDescartada[] = [];
  const bloques: BloqueDetectado[] = [];

  // El desplazamiento vigente lo fija cada encabezado y lo heredan las filas
  // siguientes. Si una cabecera aparece con el MISMO desplazamiento que el vigente
  // es un encabezado repetido dentro del mismo bloque; si aparece con OTRO
  // desplazamiento, abre un bloque nuevo. Es la diferencia entre la fila 83
  // (encabezado repetido) y un segundo bloque desplazado de verdad.
  let desplazamiento = -1;

  for (let i = 0; i < hoja.length; i++) {
    const fila = hoja[i] ?? [];
    const numeroFila = i + 1;

    const cab = filaDeEncabezado(fila);
    if (cab !== null) {
      if (cab === desplazamiento) {
        // Encabezado repetido dentro del bloque vigente: se descarta como fila.
        descartadas.push({
          fila: numeroFila,
          desplazamiento: cab,
          motivo: "encabezado_repetido",
          crudo: fila.map(t),
        });
      } else {
        bloques.push({ fila_encabezado: numeroFila, desplazamiento: cab, filas: 0 });
        desplazamiento = cab;
      }
      continue;
    }

    if (desplazamiento === -1) {
      // Sin encabezado reconocible la hoja no tiene la forma esperada. No se
      // inventa una posición de columnas: el llamante lo declara como carencia.
      continue;
    }

    const partida = t(fila[desplazamiento]);
    if (partida === "") {
      // Una fila totalmente vacía es separador, no carencia: no se declara para no
      // llenar el informe de ruido. Solo se declara si había contenido en las
      // columnas del bloque.
      const conContenido = fila
        .slice(desplazamiento, desplazamiento + 3)
        .some((c) => t(c) !== "");
      if (conContenido) {
        descartadas.push({
          fila: numeroFila,
          desplazamiento,
          motivo: "partida_vacia",
          crudo: fila.map(t),
        });
      }
      continue;
    }
    // Una fila que solo contiene cifras en la columna de la partida es un valor de
    // distrito o de área leída en el sitio equivocado, no el nombre de una
    // partida. No se inventa el nombre: se descarta y queda declarado.
    if (/^[\d.,\s]+$/.test(partida)) {
      descartadas.push({
        fila: numeroFila,
        desplazamiento,
        motivo: "sin_texto",
        crudo: fila.map(t),
      });
      continue;
    }

    const distrito = t(fila[desplazamiento + 1]);
    const area = t(fila[desplazamiento + 2]);
    // La grafía corregida manda antes de agrupar: si no, «Amanello» y «Armanello»
    // se tratarán como dos entidades distintas.
    const correccion = ORTOGRAFIA_PARTIDAS[partida];
    const leida: FilaPartida = { fila: numeroFila, desplazamiento, partida, distrito, area };
    if (correccion) {
      leida.partida = correccion.correcta;
      leida.partida_original = partida;
    }
    filas.push(leida);

    const bloque = bloques[bloques.length - 1];
    if (bloque) bloque.filas += 1;
  }

  const encabezado = (hoja[0] ?? []).map(t).filter((v) => v !== "");
  return { filas, descartadas, bloques, encabezado };
}

/**
 * Clave de importación de una partida.
 *
 * El área forma parte de la clave porque una partida puede abarcar varias áreas: es
 * lo que separa filas que son entidades distintas. Las listas («6, 9, 13») se
 * ordenan para que dos filas que documentan las mismas áreas con distinto orden no
 * se traten como distintas.
 */
/**
 * Clave de importación de una partida: distrito y nombre.
 *
 * El área NO forma parte de la clave. La hoja documenta cada partida dos veces:
 * el primer bloque repite una fila por área («El Saladar» con área 10, luego con
 * 12) y el segundo la da una vez con la lista completa («El Saladar» con «9, 10,
 * 12»). Meter el área en la clave convertía una sola entidad en tres y hacía que
 * el libro mostrara «El Saladar» repetido. El área es un atributo y se acumula
 * como lista.
 */
export function clavePartida(p: FilaPartida): string {
  return `partida|${p.distrito}|${p.partida}`;
}

/**
 * Identidad de una partida a partir de una clave guardada, sea del formato
 * vigente o de alguno histórico.
 *
 * Distingue además las claves que no son una partida real. La lectura antigua
 * leía el segundo bloque desplazado una columna y guardaba la columna Distrito
 * como si fuera el nombre, dejando claves como `partida|4, 5|4|` (el área en el
 * campo del distrito, el número de distrito como nombre) y `partida|Subsector|
 * Distrito|` del encabezado repetido. Son artefactos de esa lectura, no lugares:
 * la columna Distrito solo tiene cuatro valores distintos, así que no hay forma
 * de saber qué partida nombraban.
 */
export function identidadPartida(clave: string): { identidad: string; artefacto: boolean } {
  const partes = clave.split("|");
  const distrito = (partes[1] ?? "").trim();
  const nombre = (partes[2] ?? "").trim();
  const artefacto = /^[\d.,\s]+$/.test(nombre) || /^distrito$/i.test(nombre) || nombre === "";
  return { identidad: `partida|${distrito}|${nombre}`, artefacto };
}

/** Quita repeticiones de una lista de claves conservando el orden de aparición. */
export function clavesUnicas(claves: string[]): { unicas: string[]; repetidas: string[] } {
  const vistas = new Set<string>();
  const unicas: string[] = [];
  const repetidas: string[] = [];
  for (const c of claves) {
    if (vistas.has(c)) repetidas.push(c);
    else {
      vistas.add(c);
      unicas.push(c);
    }
  }
  return { unicas, repetidas };
}