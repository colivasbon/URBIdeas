// Tests del análisis de entorno por fases y de las utilidades del visor (src/lib/incideas/pai
// y src/components/incideas/pai/mapa). Los servicios externos se simulan: no tocan red.
// Uso: npx tsx --test scripts/tests/incideas-pai-entorno.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

import { analizarEntorno, type EventoEntorno } from "../../src/lib/incideas/pai/entorno";
import { GRUPOS } from "../../src/lib/incideas/pai/grupos";
import { ambitoDeFiguras, circuloAPoligono, limitesGeometria, medidaFigura, type Figura } from "../../src/components/incideas/pai/mapa/figuras";
import { medicionesAGeoJSON, medicionesAKML } from "../../src/components/incideas/pai/mapa/exportar";

const LAT = 40.5;
const LNG = -3.2;
// Desplazamientos aproximados: 0,01° de latitud ≈ 1.113 m.
const nodo = (id: number, dLat: number, dLng: number, tags: Record<string, string>) => ({ type: "node", id, lat: LAT + dLat, lon: LNG + dLng, tags });
const via = (id: number, tags: Record<string, string>, pts: [number, number][]) => ({
  type: "way",
  id,
  tags,
  geometry: pts.map(([dLat, dLng]) => ({ lat: LAT + dLat, lon: LNG + dLng })),
});

const OSM_ENTORNO = [
  nodo(1, 0.03, 0.02, { place: "village", name: "Villaverde" }),
  nodo(2, 0.004, 0.003, { emergency: "fire_hydrant" }),
  {
    type: "way",
    id: 3,
    tags: { natural: "water", water: "reservoir", name: "El Pozo" },
    geometry: [[0.02, 0.0], [0.02, 0.004], [0.024, 0.004], [0.024, 0.0], [0.02, 0.0]].map(([a, b]) => ({ lat: LAT + a, lon: LNG + b })),
  },
  nodo(4, -0.02, 0.01, { power: "substation", name: "Subestación Norte" }),
];
const OSM_MEDIOS = [
  nodo(10, 0.05, 0.0, { amenity: "fire_station", name: "Parque de Bomberos de Villaverde" }),
  nodo(11, -0.04, 0.02, { amenity: "police" }),
  nodo(12, 0.06, 0.03, { amenity: "hospital", name: "Hospital Comarcal" }),
];
const OSM_VIARIO = [
  via(20, { highway: "motorway", ref: "A-3" }, [[0.005, -0.02], [0.005, 0.02]]),
  via(21, { power: "line", voltage: "66000" }, [[-0.006, -0.02], [-0.006, 0.02]]),
  via(22, { waterway: "river", name: "Río Tajuña" }, [[0.01, -0.02], [0.012, 0.02]]),
];

const cuerpoOverpass = (init?: RequestInit) => decodeURIComponent(String(init?.body ?? ""));

async function conServicios<T>(manejador: (url: string, init?: RequestInit) => Response, f: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => manejador(String(input instanceof Request ? input.url : input), init)) as typeof fetch;
  try {
    return await f();
  } finally {
    globalThis.fetch = original;
  }
}

const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { "content-type": "application/json" } });

test("análisis por fases: eventos, grupos de mediciones y resultado coherentes", async () => {
  const eventos: EventoEntorno[] = [];
  const r = await conServicios(
    (url, init) => {
      if (url.includes("overpass")) {
        const q = cuerpoOverpass(init);
        return json({ elements: q.includes("fire_station") ? OSM_MEDIOS : q.includes("highway") ? OSM_VIARIO : OSM_ENTORNO });
      }
      if (url.includes("geoserver.iepnb.es")) return json({ type: "FeatureCollection", features: [] });
      if (url.includes("servicios.idee.es")) return new Response("<html/>", { status: 200, headers: { "content-type": "text/html" } });
      if (url.includes("catastro")) return new Response("<root><pc1>1234567</pc1><pc2>AB1234C</pc2><ldt>POLÍGONO 1 PARCELA 2</ldt></root>", { status: 200 });
      if (url.includes("nominatim")) return json({ address: { town: "Villaverde", province: "Madrid", state: "Comunidad de Madrid" } });
      if (url.includes("open-meteo")) return json({ elevation: [712.4] });
      if (url.includes("osrm")) return json({ routes: [{ distance: 8400, duration: 600 }] });
      return new Response("not found", { status: 404 });
    },
    () => analizarEntorno({ type: "Point", coordinates: [LNG, LAT] }, (e) => eventos.push(e))
  );

  assert.equal(eventos[0].tipo, "inicio");
  assert.equal(eventos.at(-1)?.tipo, "fin");
  const inicio = eventos[0] as Extract<EventoEntorno, { tipo: "inicio" }>;
  assert.equal(inicio.fuentes.length, 12);

  // Cada fuente termina; SNCZI falla (respuesta no PNG) sin detener el análisis.
  const finales = new Map<string, string>();
  for (const e of eventos) if (e.tipo === "fuente" && e.estado !== "cargando") finales.set(e.id, e.estado);
  assert.equal(finales.get("snczi"), "error");
  assert.equal(finales.get("osm-viario"), "ok");
  assert.equal(finales.get("osm-medios"), "ok");
  assert.equal(finales.get("osm-entorno"), "ok");
  assert.equal(finales.get("osrm"), "ok");
  assert.ok(r.avisos.some((a) => a.startsWith("SNCZI")));

  // Mediciones: ids únicos, grupos válidos y todos los tipos esperados presentes.
  const ids = r.mediciones.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
  const validos = new Set(GRUPOS.map((g) => g.id as string));
  assert.ok(r.mediciones.every((m) => validos.has(m.grupo)));
  const porGrupo = (g: string) => r.mediciones.filter((m) => m.grupo === g);
  for (const g of ["seguridad", "sanidad", "agua", "viario", "energia", "nucleos"]) assert.ok(porGrupo(g).length > 0, `sin mediciones de ${g}`);
  assert.ok(porGrupo("agua").some((m) => m.categoria === "punto_agua" && /Hidrante/.test(m.nombre)));
  assert.ok(porGrupo("agua").some((m) => m.categoria === "punto_agua" && /Embalse «El Pozo»/.test(m.nombre)));

  // Distancias plausibles: la autovía a ~560 m (0,005° de latitud).
  const autovia = porGrupo("viario").find((m) => /A-3/.test(m.nombre));
  assert.ok(autovia && autovia.distancia > 500 && autovia.distancia < 620, `autovía a ${autovia?.distancia}`);

  // Los mismos objetos alimentan las tablas del PAI y el panel (el tiempo de llegada se propaga).
  assert.equal(r.mediosExternos.length, 3);
  assert.ok(r.mediciones.some((m) => m.categoria === "bomberos" && m.ruta?.minutos === 10));
  assert.ok(eventos.some((e) => e.tipo === "actualizar" && e.parche.ruta));
  assert.ok(r.mediciones.every((m) => !("sinNombre" in m)), "no debe filtrarse la marca interna");

  // El medio sin nombre en OSM se completa con la localidad (geocodificación inversa).
  assert.ok(r.mediosExternos.some((m) => m.categoria === "policia" && /Policía de Villaverde/.test(m.nombre)));

  // Ubicación emitida por partes.
  assert.equal(r.ubicacion.municipio, "Villaverde");
  assert.equal(r.ubicacion.altitud, 712);
  assert.deepEqual(r.ubicacion.parcelas, [{ referencia: "1234567AB1234C", descripcion: "POLÍGONO 1 PARCELA 2" }]);
});

test("análisis por fases: si un grupo de OSM falla, el resto de resultados se conserva", async () => {
  const r = await conServicios(
    (url, init) => {
      if (url.includes("overpass")) {
        const q = cuerpoOverpass(init);
        if (q.includes("highway")) return new Response("busy", { status: 429 });
        return json({ elements: q.includes("fire_station") ? OSM_MEDIOS : OSM_ENTORNO });
      }
      if (url.includes("geoserver")) return json({ type: "FeatureCollection", features: [] });
      return new Response("{}", { status: 404 });
    },
    () => analizarEntorno({ type: "Point", coordinates: [LNG + 0.5, LAT + 0.3] })
  );
  assert.ok(r.avisos.some((a) => /viario/.test(a)));
  assert.ok(r.nucleos.length > 0);
  assert.ok(r.mediosExternos.length > 0);
  assert.equal(r.infraestructuras.length, 0);
});

test("círculo: el polígono generado tiene el radio pedido y el área esperada", () => {
  const poli = circuloAPoligono(39.9, -2.8, 500);
  const ha = Number(medidaFigura({ tipo: "circulo", geometry: poli, radio: 500 }).match(/([\d,]+) ha/)?.[1].replace(",", "."));
  assert.ok(Math.abs(ha - 78.5) < 1, `área ${ha} ha`);
});

test("ámbito: varias figuras se unen, las excluidas no cuentan y las colecciones se aplanan", () => {
  const f = (id: string, geometry: GeoJSON.Geometry, incluida = true): Figura => ({ id, tipo: "poligono", nombre: id, geometry, incluida });
  const p1: GeoJSON.Geometry = { type: "Point", coordinates: [-2.8, 39.9] };
  const p2: GeoJSON.Geometry = { type: "Point", coordinates: [-2.7, 39.9] };
  assert.equal(ambitoDeFiguras([f("a", p1, false)]), null);
  assert.deepEqual(ambitoDeFiguras([f("a", p1), f("b", p2, false)]), p1);
  const coleccion: GeoJSON.Geometry = { type: "GeometryCollection", geometries: [p1, p2] };
  const u = ambitoDeFiguras([f("a", coleccion), f("b", p1)]);
  assert.equal(u?.type === "GeometryCollection" && u.geometries.length, 3);
  assert.deepEqual(limitesGeometria(coleccion), [[39.9, -2.8], [39.9, -2.7]]);
});

test("exportación de mediciones: escapa texto externo y omite las de distancia cero", () => {
  const base = { rumbo: "norte", frase: "", fuente: "OSM", id: "m1", grupo: "viario" as const, categoria: "x", linea: [[-3, 40], [-3, 40.01]] as [[number, number], [number, number]] };
  const items = [
    { ...base, nombre: 'A-3 <script>"&"</script>', distancia: 1112 },
    { ...base, id: "m2", nombre: "Dentro", distancia: 0 },
  ];
  assert.equal(medicionesAGeoJSON(items).features.length, 1);
  const kml = medicionesAKML(items, "Prueba & Cía");
  assert.ok(!kml.includes("<script>"));
  assert.ok(kml.includes("A-3 &lt;script&gt;&quot;&amp;&quot;&lt;/script&gt;"));
  assert.ok(kml.includes("Prueba &amp; Cía"));
  assert.equal((kml.match(/<Placemark>/g) ?? []).length, 1);
});
