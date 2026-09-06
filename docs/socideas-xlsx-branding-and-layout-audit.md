# SOCideas — Auditoría de branding y layout del XLSX

Fecha: 2026-09-06 · Rama: `feat/urbideas-premium-editorial-ui` (base `465c6eb`)
Hallazgo confirmado sobre `SOCideas_Lamason_39034_tablas-2.xlsx`: el libro tiene
estructura (00/01/02, título, autofilter, freeze) pero NO es formato Ideas.

## 1. Generación actual

| Pieza | Estado |
|---|---|
| Endpoint | `GET /api/socideas/exportar/[codigoINE]` (lectura, idempotente, sin escrituras) |
| Librería | `exceljs@4.4.0` (MIT, server-only, ausente en bundle cliente) |
| Construcción | `src/lib/socideas-xlsx.ts` sobre `ExportTable[]` de `socideas-export.ts` |
| Hojas | `00_Resumen` + `01_Demografía`/`02_Economía` (con mensaje si vacías); 03 solo con datos |
| Título | Banda mineral + marca `Ideas Sostenibilidad · SOCideas` |
| Encabezado | Fondo + texto blanco + borde inferior de acento |
| Freeze panes | Bajo primera cabecera por hoja |
| Autofilter | Primera tabla por hoja (límite de una por hoja en Excel) |
| Formatos | Miles, `€`, `%`, índice, año; ND como texto; 0 suprimidos no exportados |
| Anchos | `fitColumns`: `min 14 / max 46` universal por contenido |

## 2. Incumplimientos verificados

1. **Color principal `#1E4D3F` en vez de `#3E665C`** (títulos, tabColor, cabeceras).
   El acento `#86B73D` no aparece en el libro.
2. **Columna A con ancho fijo `46`** (`fitColumns` + override de trazabilidad);
   resto de columnas con mínimo 14 genérico: aspecto técnico desproporcionado.
3. Sin límites por rol (año de 40 caracteres posible; “Municipio” sin tope).
4. `wrapText` solo en primera columna (fuente/observación sin wrap).
5. Columna `Estado` alineada a derecha (debe ir centrada).
6. Metadatos sin fondo `#F1F1F1`.

## 3. Cambio mínimo

- Constantes: `MINERAL='FF3E665C'`, `ACCENT='FF86B73D'`, `PAPER='FFF1F1F1'`,
  `ALT='FFEDF3EF'`; borde inferior de acento en cabeceras y bandas de título.
- `columnLimitsFor(header, isFirst)`: descriptiva 18–34, año 9–12, número 12–16,
  euro 14–18, porcentaje 12–14, estado 14–22, fuente 20–32, observación 24–48.
- `wrapText` en descriptiva/fuente/observación; nowrap en año/códigos/cifras/%.
- Alineación: texto izquierda, año centro, números/euros/% derecha, estado centro.
- 00: metadatos sobre `PAPER`, trazabilidad con alternas `ALT`, mismas 8 columnas.
- Tipografía: Calibri como fallback explícito (Poppins no garantizada en Excel);
  sin radios, sin imágenes, sin macros, sin fórmulas.

## 4. Pruebas que demostrarán el cumplimiento

`scripts/verify-export-endpoint.ts` ampliado (3 municipios reales por HTTP):
título `#3E665C`, acento `#86B73D` en cabeceras, ausencia de `#1E4D3F`,
anchos dentro de límites por rol, alineación por rol, freeze, autofilter,
cero ceros indebidos, sin secretos. Archivos solo en `tmp/` (ignorado).
