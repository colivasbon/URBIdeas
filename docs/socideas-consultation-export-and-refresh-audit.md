# SOCideas — Auditoría de consulta, descargas y actualización

Fecha: 2026-09-06 · Rama: `feat/urbideas-premium-editorial-ui`
Alcance: ficha municipal (`/socideas/[codigoINE]`), categorías Demografía y Economía,
secciones censales bajo demanda, sincronizadores, endpoints y dependencias de exportación.
Arquitectura vigente (NO se modifica sin autorización): documentos municipales
estructurados (envelope R2 v2) como fuente principal de ficha, catálogo territorial y
trazabilidad en Supabase, carga optimizada con `unstable_cache` + `React.cache`,
filtros locales tras cargar la ficha, secciones censales solo bajo interacción
explícita, una categoría activa a la vez (`src/app/socideas/[codigoINE]/page.tsx`).

Documentos de referencia del usuario (Plan de Comunicación y RSC con metodología de
Línea Base Social; hoja sociodemográfica de La Roda; hoja de línea base de
Villarrobledo): se usan SOLO como inspiración de producto (familias de indicadores,
herramientas de consulta, lenguaje metodológico, estructura de descargas, mapa de
cobertura futura). NO se importa ningún dato, valor, conclusión de impacto,
contacto ni texto de proyecto a la cobertura nacional. Ver §6 y entrega §9.

---

## 1. Inventario de datos reales

Convenciones: `valor` = `valor_numerico !== null` en el envelope expandido y
`estado_validacion = 'validado'` (filtros en `socideas-perfil.ts:149` y
`socideas-economia.ts:62`). `disponible` = slug con ≥1 fila con valor en el
municipio. Nivel territorial = `dimensiones.ambito` (`municipio|provincia|ccaa|espana`).
Trazabilidad por fila: `source.organismo + source.nombre + source_table_id +
anio_referencia + source_url + obtenido_en`.

### 1.1 Demografía (`src/lib/socideas-perfil.ts`, slugs Fase 2A en `socideas.ts:138`)

| Slug | Renderizado hoy | En envelope | Con valor (si sync ok) | Fuente | Periodo | Nivel | Tabla/componente actual | Exportable seguro | Comparable sin mezclar años |
|---|---|---|---|---|---|---|---|---|---|
| `population_total` (municipio) | Sí — KPIs + tabla año + serie | Sí | Sí | INE Tempus3 (DPOP provincial) | Serie anual completa almacenada; último ≈2025 | municipio | `FichaFiltros.tsx` Bloque 1 + Bloque 2 | Sí | Sí (serie homogénea DPOP) |
| `population_male` / `population_female` | Sí — KPIs + tabla año + modo comparar | Sí | Sí | INE Tempus3 DPOP | Mismo año que total | municipio | `FichaFiltros.tsx` Bloque 1, `SexoBarras` | Sí | Sí |
| `population_evolution` | Sí — gráfico + tabla anual por ámbito | Sí | Sí | INE Tempus3 DPOP | Serie anual | municipio | `FichaFiltros.tsx` Bloque 2, `EvolutionChart` | Sí | Sí (misma operación) |
| `population_total` (provincia/ccaa/espana) | Sí — series + columnas tabla | Sí (filas con `ambito` ≠ municipio) | Sí | INE Tempus3 (DPOP + tabla CCAA 70) | Municipio/provincia → ≈2025; CCAA/España → 2021 (rezago documentado en UI) | provincia, ccaa, espana | `FichaFiltros.tsx` Bloque 2, `tablaComparada` | Sí, etiquetando ámbito y año | Solo con aviso de rezago; NO presentar como contemporáneas sin indicarlo |
| `population_age_sex` | Sí — pirámide + tabla grupos + envejecimiento/dependencia | Sí (2 filas por tramo: H/M) | Sí | INE tabla 33570 | Año pirámide elegido (último completo) | municipio | `FichaFiltros.tsx` Bloque 3, `PyramidChart` | Sí | Sí dentro del mismo año |
| `population_change_5y` / `population_change_10y` | Sí — 2 StatCards “Variaciones del período” | Sí (calculado en sync, `socideas-sync.ts:322`) | Sí si existe base hace 5/10 años; si no, `null` → “No disponible” (correcto, no 0) | Cálculo propio sobre serie oficial (derivado explícito) | Año referencia vs base | municipio | `FichaFiltros.tsx` Bloque 5 | Sí (con definición) | Sí (misma serie) |
| `population_density` | Parcial — texto “Pendiente de integración de fuente de superficie” (`FichaFiltros.tsx:443`) | No (sync añade pendiente fija, `socideas-sync.ts:408`) | Nulo siempre | Sin fuente validada | — | — | Bloque 4 “Densidad y lectura territorial” | No | No |
| Extranjería / saldo migratorio / natalidad / mortalidad / educación / lugar nacimiento | No | No | Nulo / sin cobertura | Sin cobertura municipal verificada en Tempus3 (pendiente fija `socideas-perfil.ts`/`FichaFiltros.tsx:583`) | — | — | Solo mención en `Traceability pendientes` | No | No |
| Provisionales demográficos | No existen | No | — | Ninguna fuente provisional configurada | — | — | — | No | No |
| Consolidados demográficos | Todos los anteriores con valor | Sí | `estado_validacion='validado'` | INE | Según operación | municipio + comparativas | Todos los bloques | Sí | Ver columna |

### 1.2 Economía (`src/lib/socideas-economia.ts`, 32 slugs en `socideas.ts:151`)

| Slug(s) | Renderizado hoy | En envelope (si sync batch1 ok) | Con valor | Fuente | Periodo | Nivel | Tabla/componente actual | Exportable seguro | Comparable sin mezclar años |
|---|---|---|---|---|---|---|---|---|---|
| `irpf_declaraciones`, `irpf_renta_bruta_media`, `irpf_renta_disponible_media` | Sí — 3 StatCards + columnas tabla renta | Solo si operador aportó `aeatBaseUrl + aeatEjercicio` (`socideas-sync-economia.ts:295`) | Sí cuando se aporta fichero; si no, pendiente | AEAT EDM | Ejercicio aportado (p. ej. 2023) | municipio | `EconomiaFicha.tsx` Renta + `RentaTable` | Sí (etiquetar “por declaración”, NO por habitante) | Solo mismo ejercicio; NO mezclar con ADRH |
| `renta_neta_media_persona/hogar`, `renta_bruta_media_persona/hogar` | Sí — 4 StatCards + columnas tabla | Sí (ADRH CSV municipal) | Sí | INE ADRH (jaxiT3) + comparativas Tempus3 53688 | 2023, serie 2015–2023 | municipio (+ comparativas gini/p80) | `EconomiaFicha.tsx` Renta | Sí | Sí dentro de ADRH; NO con AEAT |
| `gini`, `p80_p20` | Sí — 2 StatCards + 2 gráficos evolución | Sí (+ comparativas provincia/ccaa/espana) | Sí si municipio ≥100 residentes; si no, secreto → ausencia | INE ADRH | 2015–2023 | municipio (+ comparativas) | `EconomiaFicha.tsx` Desigualdad | Sí | Sí dentro de ADRH |
| `empresas_total`, `empresas_industria/construccion/servicios/comercio_hosteleria` | Sí — 2 StatCards + barras + nota | Sí (DIRCE Tempus3 4721) | Total sí; desglose según tamaño municipal (puede faltar → ND) | INE DIRCE | 2025 ref. 1 de enero | municipio | `EconomiaFicha.tsx` Tejido empresarial, `Barras` | Sí (servicios/comercio con partición documentada) | Solo mismo año; empresas ≠ ocupados |
| `agr_sau_total`, `agr_tierra_arable`, `agr_cultivos_lenosos`, `agr_pastos`, `agr_huertos`, `agr_explotaciones` | Sí — 2 StatCards + barras | Sí (Censo Agrario Tempus3; detalle CSV fuera batch1) | Sí, con secreto (“ND”) en celdas | INE Censo Agrario 2020 | 2020 estructural (NO anual) | municipio | `EconomiaFicha.tsx` Estructura agraria | Sí, etiquetando “Estructural · 2020” | NO comparar con series anuales |
| `gan_*` (9 slugs) + `gan_ug_total` | Sí — tabla especies + UG total condicional | Sí (parcial batch1: 3 filas Tempus) | Parcial; celdas ND por secreto | INE Censo Agrario 2020 | 2020 estructural | municipio | `EconomiaFicha.tsx` Ganadería | Sí (con ND explícito) | No como serie |
| `paro_registrado` (`sepe`) | No — pendiente fijo | No (batch1 dry-run: stub devuelve `[]`, `sepe-paro.ts`; pendiente `sync-economia:423`) | Nulo | SEPE (libro mensual ~4 MB) | — | municipio | `StatusCard pending` “Empleo y desempleo” | No | No |
| `afiliacion_total` (`tgss`) | No — pendiente fijo | No (stub `[]`; pendiente `sync-economia:438`, regla “<5”→null+flag) | Nulo | TGSS Muni072026 ~510 KB | — | municipio | `StatusCard pending` “Afiliación” | No | No |
| Presupuesto / liquidación / ayudas / suelo industrial / IPC municipal | No — pendientes fijos | No | Nulo / sin cobertura | Sin fuente nacional homogénea verificada | — | — | `StatusCard pending` | No | No |
| Provisionales economía | No existen | No | — | `sync-economia route:64` → `provisional:false, motivo:'No hay fuente provisional configurada…'` | — | — | Botón actual devuelve motivo explícito | No | No |
| Consolidados economía | Todos los con valor listados arriba | Sí | `validado` | AEAT/INE según bloque | Según bloque (2020/2023/2025) | municipio | Secciones con `state !== pending` | Sí | Solo intra-fuente y mismo año |

### 1.3 Secciones censales

Geometría oficial bajo demanda (`/socideas/[codigoINE]/secciones-censales`, `SeccionesMap.tsx`);
indicadores por sección solo con fuente a ese nivel (hoy: ninguna cargada en ficha).
Exportable solo si existe tabla ya cargada y el usuario la solicita (hoy: no hay tabla
de indicadores por sección → NO exportar).

---

## 2. Diagnóstico visual actual

### Qué cards KPI muestran `—`

- `EconomiaFicha.tsx:223-231`: StatCards de renta usan `fmt(null) = "—"` → p. ej.
  `Renta bruta media por declaración: "— €"` con detalle `fuenteDe(null) = ""`. Card
  vacía entre cards con datos cuando AEAT no aportado.
- `EconomiaFicha.tsx:251-252`: Gini / P80-P20 muestran `"—"` si valor nulo.
- `EconomiaFicha.tsx:285-286`: `Total de empresas: "—"`, `Año de referencia: "—"` si DIRCE sin cobertura.
- `EconomiaFicha.tsx:204`: cabecera usa `${b.ultimoAnio ?? "—"}` dentro del valor del KPI.
- `FichaFiltros.tsx:85` (`fmt`), tablas evolución/comparada y `tabla-actual` muestran
  `"—"` por celda (aceptable en tabla, NO en KPI principal).
- `FichaFiltros.tsx:421-464`: derivados muestran texto largo “No disponible para el
  período seleccionado” como `valor` del StatCard (rompe jerarquía del KPI).

### Qué cards KPI muestran “Pendiente”

- `EconomiaFicha.tsx:197-213` — “Visión general”: 5 `StatCard` por bloque
  (`Renta, Desigualdad, Tejido empresarial, Estructura agraria, Ganadería`) con
  `valor = "Pendiente"` y `detalle = "Sin cobertura verificada"` cuando
  `state === "pending"`. Resultado actual: `4 reales | 2 reales | 5 reales |
  Pendiente | Pendiente` — mezcla estados en la zona noble de la ficha. Este es el
  problema prioritario de la tarea.
- Bloque “Indicadores pendientes” (`EconomiaFicha.tsx:375-384`): 5 `StatusCard`
  pending (correcto como contenido, pero debe vivir al final como cobertura, no como KPIs).
- `FichaFiltros.tsx:446-449`: densidad muestra texto de pendiente como valor de bloque.

### Qué mezcla estados de disponibilidad

- Visión general de Economía mezcla `ok/partial/pending` en una sola cuadrícula de 5.
- Renta mezcla AEAT (por declaración, ejercicio aportado) con ADRH (por persona/hogar,
  2023) sin ordenar por disponibilidad: si AEAT falta, sus 3 cards con “— €” aparecen
  antes que valores ADRH reales.
- Tablas (`RentaTable`, ganadería) muestran columnas/celdas con “—”/“ND” junto a datos
  sin explicar alcance; `RentaTable` incluye 6 columnas aunque alguna esté totalmente vacía.
- Demografía mezcla años sin fricción: `vista` avisa del rezago CCAA/España→2021 vs
  municipio→2025 (`FichaFiltros.tsx:352-357`), pero la tabla comparada los alinea por
  fila como si fueran contemporáneos.

### Qué datos existentes aparecen demasiado abajo

- Valores ADRH reales (renta neta persona/hogar) están debajo de cards AEAT vacías.
- Gini/P80-P20 con serie 2015–2023 aparecen tras la tabla de renta aunque sean los
  indicadores de desigualdad más útiles.
- En Demografía, variaciones 5y/10y y envejecimiento/dependencia (derivados con
  definición explícita) están al final, tras pirámide y densidad pendiente.

### Qué tablas aparecen antes de explicar la información disponible

- `RentaTable` y tabla de ganadería se renderizan sin encabezado de fuente/periodo/
  acciones (título + copiar suelto); la explicación metodológica vive en notas al pie
  o en `Traceability` al final.
- La tabla anual por ámbito (Demografía) precede a cualquier resumen de cobertura y
  alinea años no comparables sin cabecera de aviso.

### Qué bloques se pueden reordenar sin tocar los datos

- Visión general → solo KPIs con valor (2–4), ordenados por utilidad analítica.
- Secciones con datos (Renta ADRH, Desigualdad, Empresas, Agrario/Ganadería si hay valor)
  en orden de prioridad del enunciado; secciones pending → panel final único.
- Tablas/series con datos antes del panel de límites; `Traceability` + pendientes al final.
- Demografía: Población actual → Evolución → Pirámide/composición → Derivados con
  definición → Densidad (si llega fuente) → Cobertura final. Sin tocar `socideas-perfil.ts`.

### Componentes responsables

- `src/components/socideas/EconomiaFicha.tsx` (visión general, orden, `fmt`, `fuenteDe`, `RentaTable`, `Barras`, pendientes).
- `src/components/socideas/FichaFiltros.tsx` (KPIs derivados, `fmt`, tablas, avisos rezago).
- `src/components/socideas/StatCard.tsx` (presentacional; no filtra vacíos — lo debe hacer el padre).
- `src/components/socideas/StatusCard.tsx`, `Traceability.tsx`, `CopyTableButton.tsx` (base correcta, a evolucionar).
- `src/components/socideas/CategoryTabs.tsx`, `src/components/platform/product-nav-config.ts` (sin enlaces de descargas contextuales).
- `src/lib/socideas.ts`, `socideas-perfil.ts`, `socideas-economia.ts` (datos; NO se tocan en esta tarea salvo tipos de disponibilidad en capa nueva).

---

## 3. Herramientas candidatas

| Herramienta | Veredicto | Alcance | Requisitos de datos | Notas |
|---|---|---|---|---|
| Selector de nivel territorial | Implementable ahora con datos ya disponibles | Demografía (evolución) y Economía (gini/p80 comparativas) | Filas con `ambito`≠municipio ya en envelope; solo mostrar niveles con puntos>0 y mismo periodo o con periodos etiquetados | No estimar nivel superior; si años difieren, mostrar ambos o desactivar |
| Comparador de períodos (último vs anterior, Δ abs y %) | Implementable ahora | Demografía (evolución) y Economía (series ADRH/gini/DIRCE anual cuando haya ≥2 puntos) | Serie con ≥2 periodos reales; anterior ≠0/nulo o “No comparable” | Indicar años exactos; NO para Censo 2020 (estructural, un punto) |
| Filtros de tablas (buscar, por año, mostrar/ocultar secundarias, restablecer) | Implementable ahora | Todas las tablas existentes | Datos ya cargados; filtros locales, sin R2/fetch nuevo; accesible teclado; persistencia URL solo si patrón compatible (Demografía ya usa URL) | No storage sensible |
| Vista de metodología `Ver definición y fuente` | Implementable ahora | Todos los bloques con fuente | Nombre, definición, fuente, periodo, cobertura, estado, limitación; sin tokens/URLs privadas/SQL/rutas | Panel desplegable o diálogo accesible con Escape |
| Copiar tabla (con encabezados + fuente y periodo) | Implementable ahora (mejora de `CopyTableButton`) | Todas las tablas | Tabla visible; copiar solo filas filtradas; confirmación discreta | Añadir pie de fuente+periodo al TSV/HTML |
| Enlace `Consultar fuente oficial` | Implementable ahora, condicional | Tablas con `source_url` pública http(s) | `source_url` válida y verificada; `target=_blank rel=noreferrer` | No adivinar URLs; ocultar si no existe |
| Herramientas de consulta (zona común bajo resumen) | Implementable ahora | Demografía y Economía | Componente común, sin duplicar lógica | Debajo del resumen, no por encima |
| Descargas CSV por tabla + informe HTML imprimible | Implementable ahora | Demografía y Economía | Tablas reales del envelope; UTF-8 BOM, `;`, nombres `SOCideas_Municipio_INE_Bloque_Tabla_Periodo.csv` | XLSX estilizado: NO en esta pasada (ver §4) |
| Libro Excel `.xlsx` estilizado corporativo | Requiere fuente o carga futura (dependencia server-only) | Demografía y Economía | Auditar `xlsx@0.18.5`: escribe valores pero NO estilos fiables de `.xlsx` (la edición Community no garantiza estilos de salida; requeriría `exceljs` u otra server-only con coste tamaño/licencia/mantenimiento y sin bundle cliente) | Decisión: CSV + HTML print ahora; documentar limitación; no disfrazar HTML como Excel |
| Hot update por bloque (dry-run) | Implementable ahora (solo dry-run) | Economía (endpoint con `dryRun`); Demografía (sin dry-run → solo planificado) | Sin tokens en cliente; autorización server-side `SOCIDEAS_SYNC_TOKEN`; escritura real deshabilitada | Ver §5 |
| Rankings nacionales, mapas de calor, comparativas entre municipios, predicciones/proyecciones, semáforos mejor/peor, descargas externas no verificadas, informes particulares, consultas masivas R2 | No implementar | — | Requerirían fuentes no cargadas o romperían caché/rendimiento | Explícitamente prohibidas en el enunciado |

---

## 4. Descargas

### Tablas y bloques realmente exportables

Demografía (todas de `PerfilDemografico.valores`, solo si tienen ≥1 fila real):
población año referencia (total/H/M + %), evolución municipal, comparativas por ámbito
etiquetadas, pirámide por grupos (abs + %), variaciones 5y/10y, envejecimiento/dependencia
(con definición). NO exportar: densidad (sin fuente), extranjería/migración/natalidad/
educación (sin cobertura), secciones censales (sin tabla cargada).

Economía (todas de `PerfilEconomico.valores`, solo si tienen ≥1 fila real):
renta ADRH (persona/hogar, bruta/neta), renta AEAT por declaración (solo si aportada,
etiquetada), desigualdad (gini, p80_p20 + series), empresas DIRCE (total + desglose
disponible), estructura agraria 2020, ganadería 2020 (con ND explícito). NO exportar:
paro/afiliación (pendientes SEPE/TGSS), presupuestos/ayudas/suelo/IPC (sin fuente),
hojas vacías ni tablas “Pendiente” con ceros. Hoja inicial `00_Resumen_y_trazabilidad`
con municipio, INE, bloque, fecha generación, tablas incluidas, fuente, periodo, estado,
limitaciones y tablas excluidas con motivo.

| Dato | Fuente | Periodo | Cobertura | Formato posible |
|---|---|---|---|---|
| Demografía: población, evolución, comparativas, pirámide, derivados | INE Tempus3/33570 | Serie anual + año pirámide | municipio (+prov/ccaa/esp donde haya) | CSV por tabla + informe HTML imprimible |
| Economía: renta ADRH, gini/p80, DIRCE, Censo 2020 | INE ADRH/DIRCE/Censo; AEAT si aportada | 2023 (ADRH), 2025 (DIRCE), 2020 estructural, ejercicio AEAT | municipio (desigualdad ≥100 hab.) | CSV por tabla + informe HTML imprimible |
| Secciones censales | — | — | Sin tabla cargada | NO exportar (solo si usuario carga tabla futura) |

### Formatos

1. CSV individual por tabla: UTF-8 con BOM, separador `;`, encabezados legibles,
   nombre `SOCideas_<Municipio>_<INE>_<Bloque>_<Tabla>_<Periodo>.csv`.
2. Informe HTML imprimible por bloque (“Descargar informe”): colores corporativos
   (verde mineral cabecera, texto blanco, acento verde claro, filas alternas),
   marca `Ideas Sostenibilidad · SOCideas`, fuente y periodo por tabla, CSS `@media print`.
3. XLSX estilizado: NO en esta pasada. Auditoría de dependencia: el proyecto incluye
   `xlsx@0.18.5` (SheetJS Community). Verifica valores/lectura, pero la escritura de
   estilos `.xlsx` no es fiable con esa edición (requiere ediciones Pro/otras libs).
   Añadir `exceljs` (u otra) implicaría dependencia server-only pesada (≈MBs),
   mantenimiento y revisión de licencia, solo justificable cuando las descargas por
   bloque estén consolidadas. Se documenta la limitación y no se finge un `.xlsx`
   con estilos. No se introduce librería UI/animación; no se pone `xlsx` en cliente.

### Generación

Datos exclusivamente del envelope ya presente en la ficha (props del Server Component
a Client Component de descarga). Sin consultas externas, sin nueva lectura R2 si el
dato ya está en página (si el tamaño aconseja endpoint server-side futuro, reutilizar
lectura cacheada). Sin tokens/URLs firmadas/logs/IDs internos/datos personales.
Sin escrituras R2/Supabase; descarga idempotente; sin registrar descarga como
actualización. Rutas: `/socideas/[codigoINE]/descargas/demografia` y
`/socideas/[codigoINE]/descargas/economia` (dos páginas separadas, municipio en URL),
enlazadas desde la ficha (`Descargar tablas de …`) y navbar contextual
(Explorar → Descargas de …) solo con INE real.

---

## 5. Hot update

| Bloque | Sincronizador real | Endpoint | Dry-run | Fuente provisional | Autorización server-side | Botón | Escritura real | Modo en esta tarea |
|---|---|---|---|---|---|---|---|---|
| Demografía | Sí (`syncMunicipioDemografico`, `socideas-sync.ts`) | `POST /api/socideas/sync/[codigoINE]` exige `x-sync-token` (`SOCIDEAS_SYNC_TOKEN`, `timingSafeEqual`); sin token → 401; lock 30 min; escribe R2 + `data_sync_runs` | NO soportado (sin flag dry-run) | No configurada | Real (`SOCIDEAS_SYNC_TOKEN` solo servidor) | Mostrar alcance Demografía solo en UI interna, deshabilitado para escritura (“No activada en esta versión”), sin fetch real | Deshabilitada | Solo informativo/planificado; documentar |
| Economía | Sí (`syncMunicipioEconomia`, parcial: reemplaza solo slugs economía, preserva Demografía; tope +150 KB; lock 30 min; `data_sync_runs`) | `POST /api/socideas/sync-economia/[codigoINE]?dryRun=true[&provisional=true]` exige token; `provisional=true` → `{provisional:false, motivo:'No hay fuente provisional…'}`; `!dryRun` → `revalidateTag(socideas-muni-INE)` selectivo | Sí (`dryRun` por defecto true; no escribe R2/Supabase salvo traza dry-run sin efectos) | No configurada (ADRH provisional 2024 excluido) | Real (misma) | Alcance Economía solo UI interna; `dryRun=true` permitido; escritura real deshabilitada | Deshabilitada (“No activada en esta versión”) | Dry-run informativo; provisional comunica ausencia explícita |
| Secciones censales | No (geometría bajo demanda, sin sincronizador de indicadores por sección) | No | — | No | — | No mostrar | No | No mostrar; documentar como futuro con fuente y sincronizador |
| Futuros bloques | Solo si disponen de fuente + sincronizador real | Solo endpoint protegido real | Solo dry-run/planificado hasta autorización | Solo si configurada | Solo server-side | Solo si verificadas las 5 anteriores | Nunca por defecto | Planificado |

Reglas de integridad: Demografía ⇆ Economía nunca se sobrescriben entre sí (fusión
parcial economía; sync demográfico sobrescribe su propio JSON —ambos limitados al
municipio y bloque); provisional nunca sobrescribe consolidado; tras escritura real
futura, invalidación selectiva (`socideas-muni-INE`), nunca toda la caché; sin HEAD a
R2; sin degradar `unstable_cache`/React cache ni cargar GeoJSON sin clic. Seguridad:
sin tokens en bundle/HTML/props/URL/storage, sin `NEXT_PUBLIC_*` como autorización,
sin modales de secretos, sin exponer endpoints internos en docs públicas, sin
debilitar autorización, sin fingir actualización real.

---

## 6. Riesgos

- No inventar datos: ningún valor sin fila `validado` en envelope; ND/secreto nunca → 0.
- No mezclar años: cada card/tabla indica periodo; comparativas con rezago etiquetadas o desactivadas.
- Nulos/secreto ≠ 0: conservar ausencia con nota (“ND = no difundido por secreto estadístico; nunca equivale a cero”).
- No exportar lo no presente: sin hojas vacías ni tablas Pendiente con ceros; excluidas van a trazabilidad con motivo.
- No exponer secretos: tokens solo `process.env` servidor; metodología pública sin tokens/variables/rutas/SQL/IDs/buckets/permisos/comandos/URLs firmadas.
- No sobrescribir bloque entero por actualizar uno: fusión parcial + límite municipio+bloque.
- No degradar caché/rendimiento: no tocar `unstable_cache`/React cache; sin HEAD R2; sin GeoJSON sin clic; sin dependencia cliente pesada (`xlsx` fuera del cliente).
- No cargar geometría censal sin interacción explícita.
- No convertir presupuestos previstos en liquidación, ni informes locales en cobertura nacional, ni históricos locales en series nacionales.
- Documentos de referencia: inspiración de producto sí; importación de datos/conclusiones/contactos/empresas NO; cobertura futura solo como mapa documentado; específico de proyecto/localidad descartado para ficha general.
- Commits/push: solo `origin/feat/urbideas-premium-editorial-ui`, sin PR/merge/despliegue; cero escrituras R2/Supabase/migraciones/cambios de datos/DNS/Cloudflare/env en esta tarea.

---

## Apéndice — Rutas y municipios de prueba (reales, del catálogo)

- `/socideas`, `/socideas/[codigoINE]`, `?categoria=demografia|economia`,
  `/socideas/[codigoINE]/descargas/demografia`, `/socideas/[codigoINE]/descargas/economia`,
  `/socideas/como-funciona` (+ `#herramientas-de-consulta`, `#descargas`, `#actualizacion-y-control`).
- Municipios reales (docs `socideas-phase-2b-audit.md`, `ine-integration.md`):
  La Roda `02069` (medio, referencia verificada 15.643), Villarrobledo `02081` (medio),
  Albacete `02003` (grande), Sevilla `41091` (grande), Zaragoza `50297` (grande),
  Santiago `15078` (medio). Cobertura parcial/secreto: municipios <1.000 hab. (AEAT no
  aplica) y <100 hab. (desigualdad no difundida) — resolver código concreto desde
  catálogo antes de probar.
