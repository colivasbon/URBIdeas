import type { Medicion } from "@/lib/incideas/pai/entorno";
import { GRUPO_POR_ID } from "@/lib/incideas/pai/grupos";

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function medicionesAGeoJSON(items: Medicion[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: items
      .filter((m) => m.distancia > 0)
      .map((m) => ({
        type: "Feature" as const,
        properties: {
          nombre: m.nombre,
          grupo: GRUPO_POR_ID[m.grupo].nombre,
          categoria: m.categoria,
          distancia_m: Math.round(m.distancia),
          rumbo: m.rumbo,
          detalle: m.detalle ?? null,
          fuente: m.fuente,
          tiempo_min: m.ruta?.minutos ?? null,
          ruta_km: m.ruta?.km ?? null,
        },
        geometry: { type: "LineString" as const, coordinates: m.linea },
      })),
  };
}

export function medicionesAKML(items: Medicion[], titulo: string): string {
  const marcas = items
    .filter((m) => m.distancia > 0)
    .map(
      (m) => `    <Placemark>
      <name>${xml(m.nombre)}</name>
      <description>${xml(`${GRUPO_POR_ID[m.grupo].nombre} · ${Math.round(m.distancia)} m al ${m.rumbo} · ${m.fuente}`)}</description>
      <LineString><coordinates>${m.linea.map(([x, y]) => `${x},${y},0`).join(" ")}</coordinates></LineString>
    </Placemark>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${xml(titulo)}</name>
${marcas}
  </Document>
</kml>
`;
}

export function descargar(nombre: string, contenido: string, mime: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: `${mime};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}
