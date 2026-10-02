// Conversión UTM → geográficas (WGS84) sin dependencias.
// Fórmulas estándar (USGS/Snyder, Transverse Mercator inversa). Para España
// ETRS89 (EPSG:258xx) y WGS84 difieren < 1 m, irrelevante a esta escala.

export interface LatLng {
  lat: number;
  lng: number;
}

export function utmToLatLng(
  easting: number,
  northing: number,
  zone: number,
  hemisferioNorte = true
): LatLng {
  const a = 6378137.0;
  const eccSquared = 0.00669438;
  const k0 = 0.9996;
  const e1 = (1 - Math.sqrt(1 - eccSquared)) / (1 + Math.sqrt(1 - eccSquared));

  const x = easting - 500000;
  const y = hemisferioNorte ? northing : northing - 10000000;
  const longOrigin = (zone - 1) * 6 - 180 + 3;
  const eccPrimeSquared = eccSquared / (1 - eccSquared);

  const M = y / k0;
  const mu =
    M /
    (a *
      (1 -
        eccSquared / 4 -
        (3 * eccSquared * eccSquared) / 64 -
        (5 * eccSquared * eccSquared * eccSquared) / 256));

  const phi1Rad =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu);

  const N1 = a / Math.sqrt(1 - eccSquared * Math.sin(phi1Rad) ** 2);
  const T1 = Math.tan(phi1Rad) ** 2;
  const C1 = eccPrimeSquared * Math.cos(phi1Rad) ** 2;
  const R1 =
    (a * (1 - eccSquared)) / Math.pow(1 - eccSquared * Math.sin(phi1Rad) ** 2, 1.5);
  const D = x / (N1 * k0);

  const lat =
    phi1Rad -
    ((N1 * Math.tan(phi1Rad)) / R1) *
      ((D * D) / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * eccPrimeSquared) * D ** 4) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * eccPrimeSquared - 3 * C1 * C1) *
          D ** 6) /
          720);

  const lon =
    (D -
      ((1 + 2 * T1 + C1) * D ** 3) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * eccPrimeSquared + 24 * T1 * T1) * D ** 5) /
        120) /
    Math.cos(phi1Rad);

  return {
    lat: (lat * 180) / Math.PI,
    lng: longOrigin + (lon * 180) / Math.PI,
  };
}

/** Detecta si un par de coordenadas parece UTM (España: x≈6 dígitos, y≈7 dígitos). */
export function pareceUTM(x: number, y: number): boolean {
  return Math.abs(x) > 1000 && Math.abs(y) > 1000000 && Math.abs(y) < 10000000;
}

// ---------------------------------------------------------------------------
// Sentido inverso: geográficas → UTM. Añadido en la Fase 1 porque el contrato de
// salida exige la coordenada X e Y en ETRS89 UTM, que es el sistema de referencia
// que usa el Plan Territorial Municipal (por ejemplo «coord. (749923; 4269043)»).
// ---------------------------------------------------------------------------

/**
 * Huso UTM a partir de la longitud. Fórmula normalizada ( Snyder):
 * huso = floor((longitud + 180) / 6) + 1. Reparto verificado para España:
 *   Canarias (≈ −17°) → 28 · península (−9° a 3°) → 29 o 30 · Menorca (≈ 4°) → 31.
 */
export function husoDesdeLongitud(lng: number): number {
  return Math.floor((lng + 180) / 6) + 1;
}

/**
 * Código EPSG del huso en el hemisferio norte, en la serie ETRS89: 25828 en
 * Canarias, 25829 y 25830 en la península, 25831 en el este. Es la serie que
 * corresponde a la cartografía oficial española y la que pide el contrato de
 * salida. Se usa ETRS89 y no WGS84 porque a la escala de un municipio ambos
 * coinciden dentro del centímetro, pero ETRS89 es el datum oficial.
 * Devuelve null si el huso queda fuera del ámbito peninsular y canario.
 */
export function epsgDesdeHuso(huso: number): number | null {
  if (!Number.isInteger(huso) || huso < 28 || huso > 31) return null;
  return 25800 + huso;
}

export interface UtmCoord {
  x: number;
  y: number;
  huso: number;
}

/**
 * Geográficas (WGS84, grados decimales) → UTM en el hemisferio norte.
 * Se usa el elipsoide GRS80 con k0 = 0,9996, el de ETRS89, que es el sistema de
 * referencia que exige el contrato de salida. A la escala de un municipio, ETRS89 y
 * WGS84 difieren menos de un centímetro.
 */
export function latLngToUtm(lat: number, lng: number, huso?: number): UtmCoord {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error(`Coordenada no numérica: ${lat}, ${lng}`);
  }
  if (lat < -80 || lat > 84) {
    throw new Error(`Latitud fuera del dominio de UTM: ${lat}`);
  }
  if (lng < -180 || lng > 180) {
    throw new Error(`Longitud fuera del dominio de UTM: ${lng}`);
  }

  const a = 6378137.0;
  const f = 1 / 298.257222101; // achatamiento de GRS80
  const eccSquared = 2 * f - f * f;
  const eccPrimeSquared = eccPrime(eccSquared);
  const k0 = 0.9996;

  // Desplazamiento falso: sitúa el meridiano central en 500.000 m para que las
  // coordenadas nunca salgan negativas. El conversor inverso lo resta, así que
  // los dos tienen que aplicarlo.
  const desplazamientoFalso = 500000;

  const zona = huso ?? husoDesdeLongitud(lng);
  if (!Number.isInteger(zona) || zona < 1 || zona > 60) {
    throw new Error(`Huso UTM no válido: ${zona}`);
  }

  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lng * Math.PI) / 180;
  const meridianoCentral = (((zona - 1) * 6 - 180 + 3) * Math.PI) / 180;

  // 1. Arco meridiano M desde la latitud del punto.
  const M =
    a *
    ((1 - eccSquared / 4 - (3 * eccSquared ** 2) / 64 - (5 * eccSquared ** 3) / 256) * latRad -
      ((3 * eccSquared) / 8 + (3 * eccSquared ** 2) / 32 + (45 * eccSquared ** 3) / 1024) *
        Math.sin(2 * latRad) +
      ((15 * eccSquared ** 2) / 256 + (45 * eccSquared ** 3) / 1024) * Math.sin(4 * latRad) -
      ((35 * eccSquared ** 3) / 3072) * Math.sin(6 * latRad));

  // 2. Latitud del pie, phi1. La serie se desarrolla alrededor de ella y no
  //    alrededor de la latitud del punto: es el paso que suele olvidarse.
  const mu =
    M /
    (a *
      (1 - eccSquared / 4 - (3 * eccSquared ** 2) / 64 - (5 * eccSquared ** 3) / 256));
  const e1 = (1 - Math.sqrt(1 - eccSquared)) / (1 + Math.sqrt(1 - eccSquared));
  const phi1 =
    mu -
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) -
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) -
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);

  const senPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const N1 = a / Math.sqrt(1 - eccSquared * senPhi1 ** 2);
  const T1 = Math.tan(phi1) ** 2;
  const C1 = eccPrimeSquared * cosPhi1 ** 2;

  // 3. A es la diferencia de longitud medida sobre el paralelo, no en el ecuador.
  //    Sin este coseno, la coordenada sale desviada unos veinte kilómetros en las
  //    zonas centrales.
  const A = cosPhi1 * (lonRad - meridianoCentral);

  const x =
    desplazamientoFalso +
    k0 *
      N1 *
      (A +
        ((1 - T1 + C1) * A ** 3) / 6 +
        ((5 - 18 * T1 + T1 * T1 + 72 * C1 - 58 * eccPrimeSquared) * A ** 5) / 120);

  // En el hemisferio norte no hay desplazamiento falso en la ordenada.
  const y =
    k0 *
    (M +
      (N1 * Math.tan(phi1) * A ** 2) / 2 +
      ((5 - T1 + 9 * C1 + 4 * C1 * C1) * A ** 4) / 24 +
      ((61 - 58 * T1 + T1 * T1 + 600 * C1 - 330 * eccPrimeSquared) * A ** 6) / 720);

  return { x, y, huso: zona };
}

function eccPrime(eccSquared: number): number {
  return eccSquared / (1 - eccSquared);
}

/**
 * Compara una coordenada UTM con la que devuelve el conversor geográficas → UTM.
 * Sirve de comprobación: si la diferencia supera un metro, algún punto está mal.
 */
export function discrepanciaUtmM(
  lat: number,
  lng: number,
  x: number,
  y: number
): number {
  const ida = latLngToUtm(lat, lng);
  return Math.hypot(ida.x - x, ida.y - y);
}
