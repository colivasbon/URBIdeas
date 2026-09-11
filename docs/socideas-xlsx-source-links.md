# SOCideas — Fuentes oficiales enlazadas en el XLSX municipal

Fecha: 2026-09-11 · Rama: `feat/urbideas-premium-editorial-ui`
Tarea: añadir en cada bloque del libro XLSX una línea de procedencia y un enlace
clicable y uniforme a la ficha pública oficial de la fuente estadística.

## 1. Decisión de implementación

- Celda normal con hipervínculo externo real (propiedad `hyperlink` de ExcelJS),
  sin botones nativos, sin ActiveX, sin macros ni VBA.
- Texto visible obligatorio: `Ver ficha oficial ↗`. Variante admitida solo si el
  símbolo no se renderiza: `Ver ficha oficial`.
- Sin hojas nuevas, sin `mergeCells`, sin autofilter, sin freeze panes, sin
  enlaces internos y sin columnas técnicas de trazabilidad.
- El libro conserva EXACTAMENTE tres hojas: `00_Resumen`, `01_Demografía`,
  `02_Economía`.
- La procedencia y el enlace viven en la fila de fuente (una fila debajo del
  título), en la ÚLTIMA columna real del bloque.
- Los anchos se calculan solo con los datos: ni la línea de fuente ni el enlace
  participan en el cálculo, por lo que no deforman ninguna columna.

## 2. Registro central de fuentes

`src/lib/socideas-source-registry.ts` concentra el tipo `SourceReference`, el
allowlist de dominios y la construcción de URLs públicas (ficha `jaxiT3` de INE,
publicación AEAT). Ninguna URL se hardcodea en componentes ni en bloques sueltos
del generador.

Allowlist de dominios autorizados:

```text
www.ine.es
ine.es
www.agenciatributaria.es
sede.agenciatributaria.gob.es
```

El validador rechaza `localhost`, `127.0.0.1`, `0.0.0.0`,
`r2.cloudflarestorage.com`, `cloudflare.com`, `supabase.co`, `vercel.app`,
`github.com`, URLs sin `https` y cualquier dominio fuera del allowlist.

## 3. Tabla de bloques y enlaces

| Bloque XLSX | Fuente visible | Operación | Tabla/serie | Período | Texto del enlace | Dominio | URL pública |
|---|---|---|---|---|---|---|---|
| Población por sexo | Instituto Nacional de Estadística | Cifras oficiales de población (Padrón municipal) | `source_table_id` provincial (p. ej. 2855 Albacete) | Año de referencia | Ver ficha oficial ↗ | www.ine.es | `https://www.ine.es/jaxiT3/Tabla.htm?t=<id>` |
| Evolución anual de la población | Instituto Nacional de Estadística | Cifras oficiales de población (Padrón municipal) | `source_table_id` provincial | Serie anual | Ver ficha oficial ↗ | www.ine.es | `https://www.ine.es/jaxiT3/Tabla.htm?t=<id>` |
| Estructura por edad y sexo | Instituto Nacional de Estadística | Padrón Continuo (estructura por edad y sexo) | 33570 | Año de la pirámide | Ver ficha oficial ↗ | www.ine.es | `https://www.ine.es/jaxiT3/Tabla.htm?t=33570` |
| Comparativa: Provincia | Instituto Nacional de Estadística | Cifras oficiales de población (Padrón municipal) | `source_table_id` provincial | Serie anual | Ver ficha oficial ↗ | www.ine.es | `https://www.ine.es/jaxiT3/Tabla.htm?t=<id>` |
| Comparativa: CCAA | Instituto Nacional de Estadística | Cifras oficiales de población (Padrón municipal) | 2853 | Serie anual | Ver ficha oficial ↗ | www.ine.es | `https://www.ine.es/jaxiT3/Tabla.htm?t=2853` |
| Comparativa: España | Instituto Nacional de Estadística | Cifras oficiales de población (Padrón municipal) | 2853 | Serie anual | Ver ficha oficial ↗ | www.ine.es | `https://www.ine.es/jaxiT3/Tabla.htm?t=2853` |
| Indicadores demográficos | Instituto Nacional de Estadística | Cifras oficiales de población · Cálculo SOCideas sobre datos oficiales | `source_table_id` base | Año de referencia | Ver ficha oficial ↗ | www.ine.es | `https://www.ine.es/jaxiT3/Tabla.htm?t=<id>` |
| Nacionalidad | Instituto Nacional de Estadística | Censo anual de población | 68535 | Período publicado | Ver ficha oficial ↗ | www.ine.es | `https://www.ine.es/jaxiT3/Tabla.htm?t=68535` |
| Lugar de nacimiento | Instituto Nacional de Estadística | Censo anual de población | 66322 | Período publicado | Ver ficha oficial ↗ | www.ine.es | `https://www.ine.es/jaxiT3/Tabla.htm?t=66322` |
| Arraigo territorial | Instituto Nacional de Estadística | Censo anual de población | 68540 | Período publicado | Ver ficha oficial ↗ | www.ine.es | `https://www.ine.es/jaxiT3/Tabla.htm?t=68540` |
| Renta anual | Agencia Estatal de Administración Tributaria | Estadística de los declarantes del IRPF por municipios (EDM); columnas ADRH diferenciadas | EDM + INE ADRH | Serie anual | Ver ficha oficial ↗ | sede.agenciatributaria.gob.es | `https://sede.agenciatributaria.gob.es/Sede/datosabiertos/catalogo/hacienda/Estadistica_de_los_declarantes_del_IRPF_por_municipios.shtml` |
| Índice de Gini | Instituto Nacional de Estadística | Atlas de Distribución de Renta de los Hogares (ADRH) | 37683 | Serie anual | Ver ficha oficial ↗ | www.ine.es | `https://www.ine.es/jaxiT3/Tabla.htm?t=37683` |
| Ratio P80/P20 | Instituto Nacional de Estadística | Atlas de Distribución de Renta de los Hogares (ADRH) | 37683 | Serie anual | Ver ficha oficial ↗ | www.ine.es | `https://www.ine.es/jaxiT3/Tabla.htm?t=37683` |
| Tejido empresarial | Instituto Nacional de Estadística | Directorio Central de Empresas (DIRCE) | 4721 | Año de referencia | Ver ficha oficial ↗ | www.ine.es | `https://www.ine.es/jaxiT3/Tabla.htm?t=4721` |
| Estructura agraria | Instituto Nacional de Estadística | Censo Agrario 2020 (resultados municipales) | 29006 | 2020 (estructural) | Ver ficha oficial ↗ | www.ine.es | `https://www.ine.es/jaxiT3/Tabla.htm?t=29006` |
| Ganadería | Instituto Nacional de Estadística | Censo Agrario 2020 (resultados municipales) | 29006 | 2020 (estructural) | Ver ficha oficial ↗ | www.ine.es | `https://www.ine.es/jaxiT3/Tabla.htm?t=29006` |

Notas de atribución:

- Los identificadores de las tablas provinciales del Padrón (`source_table_id`)
  proceden del propio indicador ya sincronizado; si no existiese, el bloque
  muestra solo la línea de fuente, sin falso botón (caso documentado en el
  validador como `missingLink`).
- Los indicadores derivados no declaran a SOCideas como productor: se conserva
  `Cálculo SOCideas sobre datos oficiales` y el enlace apunta a la fuente base.
- La tabla de renta mezcla AEAT (por declaración) y ADRH (por persona/hogar); la
  diferencia queda explícita en la línea de estado y se enlaza la publicación
  principal (AEAT EDM).
- No se enlazan endpoints JSON, CSV masivos, R2, GitHub ni dominios internos.

## 4. Estilo del enlace

Fuente Calibri 10, negrita, subrayado, color `#3E665C`, relleno `#F1F1F1`,
borde fino `#86B73D`, alineación derecha y sin ajuste de texto. Es un enlace
editorial discreto, no un CTA.

## 5. Validación

`scripts/verify-xlsx-source-links.ts` construye el libro para los cuatro
municipios de prueba (`02003`, `07010`, `02069`, `28143`) con datos sintéticos y
lo relee con ExcelJS. Comprueba, entre otras reglas:

- Exactamente las tres hojas esperadas y sin hojas adicionales.
- Cada bloque con fuente atribuible tiene enlace, texto visible, URL `https` y
  dominio autorizado.
- Nacionalidad → 68535, Lugar de nacimiento → 66322, Arraigo → 68540.
- Sin URL técnica visible, sin CSV masivo, sin R2/Supabase/Vercel/Cloudflare.
- Enlace dentro del rango real, sin fill verde sobrante, sin columnas extra.
- Anchos intactos: además de los topes, se compara con un libro de control sin
  fuentes y se exige anchura idéntica.
- Sin filtros, freeze, merges, enlaces internos, macros, ActiveX ni VBA.
- Supresiones como `ND` (nunca `0`, salvo conteos reales de pirámide) y
  alineaciones por rol intactas.

Ejecución: `npx tsx scripts/verify-xlsx-source-links.ts` (exit 1 si algo falla).

## 6. Garantías

Cero escrituras R2. Cero escrituras Supabase. Cero migraciones. Cero cambios de
datos municipales. Cero cambios de UI web, filtros, gráficos ni mapas. Cero
cambios de arquitectura de lectura R2 (se reutiliza el adaptador lateral ya
existente de la ficha). Cero purga de Cloudflare. Cero cambios Vercel.
