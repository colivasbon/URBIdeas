# Hito 2 — Fase 1 nacional en muestra (6 municipios)

Muestra: Benidorm 03031, Murcia 30030, Lagrán 01030, Santa Cruz de Tenerife
38038, Pamplona/Iruña 31201, Ceuta 51001. Plan 64 pares, lote 64/64 sin
fallos; snapshot `incideas:snap:e92540e4be4df78` aprobada tras QA.

## Por bloque (objetos publicados)

- `limites` (IGN AU, 4thOrder): 6/6.
- `poblacion` (INE R2, sin `municipios.poblacion`): 5/6 (Ceuta sin envelope).
- `combustible` (MINETUR, IDMunicipio resuelto): 166 estaciones (Benidorm 10,
  Murcia 111, SCT 33, Pamplona 12, Ceuta 10, Lagrán 0 con ID válido).
- `sanidad` (REGCESS C1): 29 (Murcia 11, SCT 9, Pamplona 7, Ceuta 2).
- `farmacias` (REGCESS-E + Navarra): 989 + 211 (titulares anonimizados).
- `recarga` (NAP, 12.038 sites revisados): 233 (Murcia 124, SCT 42,
  Pamplona 35, Benidorm 31, Ceuta 1, Lagrán 0).
- `educacion` (Navarra CSV 115, GVA CSV 37; RCD sin bulk): resto documentado.
- `hidrografia` (IGN IGR): 8.076 miembros (Murcia 5.699, SCT 1.630,
  Benidorm 522, Lagrán 291, Ceuta 250, Pamplona 194).
- `inundabilidad` (SNCZI raster 3/3 + PATRICOVA donde aplica): 6/6.
- `depuradoras` (PRTR): 0 fichas compatibles en la muestra (vía parcial
  confirmada: solo ≥100k e-h + agregación CCAA pendiente; no se afirma
  cobertura municipal).

## Cautelas que se mantienen

Miembros ≠ cauces; exposición 451/1.111 no es afección; Murcia sin
inventario; contención T vectorial pendiente; PATRICOVA no aplicable fuera
de la CV. Auditoría de población en `docs/fase3-auditoria-poblacion.md`
(sin escritura).
