# Esquema R2 Fase 2B — ampliación económica del envelope v2

## 1. Esquema previo (v2, vigente)

```json
{
  "version": 2,
  "codigo_ine": "41091",
  "generado_en": "2026-09-03T14:00:00.000Z",
  "indicators": [{ "slug": "population_total", "nombre": "Población total", "unidad": "personas" }],
  "sources": [{ "slug": "ine_tempus3", "organismo": "Instituto Nacional de Estadística", "nombre": "API JSON Tempus3" }],
  "source_urls": ["https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/2895?nult=...&tv=19:16473"],
  "dimensiones": [{ "ambito": "municipio" }],
  "valores": [[0, 2025, 689423, "personas", 0, 0, "2895", "DPOPxxx", "validado"]]
}
```

Tupla: `[indIdx, anio, valor, unidad, dimIdx, urlIdx, tableId, serieId|null, estado]`. Sin cambios de orden ni columnas.

## 2. Ampliación Economía (mismo envelope, `version: 2`)

### 2.1 Nuevas `sources` (slugs = catálogo Supabase, migración 029 preparada)

| slug | organismo | nombre |
|---|---|---|
| `ine_tempus3` | Instituto Nacional de Estadística | API JSON Tempus3 (existente) |
| `aeat_edm` | Agencia Estatal de Administración Tributaria | Estadística de declarantes del IRPF por municipios |
| `ine_adrh` | Instituto Nacional de Estadística | Atlas de Distribución de Renta de los Hogares |
| `ine_dirce` | Instituto Nacional de Estadística | Explotación estadística del DIRCE |
| `ine_censo_agrario` | Instituto Nacional de Estadística | Censo Agrario 2020 |

### 2.2 Nuevos `indicators` (slugs = `indicator_definitions`, grupo `economia`)

Renta/declaraciones (AEAT, € y nº): `irpf_declaraciones`, `irpf_renta_bruta_media`, `irpf_renta_disponible_media`.
Renta ADRH (€/habitante-hogar): `renta_neta_media_persona`, `renta_neta_media_hogar`, `renta_bruta_media_persona`.
Desigualdad ADRH (serie 2015-2023): `gini`, `p80_p20`.
Empresas DIRCE (nº): `empresas_total`, `empresas_industria`, `empresas_construccion`, `empresas_servicios` (+ `empresas_comercio_hosteleria` si el desglose lo permite).
Agrario 2020 (ha + nº): `agr_sau_total`, `agr_tierra_arable`, `agr_cultivos_lenosos`, `agr_pastos`, `agr_huertos`, `agr_explotaciones`.
Ganadería 2020 (nº explotaciones + cabezas): `gan_bovino_exp`, `gan_bovino_cab`, `gan_ovino_caprino_exp`, `gan_ovino_caprino_cab`, `gan_porcino_exp`, `gan_porcino_cab`, `gan_aves_exp`, `gan_aves_cab`.

### 2.3 Nuevas `dimensiones` (objetos deduplicados)

`{ ambito: municipio|provincia|ccaa|espana, nombre? }` (reutilizada) + especificadores por bloque:
renta: `{ ambito, tipo_renta: bruta|disponible|neta }`; desigualdad: `{ ambito }`; empresas: `{ ambito, sector: total|industria|construccion|servicios }`; agrario: `{ categoria: sau_total|arable|lenosos|pastos|huertos }`; ganadería: `{ especie: bovino|ovino_caprino|porcino|aves, medida: explotaciones|cabezas }`.

### 2.4 Ejemplo de tuplas económicas

```json
"indicators": [
  { "slug": "population_total", "nombre": "Población total", "unidad": "personas" },
  { "slug": "irpf_renta_bruta_media", "nombre": "Renta bruta media por declaración", "unidad": "euros" },
  { "slug": "gini", "nombre": "Índice de Gini", "unidad": "puntos" }
],
"sources": [
  { "slug": "ine_tempus3", "organismo": "Instituto Nacional de Estadística", "nombre": "API JSON Tempus3" },
  { "slug": "aeat_edm", "organismo": "Agencia Estatal de Administración Tributaria", "nombre": "Estadística de declarantes del IRPF por municipios" },
  { "slug": "ine_adrh", "organismo": "Instituto Nacional de Estadística", "nombre": "Atlas de Distribución de Renta de los Hogares" }
],
"valores": [
  [0, 2025, 689423, "personas", 0, 0, "2895", "DPOPxxx", "validado"],
  [1, 2023, 28540, "euros", 1, 1, "EDM2023", null, "validado"],
  [2, 2023, 31.1, "puntos", 0, 2, "37683", "ADRHxxx", "validado"]
]
```

## 3. Compatibilidad

- **Corrección obligatoria** en `expandV2Envelope`: resolver la fuente por el índice de cada tupla (`env.sources[t[0…]]` → posición 5 es url; la fuente no viaja en la tupla en v2 actual). Limitación real del formato: la tupla no lleva índice de fuente; con 1 fuente es irrelevante, con N fuentes hay que añadirlo. Opciones: (a) añadir 10ª posición `srcIdx` (rompe "9 posiciones"); (b) derivar la fuente de `tableId`/URL. Decisión: **(b)** — tabla de correspondencia `tableId → source.slug` en el lector (DPOP/2853/33570/4721/53688 → `ine_tempus3`; `EDM*` → `aeat_edm`; ADRH municipales → `ine_adrh`; agrarias → `ine_censo_agrario`), con fallback a `sources[0]`. Así los JSON existentes se leen igual y los nuevos llevan trazabilidad correcta sin romper la tupla. Documentado como deuda controlada; si en el futuro no basta, `version: 3` con lector 2+3.
- `generado_en` se actualiza en cada sync económico; `obtenido_en` por fila = `generado_en` (igual que hoy).

## 4. Compactación y estrategia de actualización parcial

- El sync económico lee el envelope existente (SDK o URL pública según contexto), expande, **elimina solo tuplas de slugs económicos**, añade las nuevas validadas, re-compacta con `toV2Envelope`, mide `JSON.stringify().length` (tope ~150 KB adicionales vs. tamaño previo) y escribe idempotente.
- Demografía: ni se toca ni se revalida (sus slugs quedan fuera del reemplazo). Si una fuente económica falla: se conservan valores previos + run `partial`/`error`.
- Solo `estado: "validado"` persiste; ND/secreto no se persisten como filas (el perfil los infiere como ausencia → estado pendiente), salvo que el volumen lo exija explícitamente.

## 5. Tamaños medidos (objetivo, a confirmar en syncs de prueba autorizados)

Demografía actual: ~55 KB/municipio (Sevilla, 95 filas). Estimación economía: AEAT 3 ind. × ~10 años + comparativas ≈ 60 tuplas; ADRH renta 3 × 9 + Gini/P80P20 2 × 9 ≈ 45; DIRCE 5 × 14 ≈ 70; agrario+ganadería ~20 (año único). Total ≈ 200 tuplas ≈ 25-60 KB adicionales (tupla ≈ 150-300 B + catálogos). Muy por debajo del tope. Medición real obligatoria antes de cualquier carga más amplia (ver `socideas-phase-2b-performance.md`).
