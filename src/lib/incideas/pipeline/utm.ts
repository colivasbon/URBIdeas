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
