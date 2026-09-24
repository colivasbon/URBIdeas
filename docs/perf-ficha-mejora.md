# Rendimiento de la ficha SOCideas — reducción de payload SSR

Fecha: 2026-09-24 · Rama: `feat/perf-ficha` · HEAD de partida: `2b79ffe`.

## Diagnóstico (medido, no estimado)

La ficha `/socideas/[codigoINE]` es `force-dynamic`. El HTML SSR incluye el
flight RSC de Next; el Client Component `FichaFiltros` recibía
`initial={perfil}` con el **perfil demográfico completo**:

| Pieza | Problema |
|---|---|
| `perfil.valores` | Todas las filas del envelope v2 expandidas: demografía **+ economía + laboral + electoral** (~1139 filas en Madrid), con campos muertos por fila (`fecha_referencia`, `estado_validacion`, `valor_texto`, ids, unidad, fuente completa). |
| Series precalculadas | `evolucion`, `comparativas`, `piramide`, `derivados`, `densidad`, `total`/`hombres`/`mujeres` se serializaban **además** de `valores`, aunque `derivarPerfil` las recalcula en el cliente. |
| `ineLayers` | Capas educación y agrario viajaban a la hoja de Demografía, que solo usa flujos y saldos. |
| Otras hojas | `?hoja=economia\|politico\|sociocultural` ya no serializan el perfil demográfico completo (medido: ~70–210 KB). |

El envelope R2 de Madrid es solo **~75 KB**; el coste estaba en la expansión
y la serialización al navegador, no en R2.

## Optimización elegida

**Selección de datos por hoja + recorte del DTO de cliente** (mayor beneficio
con riesgo controlado: sin rediseño, sin cambiar contratos R2/API/XLSX):

1. `src/lib/socideas-ficha-initial.ts` → `toFichaInitial(perfil)`:
   - `valores` solo con slugs que lee la ficha cliente:
     `population_total|male|female|evolution|age_sex`, `area_km2`.
   - Filas slim: sin campos muertos; la pirámide (`age_sex`, ~840 filas)
     viaja solo con año/valor/dimensiones (trazabilidad la cubren las filas
     de población/evolución con procedencia).
   - Series precalculadas vacías: el cliente las deriva en `derivarPerfil`
     (también durante el SSR del Client Component).
   - `disponibles.ultimo_por_indicador` vacío (la ficha no lo lee).
2. `slimIneLayersForDemografia`: a la hoja Demografía solo
   `migration` + `migrationBalance`.
3. El Server Component sigue usando el **perfil completo** para toolbar
   (conteo de tablas), EmptyState, hoja político y exportaciones/XLSX.

No se tocó: `force-dynamic`, contratos R2, API `/api/socideas/perfil`,
rutas de descarga, apariencia, accesibilidad ni lógica de filtros.

## Números antes / después

### Local (`next build` + `next start` :3111) — misma máquina, mismo código base

| Ruta | HTML antes | HTML después | Δ HTML | Flight después | Contenido SSR |
|---|---:|---:|---:|---:|---|
| `/socideas/28079` Madrid | 875 932 | **355 515** | **−59,4 %** | 239 959 | OK (población 3 506 730, evolución, pirámide, trazabilidad) |
| `/socideas/01059` rural | 817 978 | **362 200** | **−55,7 %** | 239 376 | OK |
| `/socideas/48020` Bilbao (foral) | 865 061 | **362 574** | **−58,1 %** | 239 917 | OK |
| `/socideas/35016` Las Palmas | 870 786 | **363 463** | **−58,3 %** | 240 035 | OK |
| `/socideas/51001` Ceuta | 59 646 | 59 646 | 0 (sin serie) | 31 198 | EmptyState honesto |
| `/socideas/52001` Melilla | 59 678* | 59 678 | 0 (sin serie) | 31 214 | EmptyState honesto |
| `?hoja=economia` Madrid | ~227 650† | 210 149 | −7,7 % | 114 984 | OK |
| `?hoja=politico` | ~72 493† | 70 846 | −2,3 % | 37 989 | OK |
| `?hoja=sociocultural` | ~68 031† | 61 747 | −9,4 % | 32 601 | OK |

\*Melilla/Ceuta: envelope sin serie demográfica → mismo EmptyState que en
producción (no es regresión; verificado en prod 52001 = 61 325 B, sin
“Población total”).
†Comparación parcial con producción (otro entorno); las tres hojas no
demográficas no llevaban el perfil completo.

### Producción (baseline de referencia, antes del deploy)

| Ruta | HTML antes | Δ vs después local‡ |
|---|---:|---:|
| Madrid 28079 | 893 169 | **−60,2 %** |
| 01059 | 835 164 | **−56,6 %** |
| 48020 | 882 217 | **−58,9 %** |
| 51001 Ceuta | 61 291 | ~igual (vacío) |
| 35016 | 888 009 | **−59,2 %** |

‡Mismo orden de magnitud; la cifra canónica es la comparación local/local.

### Desglose del flight (Madrid)

| Métrica | Antes | Después |
|---|---:|---:|
| Span `"valores":` en flight | ~589 807 B | ~193 611 B |
| Presencia de `fecha_referencia` / `estado_validacion` en flight | sí | no |
| Slugs de economía (`gini`, `renta_*`) en flight de demografía | sí | no |
| TTFB local muestra | 10–205 ms | 9–269 ms |
| Total local muestra | 0,8–1,6 s | 0,5–1,4 s |

## QA

- `npx tsc --noEmit` → 0 errores.
- `npx eslint` sobre ficheros tocados → sin errores nuevos
  (`socideas-ficha-initial.ts`, `page.tsx` de la ficha).
  El repo ya tenía avisos/errores preexistentes en otros módulos
  (p. ej. `ThemeProvider`) sin relación con este cambio.
- `npx next build` → OK (rutas dinámicas intactas).
- SSR local 200 + contenido en Madrid, 01059, 48020, 35016:
  población, H/M, evolución, pirámide, densidad, derivados,
  trazabilidad, cobertura, descarga.
- `npx tsx scripts/qa-cobertura-muestra.ts --base http://127.0.0.1:3111`
  → **PASS** en la muestra (forales Pamplona/Bilbao, Ceuta, Melilla,
  bloqueo AEAT, sin ceros falsos; XLSX OK).
- Ceuta y Melilla: EmptyState sin serie (igual que producción).

## Cómo repetir la medición

```bash
npx next build && npx next start -p 3111
# scripts temporales tmp-measure-after.js / tmp-flight-after.js (no versionados)
```

## Riesgos y no-hechos

- No se implementó cache/`revalidate` de la página (freshness de INE).
- No se fragmentó la ficha en Suspense boundaries (cambio de UX mayor).
- Economía (`EconomiaFicha`) podría recibir un DTO análogo en una pasada
  futura: ya filtra `ECONOMY_SLUGS` pero aún serializa filas completas.
