# Flag de UI CONPREL (`NEXT_PUBLIC_CONPREL_UI`)

**Fecha:** 2026-09-24 · **Rama:** `feat/conprel-ficha` · **Estado:** IMPLEMENTADO — OFF por defecto

## Qué controla

El flag publica (o no) la experiencia CONPREL completa en la ficha municipal y en el libro XLSX:

- Sección propia **Presupuestos (PPTO-2025)** y **Liquidaciones (LIQ-2024)** en la hoja 03 de Economía.
- Tablas/bloques `conprel-ppto` / `conprel-liq` en `buildEconomiaTables` (CSV y XLSX).
- Fila de fuente CONPREL + glosario `partial (CONPREL)` en la hoja 08 del XLSX.
- Entradas de catálogo `conprel_*` visibles en `SourceMethodologyNotice` y `catalogCoverageEntries`.

## Activación

```bash
# .env.local (desarrollo) o variables de entorno de Vercel (solo tras autorización)
NEXT_PUBLIC_CONPREL_UI=true
```

- **OFF por defecto:** cualquier valor distinto de la cadena exacta `true` (incluida la ausencia) mantiene el flag apagado.
- Es `NEXT_PUBLIC_*`: se inyecta en build time del cliente y del servidor. Tras cambiarlo hay que **rebuild** (no basta un refresh).
- **Doble llave:** el flag publica la UI; la carga de datos exige además el gate §9 de `docs/conprel-integracion-partial-diseno.md`. Activar el flag sin datos cargados muestra *«Bloque CONPREL preparado, no publicado»* — nunca cifras ni ND inventados.

## Mock de desarrollo/QA

```bash
NEXT_PUBLIC_CONPREL_UI=true
SOCIDEAS_CONPREL_MOCK=true
```

Inyecta el envelope mock con los fixtures de `docs/conprel-producto-textos.md` §6 (S1–S4):

| INE | Municipio | Estado |
|---|---|---|
| 28079 / 02003 / 48020 / 15078 / 31201 | Madrid, Albacete, Bilbao, Santiago, Pamplona | S4 (ambas) |
| 48044 / 06161 | Getxo, Zarza-Capilla | S1 (solo ppto) |
| 05188 | Poveda | S2 (solo liq) |
| 01059 | Vitoria-Gasteiz | S3 (ninguno) |
| 51001 / 52001 | Ceuta, Melilla | S4 (tipo ZZ) |

**Nunca** activar `SOCIDEAS_CONPREL_MOCK` en producción. El mock solo se inyecta si **ambos** flags están en `true`.

## Qué se ve con el flag OFF

- Ficha: **cero** cadenas `CONPREL`/`conprel_`/`partial` (CONPREL) en el HTML; se conserva el `without_coverage` genérico de «Presupuesto municipal…» de siempre.
- XLSX: hoja 08 idéntica a la actual (glosario y filas AEAT/ADRH sin diff); sin bloques `conprel-*`.
- Catálogo: `getIndicatorCatalogEntry('conprel_*')` → `null`; `catalogCoverageEntries` filtra las entradas CONPREL en el punto de consulta.

## Qué se ve con el flag ON

1. Sección **«Presupuestos y liquidaciones (CONPREL)»** con badge `partial` por familia.
2. Cada indicador declara **período, unidad, fuente y definición**.
3. Cobertura congelada: *Presente en 7.345 de 8.132 municipios… (90,3 %)* / *6.861 … (84,4 %)*.
4. Ausencia: **«No consta registro municipal en el fichero consultado»** — nunca «no remitió» ni causa foral individual.
5. **0 publicado ≠ ND:** el cero de la fuente se pinta como `0 €` + etiqueta «cero publicado»; ND lleva badge.
6. Estados de cruce S1–S4 con los textos de `docs/conprel-producto-textos.md` §3.
7. Hechos provinciales medidos (Álava 0/51, Navarra ~14 %) solo como contexto, sin imputar causa a un municipio.
8. Ceuta/Melilla: nota del predicado `ZZ` (dependientes `ZV/ZO` no cuentan).
9. Hoja 08: fila CONPREL con URL oficial de descarga (`serviciostelematicosext.hacienda.gob.es`) y cobertura parcial; glosario `partial (CONPREL)`.
10. XLSX: tablas `conprel-ppto` / `conprel-liq` con columnas `Ejercicio | cdcta | Concepto cuenta | Magnitud | Valor € | Estado`. **Sin datos ⇒ sin tablas** (no se inventan ceros).

## Módulos

| Archivo | Papel |
|---|---|
| `src/lib/conprel-flag.ts` | Única fuente de verdad del flag (`isConprelUiEnabled`, `isConprelMockEnabled`) |
| `src/lib/conprel-textos.ts` | Textos contractuales §4 (puro, sin imports del catálogo) |
| `src/lib/conprel-presentation.ts` | Modelo de presentación: familias, S1–S4, cobertura, ND/0 |
| `src/lib/conprel-mock.ts` | Fixtures §6 para envelope mock |
| `src/components/socideas/ConprelSeccion.tsx` | Sección de ficha |
| `src/lib/socideas-export.ts` | `buildConprelTables` (solo flag ON + datos) |
| `src/lib/socideas-xlsx.ts` | Hoja 08: glosario + fuente CONPREL (solo flag ON) |
| `src/lib/socideas-indicator-catalog.ts` | Entradas `conprel_*` filtradas por flag |
| `scripts/qa-conprel-ficha.ts` | QA de estados/textos/no-regresión |

## No-regresión

- AEAT foral / `blocked_source` / ADRH: intactos (§7 de `docs/conprel-producto-textos.md`).
- `ficha-sheets.ts` hoja 03: estado editorial sin cambio (decisión del orquestador).
- Denominador 8.132 y coberturas 7.345/6.861 congelados: no se recalculan en UI.
- Join solo por código; tipos `AA|ZZ`; avances excluidos de cobertura.

## QA

```bash
# desde la worktree, con node_modules disponibles
node node_modules/typescript/bin/tsc --noEmit   # 0 errores
npx eslint .                                     # sin empeorar el baseline
npx tsx scripts/qa-conprel-ficha.ts              # estados + textos + flag OFF/ON
npx next build                                   # build OK
```
