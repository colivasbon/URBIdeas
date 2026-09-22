# Documento de decisión — Presupuestos y liquidaciones municipales

**Fecha:** 2026-09-22 · **Autor:** auditoría técnica SOCideas · **Estado final: PENDIENTE**
(No es GO: falta inspección del fichero a nivel de entidad, validación del join INE-5 y licencia explícita.)

Investigación de solo lectura. No se ha cargado ningún dato de presupuestos y no se ha escrito en R2 ni en Supabase.

---

## 1. Fuente propuesta y enlace oficial

**CONPREL — Consulta de Presupuestos y Liquidaciones de Entidades Locales**
Ministerio de Hacienda y Función Pública (SGFAL / OVEELL).

- Portal: https://serviciostelematicosext.hacienda.gob.es/sgfal/conprel
  (alias `/SGFAL/CONPREL`) — **verificado HTTP 200** (HEAD, 2026-09-22, 40.865 B, text/html).
- Hub oficial enlazándolo: https://www.hacienda.gob.es/es-ES/Areas%20Tematicas/Administracion%20Electronica/OVEELL/Paginas/ConsultaPresupuestosYLiquidaciones.aspx — **verificado HTTP 200**.
- Landing presupuestos (app 2022+ requiere sesión Autoriza): https://www.hacienda.gob.es/es-ES/CDI/Paginas/InformacionPresupuestaria/InformacionCCLLs/Presupuestos_EELL.aspx — **verificado HTTP 200**.

Producto relacionado (NO es presupuesto; solo deuda): **Deuda viva de las Entidades Locales**
- Landing: https://www.hacienda.gob.es/es-ES/CDI/Paginas/SistemasFinanciacionDeuda/InformacionEELLs/DeudaViva.aspx — **HTTP 200**.
- XLSX descargado y verificado (HTTP 200, OOXML, 732.340 B, Last-Modified 2026-06-30):
  https://www.hacienda.gob.es/cdi/sist%20financiacion%20y%20deuda/informacioneells/2025/deuda-viva-ayuntamientos-202512.xlsx

## 2. Evidencia de que es nacional y descargable

Del portal CONPREL (texto visible en la página, HTTP 200):

- «Datos por Entidad Local. Máximo nivel de desglose (**ACCESS**)» + «**Fichero comprimido**» (ZIP).
- «Datos a nivel nacional y por CCAA (**EXCEL**)».
- Ejercicios definitivos **2002–2025**; avances de liquidación y presupuestos publicados (p. ej. 30/06/2026 y 31/08/2026).
- Mapa de CCAA con Ceuta y Melilla; opcionalidad de País Vasco y Navarra como bloques.

Cobertura: nacional por diseño del ministerio. **No verificado aún** el porcentaje real de municipios presentes en el fichero Access (ver §5 y §10).

## 3. Campos candidatos y definición oficial

Definiciones según la clasificación económica de la EHA/3565/2008 (documentación OVEELL/SGFAL enlazada desde los hubs oficiales; pendiente de descarga de las notas metodológicas junto al fichero):

| Campo candidato | Definición contable (fase) |
|---|---|
| Presupuesto inicial de ingresos/gastos | Presupuesto inicial de la corporación (consolidado con dependientes) |
| Presupuesto definitivo | Definitivo una vez modificaciones |
| Derechos reconocidos | Liquidación: derechos reconocidos netos |
| Recaudación | Liquidación: recaudación neta |
| Obligaciones reconocidas | Liquidación: obligaciones reconocidas netas |
| Pagos | Liquidación: pagos realizados |
| Ejecución % | Derivado (recaudación/derechos; pagos/obligaciones) — calcular con definición explícita |
| Deuda viva | **Otra fuente** (XLSX Hacienda verificado); definición de stock a 31/12, no comparable con flujos de liquidación |

⚠️ Presupuesto ≠ liquidación: bases distintas, jamás mezclar columnas.
⚠️ Avance ≠ definitivo: congelar versión/hash por descarga.

## 4. Identificador y estrategia de join

- El fichero de entidad local usa claves OVEELL (formato observado en formularios: `08-02-057-AA-000`) — **no se ha confirmado aún** qué columna exacta trae el Access.
- Puente oficial candidato: **BDGEL** (Base General de Datos de Entidades Locales), que documenta códigos INE y NIF:
  https://datos.gob.es/es/catalogo/e05250001-base-general-de-datos-de-entidades-locales
  (consulta: https://serviciostelematicosext.hacienda.gob.es/sgcief/InventarioBDGEL/Home/ConsultaBDGEL).
- Catálogo municipal SOCideas: INE-5. Join propuesto: `INE-5 ← BDGEL(código INE) ← CONPREL(código entidad)`, **nunca por nombre**.
- Filtro obligatorio `tipo = ayuntamiento` (excluir diputaciones, mancomunidades, comarcas, áreas metropolitanas, EATIM, consorcios).

## 5. Cobertura observada en muestra de 100 municipios

**No calculada.** El fichero Access/ZIP de CONPREL no se ha descargado en esta investigación (URLs de descarga dinámicas, generadas por JS en el portal). Sin la muestra no se puede declarar GO.

Plan de medida (paso previo al GO): descargar el Access del último ejercicio definitivo, contar presencia de una muestra estratificada de 100 INE-5 (capitales, medianos, rurales, forales, Ceuta/Melilla) y publicar el % de cobertura real en este documento.

## 6. Mapa de riesgos y exclusiones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Ámbito subjetivo restringido (no todo el sector local) | Huecos de cobertura | Publicar cobertura real; estado `partial` honesto |
| Unidades no municipales (mancomunidades, diputaciones…) | Filas no joinables | Filtro `tipo = ayuntamiento` verificado |
| Consolidación corporación + dependientes | No comparable con cuentas no consolidadas del ayto | Etiqueta metodológica explícita |
| Presupuesto vs liquidación | Series incompatibles | Columnas separadas, jamás una tabla mixta |
| Avance vs definitivo | Cifras que cambian | Persistir fase + hash + fecha de descarga |
| Cumplimiento incompleto (retenciones, Ley 2/2011 art. 36) | Ausencias reales | `missing`/`partial`, nunca 0 |
| Territorios forales (País Vasco, Navarra) | Cobertura distinta | Estado `missing_by_design` si la fuente no llega; sin imputación |
| Duplicados por mezclar niveles | Dobles conteos | Filtrar nivel antes de agregación |
| Cambios de código de entidad | Joins rotos | Puente BDGEL + validación por run |
| Licencia de reutilización no explícita en CONPREL | Bloqueo legal | Validar aviso legal Hacienda / Ley 19/2013 antes de publicar |

## 7. Diseño de parser

- Descarga reproducible: URL + fecha + bytes + SHA-256 en manifest (mismo patrón que AEAT EDM: `tmp/*-manifest-<runId>.json`).
- Origen: ZIP → Access (convertir a CSV/Parquet con herramienta local) o, si se confirma, export Excel equivalente.
- Validación por ejercicio: número de entidades > umbral razonable, columnas esperadas presentes, rangos contables ≥ 0 salvo déficit explícito.
- dry-run obligatorio antes de escritura (regla innegociable del repo).
- Nunca scraping de la web app con sesión Autoriza.

## 8. Diseño de envelope v2

- Merge aditivo en `socideas/v2/municipios/{INE-5}.json` (R2 v2), solo slugs nuevos p. ej. `presupuesto_ingresos_inicial`, `presupuesto_ingresos_definitivo`, `presupuesto_gastos_definitivo`, `derechos_reconocidos`, `obligaciones_reconocidas`, `ejecucion_ingresos_pct`, `ejecucion_gastos_pct` (nombres definitivos al ver los campos reales).
- Tupla `[indicador, año, valor, unidad, dimensiones{ambito, fase}, url, tableId, serie, estado]`.
- `tableId` tipo `CONPREL-<ejercicio>` para resolver fuente en `sourceSlugForTable` (añadir rama `^CONPREL` → fuente nueva `hacienda_conprel`).
- Preservación total de slugs existentes + tope 150 KB (medición en dry-run).
- Deuda viva (si se integra): slug propio `deuda_viva` con fuente distinta, nunca dentro de presupuesto.

## 9. Diseño de auditoría `data_sync_runs`

- `tipo_sincronizacion: 'conprel_presupuestos'`, `bloque: 'economia'`, `periodo: <ejercicio>`, `fuente: 'hacienda_conprel'`.
- `metadata`: `{ runId, url, sha256, bytes, fase: 'definitivo'|'avance', entidades_leidas, municipios_escritos, cobertura_muestra_100, descartadas_no_municipales, join_bdgel_ok, errores[] }`.
- Estado `ok`/`partial`/`error` según escrituras; manifest en `tmp/`.
- Revalidación selectiva `socideas-muni-<ine>` tras escritura (endpoint ya existente desde esta misma rama).

## 10. Plan de dry-run de 100 municipios

1. Descargar Access/ZIP del último ejercicio **definitivo** desde CONPREL (manualmente desde el portal; registrar URL/fecha/hash).
2. Convertir a CSV local; identificar columnas de clave, tipo de entidad y ejercicios.
3. Cruzar con BDGEL → INE-5; medir % de match y % de entidades `tipo=ayuntamiento`.
4. Muestra estratificada de 100 INE-5 (incluye Pamplona, Bilbao, Ceuta, Melilla, Albacete, Madrid, Sevilla, Barcelona, Santiago, Valladolid, Oviedo, Cartagena, Palma, Ávila): contar cuántos tienen fila de presupuesto y liquidación.
5. Simular merge R2 (tamaño final < 150 KB, slugs preservados) sin escribir.
6. Registrar resultado en este documento (§5) con la tabla de cobertura.

## 11. Criterios de go/no-go

| Criterio | Estado hoy |
|---|---|
| URL oficial verificable (HTTP 200) | ✅ portal CONPREL 200 |
| Formato estructurado descargable | ✅ Access/ZIP + Excel (texto del portal); descarga concreta **sin verificar** |
| Identificador/join seguro INE-5 | ⚠️ vía BDGEL propuesto, **sin validar con fichero real** |
| Cobertura suficiente (muestra 100) | ❌ **no medida** |
| Trazabilidad descargable (hash/manifest) | ⚠️ diseño listo, sin descarga propia |
| Definición clara de campos | ⚠️ clasificación EHA/3568 conocida; notas pendientes de descargar |
| Licencia/condiciones explícitas | ❌ no declarada en CONPREL |

GO exige: ✅ en las siete filas.

## 12. Recomendación final

# PENDIENTE — requiere acceso/documentación adicional

**Próximo paso exacto (único, bloqueante):** descargar manualmente desde el portal CONPREL el ZIP/Access de «Datos por Entidad Local — máximo nivel de desglose» del último ejercicio definitivo y ejecutar el dry-run de §10 (muestra de 100). Con sus resultados se actualiza este documento a GO (si cobertura+join+licencia cuadran) o NO-GO (si el join INE-5 no es seguro o la cobertura es insuficiente).

- NO es GO: faltan muestra de cobertura, validación del join y licencia.
- NO es NO-GO: la fuente es nacional, oficial, estructurada y con serie larga; nada la descarta por diseño.

**Nota:** la opción XLSX de deuda viva (Hacienda) está verificada y descargable, pero responde a un producto distinto (deuda, no presupuesto/liquidación) y debe tratarse como integración propia con su propia definición.
