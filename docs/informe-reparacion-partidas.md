# Reparación de las partidas de Benidorm (03031)

Qué se corrigió, cómo se comprobó y qué queda fuera. Todo lo que sigue está
verificado contra la base y contra el libro generado; las cifras se comprobaron
después de escribir, no antes.

## Resumen

| | antes | después |
|---|---|---|
| Partidas vigentes en la base | 99 | **53** |
| Partidas que publica el libro | 157 | **53** |
| Nombres que eran un número de distrito | 30 | **0** |
| «El Saladar» en el libro | 4 filas | **1** |
| Registros totales en la base | 1378 | **1378** (no se borra nada) |
| Filas del libro | 1378 | **1269** |

Las 53 entidades son las que documenta la plantilla municipal. Ninguna desaparece:
las 99 vigentes pasaron a 53 porque 46 eran duplicados por área y 25 eran
artefactos de lectura que nunca fueron topónimos.

## Causa raíz

### 1. El área estaba dentro de la clave de la partida

La hoja `Núcleos_partidas` documenta cada partida dos veces: el primer bloque
(74 filas) repite una fila por área y el segundo (53 filas) la da con la lista
completa. Por ejemplo, «El Saladar» aparece con área 10, luego con 12, y después
como «9, 10, 12».

Con el área dentro de la clave, `partida|2|El Saladar|10`, `partida|2|El Saladar|12`
y `partida|2|El Saladar|9, 10, 12` eran tres entidades distintas. La clave ahora
es la identidad real — distrito y nombre — y el área se acumula como lista:

```
partida|2|El Saladar        atributos.area = "9, 10, 12"
```

127 filas de la plantilla se reducen así a 53 entidades, con 35 filas duplicadas
dentro de la propia hoja.

### 2. Una lectura antigua tomaba la columna Distrito por el nombre

Veinticinco registros tienen como nombre `1`, `2`, `3`, `4` o `Distrito`. Sus
claves son `partida|4, 5|4|`: el área en el campo del distrito y el número de
distrito en el del nombre.

Son el resultado de leer el segundo bloque desplazado una columna. La prueba de
que nunca fueron topónimos es directa: **la columna Distrito del segundo bloque
solo tiene cuatro valores distintos** (1, 2, 3, 4). Si fueran nombres, habría
muchos más. No hay forma de saber qué partida nombraban, así que se retiran sin
renombrar.

### 3. La plantilla tiene una errata de grafía

`Núcleos_partidas` documenta el mismo núcleo dos veces con dos grafías:

- fila 25: `Amanello | 3 | 12`
- fila 86: `Armanello | 3 | 12`

Manda «Armanello» porque es la grafía que usa el resto del libro de forma
coherente: la parada «357 - C. Armanello», la calle «C/ Armanello» y el «Camí
de l'Armanello». Solo el «Camping Amanello» usa la otra forma.

La corrección está declarada en `ORTOGRAFIA_PARTIDAS`, en
`src/lib/incideas/plantilla-partidas.ts`, con su motivo, y no se deduce en
tiempo de ejecución: sin corregirla la importación crearía dos topónimos para el
mismo lugar. La entidad conserva `filas_hoja: [25, 86]`, que documenta que viene
de las dos filas.

### 4. El libro publicaba las bajas lógicas

El cargador filtraba `eliminado_en` (borrado duro) y la visibilidad, pero no
`desactualizado_desde` (baja lógica). Por eso el libro mostraba 157 partidas
cuando solo había 53 vigentes, con los duplicados por área y los nombres
numéricos, como si fueran lugares actuales.

Una baja lógica significa que la fuente dejó de documentar el registro, así que
no debe publicarse como vigente. El filtro se añadió a `paginarRegistros` y hay
una prueba que lo fija.

## Qué se escribió

Todo bajo `incideas_registros` para el INE 03031, subcategoría `partida`, con
fila de historial por cada cambio. **Ninguna fila se borró.**

- 52 reactivaciones: se revive la fila que ya tenía la clave correcta
- 1 renombrado: `Amanello` → `Armanello`, con la grafía anterior en el historial
- 99 retiradas lógicas, con su motivo en `motivo_baja`
- 206 filas de historial

Se prefirió revivir las filas que ya tenían la clave correcta en vez de
reescribir la clave de las 74 activas. Además de ser menos invasivo, evita un
problema real: la búsqueda del pipeline usa `maybeSingle()` y filtra solo por
`eliminado_en`, así que dos filas con la misma `id_origen` —la activa reparada y
la baja histórica— la habrían hecho fallar.

Después, la reimportación de la plantilla dio:

```
insertados=0 actualizados=53 sin_cambios=275 posibles_bajas=109
```

Los 109 `posibles_bajas` son filas **ya** dadas de baja: 104 de la reparación y 5
farmacias de octubre. El contador no distingue nuevas de previas, así que la
cifera asusta más de lo que pasó. Ninguna baja nueva.

La segunda importación, para comprobar la idempotencia:

```
insertados=0 actualizados=0 sin_cambios=328
```

## Límite municipal

Contrastado contra la fuente oficial y **sin tocar la geometría**.

El WFS del IGN funciona en `au:AdministrativeUnit` y devuelve GeoJSON, bajo CC BY
4.0 y sin autenticación. El recinto oficial de Benidorm es
`AU_ADMINISTRATIVEUNIT_34100303031`. La pista de que este servicio solo devolvía
GML está superada.

Medido en EPSG:3035 (equal-area, que es donde un área tiene sentido):

| | OSM 341148 | IGN oficial |
|---|---|---|
| Vértices | 697 | 1.505 |
| Área | 38,4927 km² | 38,5077 km² |

- Diferencia de área: **−0,039 %**
- Intersección: **99,713 %** del recinto oficial
- Hausdorff: **66,75 m**

La geometría publicada es el mismo recinto, a escala subdecamétrica. La propia
relación OSM declara `source=BDLL25, EGRN, Instituto Geográfico Nacional`. Se
conserva la de OSM y el contraste queda en `atributos.limite_verificado_contra`.

Tres metadatos sí estaban mal y se corrigieron:

| campo | antes | después |
|---|---|---|
| `estado_espacial` | `sin_geometria` | `valido` |
| `fecha_dato` | nula | `2026-04-29` |
| `metodo_obtencion` | `api` | `api_nominatim` |

`sin_geometria` era incoherente: el registro sí tiene un MultiPolygon válido de
697 vértices. Ese valor queda para los registros sin punto.

## Población: no se ha tocado

`municipios.poblacion` guarda **1021** habitantes para Benidorm, y el padrón del
INE de 2025 registra **77327**. El libro publica la cifra del INE y avisa de la
discrepancia.

No se corrigió en la base por dos razones:

**La columna está sistemáticamente corrupta, no solo en Benidorm.** De los 8.130
municipios con población, **6.034 tienen menos de 1.000 habitantes** (en España
real son unos 1.800) y solo 6 superan 500.000 (en la realidad son tres). Arreglar
solo Benidorm taparía una columna rota en unas 6.000 filas.

**No hay dónde registrar la trazabilidad.** `municipios.poblacion` es un `integer`
sin año ni período, e `incideas_correcciones_propuestas` tiene clave foránea a
`registro_id`: no existe registro municipal, así que no admite una corrección de
población. Guardarla exigiría una migración.

## Cómo reproducirlo

```bash
# Copia verificable y plan, sin escribir nada
npx tsx scripts/incideas/plan-reimportacion.ts

# Ensayo de la reparación, sin escribir nada
npx tsx scripts/incideas/reparar-partidas.ts

# Aplicar
npx tsx scripts/incideas/reparar-partidas.ts --go

# Reimportar la plantilla y comprobar idempotencia
npx tsx scripts/incideas/import-xlsx.ts --file "INCIDEAS DOCUMENTOS/Limpieza info.xlsx" --go
npx tsx scripts/incideas/import-xlsx.ts --file "INCIDEAS DOCUMENTOS/Limpieza info.xlsx" --go

# Regenerar el libro
npx tsx scripts/incideas/generar-libro.ts
```

La copia de seguridad y el plan quedan en `salida/incideas_reimportacion_03031/`,
que está en `.gitignore` porque contiene filas de la base.

- `copia-antes.json`: 1.378 registros, 2.884 trazas de historial, 36 ejecuciones,
  el municipio y la revisión pendiente
- `plan.json`: los 152 movimientos, con su motivo

El script de reparación **lee `plan.json`**: no decide nada por su cuenta, así que
hace exactamente lo que dice el plan revisado. Si el estado de la base no coincide
con el que el plan asumía, aborta sin escribir.

## Verificación

- 97 pruebas en verde: `incideas-pipeline` 40, `incideas-aceptacion` 27,
  `incideas-libro` 30
- `tsc --noEmit` y ESLint limpios en las rutas de INCideas
- `npm run build` compila
- Base: 53 partidas vigentes, 0 nombres numéricos, 0 claves duplicadas, 1.378
  registros totales
- Libro: 53 partidas, 0 nombres numéricos, 0 duplicados, 1.269 filas, 1.111 con
  coordenadas