// Tests de la lógica pura del módulo PAI de INCideas (src/lib/incideas/pai).
// Uso: npx tsx --test scripts/tests/incideas-pai.test.ts
//
// Los valores esperados de riesgo intrínseco son los publicados en dos PAI reales de IDEAS
// (PSF Talega, 2026, y FV Capiruza II), calculados con la hoja «Cálculos riesgo intrínseco».
// No tocan red.
import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";

import {
  calcularRiesgoIntrinseco,
  clasificarQs,
  entradaPorDefecto,
} from "../../src/lib/incideas/pai/riesgo-intrinseco";
import {
  aPlano,
  cercania,
  descomponer,
  fmtDistancia,
  fraseDistancia,
  latLngAUtm,
  planoLocal,
  rumbo,
  superficieM2,
} from "../../src/lib/incideas/pai/geo";
import { decodificarAlfaPng } from "../../src/lib/incideas/pai/png";
import { tituloPropio } from "../../src/lib/incideas/pai/entorno";
import { utmToLatLng } from "../../src/lib/incideas/pipeline/utm";

const cerca = (a: number | null, b: number, tol = 0.01) => {
  assert.ok(a !== null, "valor nulo");
  assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);
};

test("riesgo intrínseco · PSF Talega (1,6 MW, 1 CT)", () => {
  const e = entradaPorDefecto("Talega", 1.6, 1);
  e.sectores.campo_solar.area = 21502.04;
  e.sectores.estaciones_potencia.area = 15;
  const r = calcularRiesgoIntrinseco(e);
  const [campo, ct, control] = r.sectores;
  cerca(campo.qs, 21.55);
  cerca(ct.qs, 118.82);
  assert.equal(campo.nivel?.riesgo, "Bajo");
  assert.equal(ct.nivel?.riesgo, "Bajo");
  assert.equal(control.presente, false);
  assert.equal(control.qs, null);
  assert.equal(r.global?.riesgo, "Bajo");
});

test("riesgo intrínseco · FV Capiruza II (41,8 MW, 11 CT, SET)", () => {
  const e = entradaPorDefecto("Capiruza II", 41.8, 11);
  e.sectores.campo_solar.area = 477657;
  e.sectores.estaciones_potencia.area = 252.12;
  e.sectores.edificio_control.area = 44.9;
  e.sectores.almacen.area = 37.44;
  e.sectores.sala_celdas.area = 18.65;
  const r = calcularRiesgoIntrinseco(e);
  const qs = Object.fromEntries(r.sectores.map((s) => [s.definicion.clave, s.qs]));
  cerca(qs.campo_solar, 25.35);
  cerca(qs.estaciones_potencia, 77.76);
  cerca(qs.edificio_control, 224.21);
  cerca(qs.almacen, 854.45, 0.05);
  cerca(qs.sala_celdas, 14856.42, 0.05);
  assert.equal(r.sectores[3].nivel?.riesgo, "Medio");
  assert.equal(r.sectores[5].nivel?.riesgo, "Alto");
  assert.equal(r.global?.nivel, 8);
});

test("riesgo intrínseco · escalado por superficie solo por encima de 10 m²", () => {
  const e = entradaPorDefecto("x", 1, 1);
  e.sectores.edificio_control.area = 8;
  const a = calcularRiesgoIntrinseco(e).sectores[2];
  e.sectores.edificio_control.area = 20;
  const b = calcularRiesgoIntrinseco(e).sectores[2];
  assert.ok(Math.abs(b.cargaTotalMJ - 2 * a.cargaTotalMJ) < 1e-9);
});

test("niveles Qs del R.D. 164/2025 en los límites", () => {
  assert.equal(clasificarQs(425).nivel, 1);
  assert.equal(clasificarQs(425.01).nivel, 2);
  assert.equal(clasificarQs(850.01).riesgo, "Medio");
  assert.equal(clasificarQs(3400).riesgo, "Medio");
  assert.equal(clasificarQs(3400.01).riesgo, "Alto");
  assert.equal(clasificarQs(1e6).nivel, 8);
});

test("UTM ETRS89 directa reproduce la inversa del pipeline (< 1 m)", () => {
  const ll = utmToLatLng(514876, 4418561, 30);
  const u = latLngAUtm(ll.lat, ll.lng);
  assert.equal(u.huso, 30);
  assert.ok(Math.abs(u.x - 514876) < 1 && Math.abs(u.y - 4418561) < 1, `${u.x} ${u.y}`);
});

test("distancia mínima, solape y rumbo", () => {
  const plano = planoLocal(40, -3);
  const ambito = aPlano(descomponer({ type: "Polygon", coordinates: [[[-3, 40], [-2.99, 40], [-2.99, 40.01], [-3, 40.01], [-3, 40]]] }), plano);
  const linea = aPlano(descomponer({ type: "LineString", coordinates: [[-3.01, 40.02], [-2.98, 40.02]] }), plano);
  const c = cercania(ambito, linea, plano)!;
  cerca(c.distancia, 1111.95, 2);
  const dentro = aPlano(descomponer({ type: "Point", coordinates: [-2.995, 40.005] }), plano);
  assert.equal(cercania(ambito, dentro, plano)!.distancia, 0);
  assert.equal(rumbo([-3, 40], [-3, 40.1]), "norte");
  assert.equal(rumbo([-3, 40], [-2.9, 39.92]), "sureste");
  assert.equal(rumbo([-3, 40], [-3.1, 40]), "oeste");
  const sup = superficieM2(descomponer({ type: "Polygon", coordinates: [[[-3, 40], [-2.99, 40], [-2.99, 40.01], [-3, 40.01], [-3, 40]]] }), plano);
  cerca(sup / 10000, 94.7, 0.5);
});

test("formato de distancias como en los PAI", () => {
  assert.equal(fmtDistancia(650), "650 m");
  assert.equal(fmtDistancia(3217), "3.217 m");
  assert.equal(fmtDistancia(1500, true), "1,5 km");
  assert.equal(fmtDistancia(11000, true), "11 km");
  assert.equal(fraseDistancia({ distancia: 5, rumbo: "sur" }), "colindante a la instalación");
  assert.equal(fraseDistancia({ distancia: 97, rumbo: "sur" }), "a 97 m al sur");
});

test("decodificador PNG: alfa RGBA con filtros", () => {
  const w = 3;
  const h = 2;
  const filas = [
    [0, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 200], // filtro 0: alfa 0,0,200
    [2, 0, 0, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0], // filtro Up: hereda fila anterior (+10 en el primero)
  ];
  const raw = Buffer.from(filas.flat());
  const chunk = (tipo: string, datos: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(datos.length);
    return Buffer.concat([len, Buffer.from(tipo, "ascii"), datos, Buffer.alloc(4)]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  const r = decodificarAlfaPng(png);
  assert.deepEqual(Array.from(r.alfa), [0, 0, 200, 10, 0, 200]);
});

test("título propio de denominaciones oficiales", () => {
  assert.equal(tituloPropio("LA VELL Y OTROS"), "La Vell y Otros");
  assert.equal(tituloPropio("Laguna el Hito"), "Laguna el Hito");
});
