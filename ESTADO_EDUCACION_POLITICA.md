# ESTADO DEL PROYECTO: Integración de Educación y Política en SOCideas

**Última actualización:** 2026-09-29  
**Responsable anterior:** Claude Haiku 4.5  
**Estado:** FASE 1 COMPLETADA (Arquitectura + Infraestructura base)

---

## 1. CONTEXTO DEL PROYECTO

### Objetivo General
Integrar dos nuevos dominios de indicadores por sección censal/electoral en el Atlas de Secciones Censales de SOCideas:
- **EDUCACIÓN**: Indicadores del Censo Anual de Población (nivel educativo, estudios en curso, relación con actividad)
- **POLÍTICA**: Resultados electorales por sección electoral (municipales, autonómicas, Congreso, Senado, Europeas)

### Alcance Definido
- **No se limita a un municipio** (Albacete, Cáceres, etc.) sino a TODA España
- **Cobertura nacional**: incorporar todos los municipios donde la fuente oficial publique datos con desglose por sección
- **Arquitectura modular**: educación y política como dominios independientes, integrados en la UI existente sin duplicar lógica
- **Sin cambios a la ficha XLSX**: solo la vista de secciones censales (`/socideas/{ine}/secciones-censales`)

### Audiencia
- Técnicos senior (ingenieros de montes, biólogos, ambientólogos, arqueólogos)
- No explicar conceptos básicos
- Decisión-orientado, senior a senior, sin tono pedagógico

---

## 2. ESTADO ACTUAL COMPLETO

### 2.1 Arquitectura General (VALIDADA)

```
SOCideas (Next.js)
├── API Endpoints
│   └── /api/socideas/secciones/[codigoINE]  ← Lee atlas base + educación + política
├── Componentes Cliente
│   ├── SeccionesAtlas.tsx  ← Mapa + controles (MODIFICADO en ciclo anterior)
│   ├── SeccionesIndicadorBuscador.tsx  ← Selector por temas (ACTUALIZADO esta sesión)
│   ├── SectionLegend.tsx  ← Leyenda numérica/categórica
│   ├── SeccionesAtlasMap.tsx  ← Leaflet + coropleta
│   ├── SeccionesAtlasTable.tsx  ← Tabla de secciones
│   ├── SeccionesEducationExtension.tsx  ← NUEVO: agrega educación al atlas
│   └── [otros componentes estables]
├── Librerías Compartidas (Puro, sin I/O)
│   ├── socideas-secciones.ts  ← MODIFICADO: SeccionTema + tableFamily ampliados
│   ├── socideas-secciones-education.ts  ← NUEVO: contratos educativos
│   ├── socideas-secciones-political.ts  ← NUEVO: contratos electorales
│   └── [otras librerías estables]
├── Almacenamiento (R2 + Supabase)
│   ├── socideas/secciones/v1/municipal/{ine}.json  ← Atlas base (economía + demo)
│   ├── socideas/secciones/v1/education/  ← NUEVA RUTA: datos educativos
│   └── socideas/secciones/v1/political/  ← NUEVA RUTA: resultados electorales
└── Scripts de Carga (Node)
    ├── load-secciones-atlas.ts  ← Económico + Demografía (ESTABLE)
    ├── load-section-education.ts  ← NUEVO: stub, necesita implementación real
    ├── load-section-elections.ts  ← NUEVO: stub, necesita implementación real
    └── generate-education-test-data.ts  ← NUEVO: genera datos de prueba para desarrollo
```

### 2.2 Cambios Realizados Esta Sesión

#### A. Contratos (Type System)

**MODIFICADO: `src/lib/socideas-secciones.ts`**
```typescript
// ANTES:
export type SeccionTema = 'renta' | 'desigualdad' | 'demografia' | 'educacion' | 'vivienda' | 'laboral'

// DESPUÉS:
export type SeccionTema = 'renta' | 'desigualdad' | 'demografia' | 'educacion' | 'politica' | 'vivienda' | 'laboral'

// ANTES:
tableFamily: 'renta' | 'gini' | 'censo_sexo_edad' | 'censo_nacionalidad'

// DESPUÉS:
tableFamily: 'renta' | 'gini' | 'censo_sexo_edad' | 'censo_nacionalidad' | 'censo_educacion' | 'electoral'
```

**CREADO: `src/lib/socideas-secciones-education.ts`**
- `EducationIndicator extends SeccionIndicador` (7 indicadores iniciales)
- `EducationSectionValue` (numerador, denominador, valor, estado)
- `EducationMunicipalDataset` (estructura completa por municipio+período)
- Indicadores:
  - `edu_sin_estudios_pct` — Sin estudios
  - `edu_primaria_pct` — Educación primaria incompleta
  - `edu_primer_ciclo_eso_pct` — Primera etapa ESO
  - `edu_segundo_ciclo_eso_pct` — Segunda etapa ESO
  - `edu_fp_grado_medio_pct` — FP grado medio
  - `edu_fp_grado_superior_pct` — FP grado superior
  - `edu_universitaria_pct` — Educación superior

**CREADO: `src/lib/socideas-secciones-political.ts`**
- `ElectionType = 'municipal' | 'autonomic' | 'congress' | 'senate' | 'european'`
- `Candidacy` (nombre, siglas, color, familia política)
- `ElectionSectionResult` (sección electoral con resultados agregados)
- `PoliticalMunicipalDataset` (estructura completa por elección+municipio)

#### B. Componentes UI

**MODIFICADO: `src/components/socideas/SeccionesIndicadorBuscador.tsx`**
```typescript
// ANTES:
export const GRUPOS_TEMA: ReadonlyArray<GrupoTema> = [
  { id: "economico", etiqueta: "Económico", temas: ["renta", "desigualdad"] },
  { id: "demografia", etiqueta: "Población", temas: ["demografia"] },
  { id: "educacion", etiqueta: "Educación", temas: ["educacion"] },
  { id: "vivienda", etiqueta: "Vivienda", temas: ["vivienda"] },
  { id: "laboral", etiqueta: "Laboral", temas: ["laboral"] },
];

// DESPUÉS:
export const GRUPOS_TEMA: ReadonlyArray<GrupoTema> = [
  { id: "economico", etiqueta: "Económico", temas: ["renta", "desigualdad"] },
  { id: "demografia", etiqueta: "Población", temas: ["demografia"] },
  { id: "educacion", etiqueta: "Educación", temas: ["educacion"] },
  { id: "politica", etiqueta: "Política", temas: ["politica"] },  ← NUEVO
  { id: "vivienda", etiqueta: "Vivienda", temas: ["vivienda"] },
  { id: "laboral", etiqueta: "Laboral", temas: ["laboral"] },
];
```

**CREADO: `src/components/socideas/SeccionesEducationExtension.tsx`**
- Componente cliente que carga datos educativos bajo demanda
- Expande el atlas con indicadores y observaciones educativas
- Agrega cobertura de cada indicador
- Solo se ejecuta en desarrollo (usa datos locales de `/tmp/test-education-data/`)
- Props: `{ codigoINE, atlas, onAtlasExtended? }`

#### C. Almacenamiento y Lectura (R2)

**CREADO: `src/lib/socideas-secciones-education-store.ts`**
- Función `educationR2Key(codigoIne, period)` 
  - Ruta: `socideas/secciones/v1/education/normalized/{period}/{ine}.json`
- Función `leerDatosEducativos(codigoIne, period, timeoutMs?)`
  - Lee desde R2 bajo demanda
  - Valida schema
  - Retorna `EducationMunicipalDataset | null`

**CREADO: `src/lib/socideas-secciones-political-store.ts`**
- Función `politicalR2Key(codigoIne, electionType, electionDate)`
  - Ruta: `socideas/secciones/v1/political/normalized/{type}/{date}/{ine}.json`
- Función `leerResultadosElectorales(codigoIne, electionType, electionDate, timeoutMs?)`
  - Lee desde R2 bajo demanda
  - Valida schema
  - Retorna `PoliticalMunicipalDataset | null`

**CREADO: `src/lib/socideas-test-data-local.ts`**
- Helper SOLO para desarrollo
- Función `leerDatosEducativosLocalDev(codigoIne, period)`
- Lee desde `/tmp/test-education-data/{ine}-education-{period}.json`
- Caché en memoria
- Nunca ejecuta en producción

#### D. Scripts de Carga

**CREADO: `scripts/load-section-education.ts` (STUB)**
```bash
npx tsx scripts/load-section-education.ts --period=2024 --ines=02003
npx tsx scripts/load-section-education.ts --period=2024 --all --confirm-r2-write
```
- Flags: `--period`, `--ines`, `--all`, `--write`, `--confirm-r2-write`, `--verify`, `--resume`, `--manifest`
- TODO: Implementar descarga real de tabla Censo educativa del INE

**CREADO: `scripts/load-section-elections.ts` (STUB)**
```bash
npx tsx scripts/load-section-elections.ts --type=municipal --date=2023-05-28 --ines=02003
npx tsx scripts/load-section-elections.ts --type=municipal --date=2023-05-28 --all --confirm-r2-write
```
- Flags: `--type`, `--date`, `--ines`, `--communities`, `--all`, `--write`, `--confirm-r2-write`, `--verify`, `--resume`, `--manifest`
- TODO: Implementar descarga real de Infoelectoral + agregación mesa→sección

**CREADO: `scripts/generate-education-test-data.ts` (FUNCIONAL)**
```bash
npx tsx scripts/generate-education-test-data.ts --period=2024
```
- Genera datos educativos de prueba para 3 municipios
- Salida: `/tmp/test-education-data/{ine}-education-2024.json`
- Municipios: Albacete 02003 (17 secciones), Cáceres 10037 (12), Madrid 28079 (131)
- Datos simulados pero con estructura real, numeradores, denominadores, status variado

### 2.3 Datos de Prueba Generados

**Ubicación:** `C:\Users\carlosoli_b\Documents\GitHub\URBIdeas\tmp\test-education-data\`

```
02003-education-2024.json (29 KB)
├─ Albacete
├─ 17 secciones censales
├─ 7 indicadores × 17 secciones = 119 valores
├─ Algunos valores ND simulados (10% de probabilidad)
└─ Estructura validada (isValidEducationDataset = true)

10037-education-2024.json (23 KB)
├─ Cáceres
├─ 12 secciones censales
├─ 7 indicadores × 12 = 84 valores
└─ [igual]

28079-education-2024.json (181 KB)
├─ Madrid
├─ 131 secciones censales
├─ 7 indicadores × 131 = 917 valores
└─ [igual]
```

**Estructura de cada valor:**
```json
{
  "sectionCode": "0200301001",
  "indicatorId": "edu_sin_estudios_pct",
  "numerator": 45,
  "denominator": 1000,
  "value": 4.5,
  "status": "observado",
  "note": null
}
```

### 2.4 Estado de Compilación

```bash
✅ npx tsc --noEmit
   → 0 errores
   → Todo compila correctamente
```

### 2.5 Cambios en Git

**Commit 1 (7a8707c):**
```
feat(educacion+politica): contratos base, loaders stub e indicadores educativos

- Ampliar SeccionTema: agregar 'politica'
- Ampliar tableFamily: agregar 'censo_educacion' y 'electoral'
- Nuevos contratos: EducationMunicipalDataset, PoliticalMunicipalDataset
- Nuevos grupos temáticos: Educación, Política
- Stubs de loaders: load-section-education.ts, load-section-elections.ts
- Helpers de lectura desde R2: secciones-education-store.ts, secciones-political-store.ts
- Generador de datos de prueba educativos para Albacete, Cáceres, Madrid
- Todos los tipos compilan sin errores
```

**Commit 2 (9c6f193):**
```
feat(educacion): extensión para agregar datos educativos al atlas

- Helper local para servir datos de prueba en desarrollo
- Componente SeccionesEducationExtension para integrar educación
- Generación de observaciones educativas desde dataset
- Agregación automática de cobertura educativa
- Todo compila sin errores
```

---

## 3. DÓNDE NOS HEMOS QUEDADO

### 3.1 Qué Está COMPLETADO y Listo

1. ✅ **Contratos de tipo (Type System)**
   - `SeccionTema` incluye 'educacion' y 'politica'
   - `tableFamily` ampliadoconformidad a nuevos dominios
   - Indicadores educativos definidos (7 iniciales)
   - Indicadores políticos (tipo, unidad, valueType) definidos

2. ✅ **Infraestructura de almacenamiento**
   - Rutas R2 definidas para educación y política
   - Helpers de lectura desde R2 creados y funcionales
   - Validación de schema en lectura

3. ✅ **UI: Temas (grupos temáticos)**
   - Grupo "Educación" con tema 'educacion' ✅
   - Grupo "Política" con tema 'politica' ✅
   - SeccionesIndicadorBuscador ya usa GRUPOS_TEMA genéricamente ✅

4. ✅ **Generación de datos de prueba**
   - 3 municipios con datos educativos realistas
   - Estructura validada
   - Numeradores, denominadores, porcentajes correctos
   - Algunos ND simulados para pruebas

5. ✅ **Compilación TypeScript**
   - 0 errores, todo compila

### 3.2 Qué Está EN PROGRESO pero Incompleto

1. 🟡 **Integración educación en SeccionesAtlas**
   - Componente `SeccionesEducationExtension` CREADO
   - NO INTEGRADO en `SeccionesAtlas.tsx` todavía
   - NO se llama en el render cuando el usuario selecciona tab "Educación"
   - NO actualiza el atlas local con los datos educativos

2. 🟡 **Loaders (Stubs)**
   - `load-section-education.ts` — aceptaflags, NO descarga datos reales
   - `load-section-elections.ts` — acepta flags, NO descarga datos reales

### 3.3 Qué Está PENDIENTE (No Iniciado)

1. ❌ **Implementación real de loaders**
   - Educación: descarga tabla Censo del INE, parsea, normaliza
   - Política: descarga Infoelectoral, agrega mesa→sección, normaliza candidaturas

2. ❌ **Carga nacional**
   - Educación: todos los municipios, períodos 2021-2024
   - Política: municipales 2023, 2019; Congreso 2023, 2019; autonómicas por CA; Europeas

3. ❌ **Integración UI completa**
   - SeccionesAtlas no llama todavía SeccionesEducationExtension
   - Componente no se re-renderiza cuando usuario cambia de tema
   - No hay manejo de estados de carga/error para educación

4. ❌ **Política: implementación completa**
   - Indicadores: ganador, participación, abstención, margen, blancos, nulos, concentración
   - Mapa categórico para ganador
   - Mapa continuo para porcentajes
   - Tabla con mesas agregadas

5. ❌ **Pruebas visuales**
   - No se ha ejecutado `npm run dev` y navegado a `/socideas/02003/secciones-censales`
   - No se ha verificado que educación aparece en la UI
   - No se ha verificado responsive, dark mode, PNG export

---

## 4. PLAN DE TRABAJO DETALLADO

### FASE 2: Integración UI + Pruebas (1-2 días)

#### Paso 1: Integración SeccionesEducationExtension en SeccionesAtlas
**Archivo:** `src/components/socideas/SeccionesAtlas.tsx`
**Tiempo estimado:** 1-2 horas

**Acciones:**
1. Importar `SeccionesEducationExtension` en el componente
2. Crear estado local `atlasExtended: SeccionesAtlasV1 | null`
3. Agregar callback `onAtlasExtended` que actualice el estado
4. En el render, renderizar `<SeccionesEducationExtension codigoINE={codigoINE} atlas={datos?.atlas ?? null} onAtlasExtended={(ext) => setAtlasExtended(ext)} />`
5. Usar `atlasExtended` en lugar de `atlas` cuando esté disponible
6. Verificar que la leyenda, tabla y mapa se actualizan correctamente

**Validación:**
```bash
✅ TypeScript compila
✅ App no da errores en consola
✅ En /socideas/02003/secciones-censales, pestaña "Educación" aparece
✅ Al hacer click en "Educación", se cargan datos (pueden estar vacíos si no hay educación todavía)
```

#### Paso 2: Verificación Visual en Desarrollo
**Tiempo estimado:** 30 minutos

```bash
# Terminal 1: Dev server
npm run dev

# Terminal 2: Verificaciones en http://localhost:3000/socideas/02003/secciones-censales
```

**Checklist:**
- ✅ Pestaña "Educación" visible en el selector de temas
- ✅ Al hacer clic en "Educación", el badge muestra el conteo real (7 indicadores)
- ✅ El buscador lista los 7 indicadores educativos
- ✅ Al seleccionar uno (p. ej. "Población sin estudios (%)"), el mapa cambia
- ✅ Leyenda muestra clases correctas (cuantiles, intervalos iguales, manual)
- ✅ Tooltip muestra valores educativos correctos
- ✅ Tabla de secciones muestra educación
- ✅ PNG export incluye educación
- ✅ Responsive: funciona en móvil (375px)
- ✅ Dark mode: colores correctos
- ✅ Pestaña "Población" sigue funcionando (regresión)

**Para los 3 municipios de prueba:**
- Albacete 02003
- Cáceres 10037
- Madrid 28079

#### Paso 3: Captura de Pantallas
**Tiempo estimado:** 15 minutos

Guardar en `/tmp/audit/screenshots-secciones-education-politics/`:
```
albacete-educacion-1440.png             # Escritorio, luz
albacete-educacion-oscuro-1440.png      # Escritorio, oscuro
albacete-educacion-390.png              # Móvil 375px
caceres-educacion-1440.png
madrid-educacion-1440.png
educacion-png-export-albacete.png       # PNG descargado
```

**Lo que debe verse:**
- Mapa coroplético con secciones coloreadas
- Leyenda con clases educativas
- Tabla con secciones y valores
- Tooltip al pasar el ratón
- Panel lateral con metadatos

---

### FASE 3: Loaders Educativos Reales (2-3 días)

#### Paso 1: Investigación de Tabla Censo Educativa
**Tiempo estimado:** 1 hora

**Acciones:**
1. Verificar en `https://www.ine.es/jaxiT3/` qué tabla contiene educación por sección censal
2. Documentar:
   - Número de tabla (p. ej. 70XXX)
   - Campos disponibles (nivel educativo, estudios en curso, actividad)
   - Período de cobertura (2021-2024?)
   - Geografía (por sección censal)
3. Descargar una tabla de prueba (Albacete, provincia 02)
4. Analizar estructura de CSV

**Referencias:**
- Archivo existente: `src/lib/ine-censo-secciones.ts` (ya carga demografía del Censo)
- Usar mismo patrón que `construirDemografiaCenso`
- Reutilizar `interpretarTotalAdrh` para parsear números

#### Paso 2: Implementar Loader Real de Educación
**Archivo:** `scripts/load-section-education.ts` (reemplazar stub)
**Tiempo estimado:** 4-6 horas

**Estructura (seguir patrón de `load-secciones-atlas.ts`):**

1. **Descarga provincial (una por provincia):**
   ```typescript
   async function censoEducacionalProvincial(provincia: string): Promise<CensoEducacion>
   // Descarga tabla(s) educativa(s) del INE
   // Caché por provincia (reutilizar entre municipios)
   ```

2. **Parseo:**
   ```typescript
   function parsearEducacion(csvTexto: string, codigoIne: string): {
     porSeccion: Record<string, EducationSectionValue[]>
     avisos: string[]
   }
   // Leer CSV, identificar secciones, parsear valores, aplicar reglas ND
   ```

3. **Construcción de dataset:**
   ```typescript
   function construirDatasetEducativo(
     provincia: string,
     municipio: MunicipioData
   ): EducationMunicipalDataset
   // Agregar por sección, calcular indicadores derivados
   ```

4. **Validación:**
   - Códigos CUSEC válidos
   - Numeradores ≤ denominadores
   - Porcentajes 0-100
   - Secciones coinciden con geometría

5. **Escritura en R2:**
   ```typescript
   async function publicarEducacion(
     municipio: string,
     dataset: EducationMunicipalDataset,
     escribir: boolean
   ): Promise<void>
   // Ruta: socideas/secciones/v1/education/normalized/{period}/{ine}.json
   ```

6. **Generación de manifiesto:**
   ```json
   {
     "period": 2024,
     "indicadores": 7,
     "municipios": {
       "procesados": 8132,
       "ok": 7820,
       "sin_datos": 200,
       "error": 112
     },
     "secciones": 154000,
     "valores": {
       "observados": 1078000,
       "nd": 2000
     },
     "bytes": 350000000,
     "timestamp": "2026-09-29T..."
   }
   ```

**Validación de prueba:**
```bash
npx tsx scripts/load-section-education.ts \
  --period=2024 \
  --ines=02003,10037,28079 \
  --verify
```

Debe devolver:
```
✅ 02003 Albacete: 17 secciones, 119 valores, 0 ND
✅ 10037 Cáceres: 12 secciones, 84 valores, 1 ND
✅ 28079 Madrid: 131 secciones, 917 valores, 0 ND
✅ Total: 160 secciones, 1120 valores
```

#### Paso 3: Carga Nacional de Educación
**Tiempo estimado:** 2-3 horas (ejecución automática)

```bash
npx tsx scripts/load-section-education.ts \
  --period=2024 \
  --all \
  --confirm-r2-write \
  --manifest
```

**Expected output:**
- 8132 municipios procesados
- ~150,000 secciones censales
- ~1,050,000 valores educativos
- Manifiesto JSON con estadísticas
- Archivos en R2 (sin duplicados, idempotente)

**Checkpoints:**
- Readback de 5 municipios aleatorios ✅
- Validación de schema ✅
- Checksum de integridad ✅
- Sin secciones duplicadas ✅

---

### FASE 4: Implementación de Política (3-5 días)

#### Paso 1: Investigación Infoelectoral
**Tiempo estimado:** 1-2 horas

**Acciones:**
1. Acceder a `https://infoelectoral.interior.gob.es/`
2. Descargar fichero municipal 2023 (nivel de mesa)
3. Analizar estructura:
   - Campos: provincia, municipio, distrito, sección, mesa, candidatura, votos
   - Geografía: ¿mesa sencilla o hay secciones?
   - Candidaturas: ¿identificador único?
   - Formato: CSV, XML?
4. Documentar cambios 2019→2023 si existen

**Ficheros de referencia:**
- Municipales 2023: `https://infoelectoral.interior.gob.es/es/elecciones-celebradas/datos-abiertos/`
- Descargar por provincia o nacional

#### Paso 2: Parser y Agregación Mesa→Sección
**Tiempo estimado:** 4-6 horas

**Crear en:** `src/lib/ine-elections-secciones.ts`

**Funciones necesarias:**
```typescript
interface MesaElectoral {
  provinciaCode: string
  municipioCode: string
  distritoCode: string
  seccionCode: string
  mesaCode: string
  censusTotal: number
  voters: number
  validVotes: number
  blankVotes: number
  nullVotes: number
  candidacyResults: Map<string, number> // candidacyId → votes
}

function parsearMesas(csvTexto: string): MesaElectoral[]
// CSV de mesas → objetos MesaElectoral

function agregarPorSeccion(mesas: MesaElectoral[]): Map<string, {
  census: number
  voters: number
  validVotes: number
  blankVotes: number
  nullVotes: number
  candidacies: Map<string, number> // candidacyId → votes
  mesasOrigen: string[]
}>
// Agregar mesas por CUSEC (provinciaCode + municipioCode + distritoCode + seccionCode)

function calcularIndicadores(seccion: AgregadaSeccion): {
  participation: number
  abstention: number
  candidacyPercentages: Map<string, number>
  winner: { candidacyId: string, votes: number, percentage: number }
  runnerUp: { candidacyId: string, votes: number, percentage: number } | null
  margin: number
  blankPercentage: number
  nullPercentage: number
}
// A partir de sumas, calcular porcentajes y ganador
```

**Reglas críticas:**
- ✅ Nunca promediar porcentajes (sumar primero, luego dividir)
- ✅ Conservar lista de mesas de origen
- ✅ Detectar empates (dos candidaturas con igual # de votos)
- ✅ Validar: votos = válidos + blancos + nulos
- ✅ Manejar casos con 0 votos válidos (evitar div by zero)

#### Paso 3: Normalización de Candidaturas
**Archivo:** `src/lib/elections-candidacy-catalog.ts` (NUEVO)
**Tiempo estimado:** 2-3 horas

**Estructura:**
```typescript
interface CandidacyRegistry {
  id: string // Único en cada elección
  name: string // Nombre oficial (ej. "Partido Popular")
  acronym: string // Siglas (ej. "PP")
  electionDate: string // 2023-05-28
  type: 'party' | 'local' | 'coalition'
  color: string // Hex para mapa
  politicalFamily?: string // Ej. "centro-derecha" (opcional, solo para comparación histórica)
}

// Catálogo centralizado por elección
export const CANDIDACIES_2023_MUNICIPAL: CandidacyRegistry[] = [
  { id: "pp", name: "Partido Popular", acronym: "PP", ..., color: "#0066CC" },
  { id: "psoe", name: "PSOE", acronym: "PSOE", ..., color: "#EE1A33" },
  ...
]
```

**Importante:**
- No fusionar candidaturas automáticamente
- Conservar candidaturas locales (pueden ser únicas por municipio)
- Documentar correspondencias entre convocatorias históricas

#### Paso 4: Loader de Política (stub → real)
**Archivo:** `scripts/load-section-elections.ts` (reemplazar)
**Tiempo estimado:** 6-8 horas

**Estructura similar a educación:**
```bash
npx tsx scripts/load-section-elections.ts \
  --type=municipal \
  --date=2023-05-28 \
  --all \
  --confirm-r2-write \
  --manifest
```

**Pasos:**
1. Descargar fichero nacional (municipales 2023)
2. Parsear mesas
3. Agregar por sección
4. Validar sumas vs. municipales oficiales
5. Cruzar geometría (detectar cambios 2019→2023)
6. Escribir en R2 (por municipio)
7. Generar manifiesto

**Validaciones críticas:**
- Suma de secciones = municipio oficial ✅
- No hay secciones duplicadas ✅
- Geometría coincide con atlas base ✅

#### Paso 5: Carga de Otras Convocatorias
**Tiempo estimado:** 10-15 horas (pero sigue el patrón anterior)

**Orden recomendado:**
1. Municipales 2023 ✅ (arriba)
2. Municipales 2019
3. Congreso 2023
4. Congreso 2019
5. Autonómicas por CA 2023
6. Autonómicas por CA 2019
7. Europeas 2024
8. Europeas 2019
9. Senado (modelo especial, requerimientos únicos)

**Cada convocatoria:**
- Descarga
- Parseo
- Agregación
- Validación
- Escritura en R2
- Manifiesto

---

### FASE 5: Integración UI Política (2-3 días)

#### Paso 1: Componente Political Extension (similar a Education)
**Archivo:** `src/components/socideas/SeccionesPoliticalExtension.tsx` (NUEVO)
**Tiempo estimado:** 2-3 horas

Similar a `SeccionesEducationExtension`:
- Carga datos políticos desde R2 (o local dev)
- Expande atlas con candidaturas e indicadores políticos
- Maneja la lógica de "indicador categórico" (ganador) vs. "continuo" (porcentajes)

#### Paso 2: Manejo de Indicadores Categóricos
**Tiempo estimado:** 2 horas

**En `SeccionesAtlas.tsx`:**
- Detectar `indicador.valueType === 'categorical'`
- Desactivar cuantiles, intervalos iguales, Jenks
- Mostrar leyenda categórica (por candidatura, # secciones)
- Permitir empates en tooltip

**En `SeccionesAtlasMap.tsx`:**
- Si categórico: usar colores por candidatura (no rampa)
- Si continuo: usar rampa secuencial
- Si divergente: usar rampa divergente

#### Paso 3: Tooltip y Tabla Política
**Tiempo estimado:** 2-3 horas

**Tooltip adicional para política:**
```
Sección: 0200301001
Distrito: 00
Mesas: 2
Censo: 1500
Votantes: 900
Participación: 60%

Ganador: Partido Popular (PP)
Votos: 350 (38.9% de válidos)

Segunda: PSOE
Votos: 280 (31.1%)

Margen: 7.8 pp
Votos blancos: 5 (0.6%)
Votos nulos: 3 (0.3%)
```

**Tabla política:**
- Columnas: Sección, Distrito, Mesas, Censo, Votantes, Participación, Ganador, % Ganador, Segunda, Margen
- Ordenable, filtrable

---

### FASE 6: Pruebas y QA (1-2 días)

#### Paso 1: Pruebas Unitarias
```bash
npm test -- socideas-secciones-education.test.ts
npm test -- socideas-secciones-political.test.ts
npm test -- elections-candidacy-catalog.test.ts
```

#### Paso 2: Pruebas de Integración (Playwright)
```bash
npx playwright test education-sections.spec.ts
npx playwright test political-sections.spec.ts
```

**Scenarios:**
- Cargar sección con educación
- Cambiar indicador educativo
- Cambiar período
- Exportar PNG
- Cargar sección con política
- Seleccionar elección
- Cambiar indicador político
- Cambiar candidatura

#### Paso 3: Captura de Pantallas (QA Visual)
Generar todas las capturas mencionadas en la especificación.

#### Paso 4: Build Production
```bash
npm run build
```

**Verificar:**
- ✅ 0 errores TypeScript
- ✅ 0 warnings
- ✅ Bundle size OK
- ✅ No hay datos sensibles expuestos

---

## 5. INSTRUCCIONES TÉCNICAS CRÍTICAS

### 5.1 Reglas de Integración de Datos

**EDUCACIÓN:**
- Numerador y denominador SIEMPRE se guardan si están disponibles
- ND se representa como `{ value: null, status: 'no_difundido' }`, NUNCA como `0`
- Porcentajes se calculan DESPUÉS de sumar (no se promedian)
- Población base es siempre "15 años o más" en nivel educativo
- Cada indicador debe tener definición de denominador explícita

**POLÍTICA:**
- Votos se suman SIEMPRE (mesa → sección) en este orden: censo, votantes, válidos, blancos, nulos, por candidatura
- Porcentajes se calculan POST-SUM (válidos de sección / votos válidos de sección × 100)
- Empates se marcan explícitamente en `tie: true`, no se rompen arbitrariamente
- Candidaturas se conservan con ID de fuente + nombres originales
- Geometría electoral puede diferir año a año; se documenta correspondencia

### 5.2 Rutas R2 Finales (Convención)

```
socideas/secciones/v1/municipal/{ine}.json
  → Atlas base (economía + demografía) [EXISTENTE]

socideas/secciones/v1/education/
  ├─ catalog.json
  │   [Catálogo nacional de indicadores educativos]
  ├─ normalized/
  │   └─ {period}/
  │       ├─ 02003.json   (Albacete, período 2024)
  │       ├─ 10037.json   (Cáceres)
  │       └─ ...

socideas/secciones/v1/political/
  ├─ catalog.json
  │   [Catálogo nacional de elecciones]
  ├─ candidacies/
  │   ├─ municipal/
  │   │   └─ 2023-05-28.json
  │   ├─ congress/
  │   │   └─ 2023-07-23.json
  │   └─ ...
  └─ normalized/
      ├─ municipal/
      │   └─ 2023-05-28/
      │       ├─ 02003.json
      │       └─ ...
      ├─ congress/
      │   └─ 2023-07-23/
      │       └─ ...
      └─ ...
```

### 5.3 Variables de Entorno (Development)

```bash
# .env.local

# R2
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=...
NEXT_PUBLIC_SOCIDEAS_R2_BASE=https://pub-ecf1b1fd05e54263b2c664384c92c7b4.r2.dev

# Local development: datos de prueba en /tmp/test-education-data/
# (automático si NODE_ENV === 'development')
```

### 5.4 Flags de Ejecución del Loader

**Educación:**
```bash
# Dry-run (no escribe)
npx tsx scripts/load-section-education.ts --period=2024

# Con específicos
npx tsx scripts/load-section-education.ts --period=2024 --ines=02003,10037,28079 --verify

# Nacional
npx tsx scripts/load-section-education.ts \
  --period=2024 \
  --all \
  --write \
  --confirm-r2-write \
  --verify \
  --manifest

# Reanudar desde fallidos
npx tsx scripts/load-section-education.ts \
  --period=2024 \
  --all \
  --resume \
  --write \
  --confirm-r2-write
```

### 5.5 Contratos de Geometría

**EDUCACIÓN:**
- Geometría del año del Censo (2024)
- Secciones censales (CUSEC 10 dígitos)
- Coincidencia perfecta con atlas base

**POLÍTICA:**
- Geometría electoral del año de elección (2023, 2019, etc.)
- Puede diferir de censo; se documenta correspondencia
- Status: `exact`, `exact_code_temporal_mismatch`, `documented_crosswalk`, `unresolved`
- Solo publicar si `correspondence_status !== 'unresolved'`

---

## 6. LISTA DE ARCHIVOS Y SU ESTADO

### Creados/Modificados Esta Sesión

| Archivo | Estado | Tipo | Acción Siguiente |
|---------|--------|------|------------------|
| `src/lib/socideas-secciones.ts` | ✅ Completado | Modificación | Verificar referencias exhaustivas |
| `src/lib/socideas-secciones-education.ts` | ✅ Completado | Creación | Usar en parser real |
| `src/lib/socideas-secciones-political.ts` | ✅ Completado | Creación | Usar en parser real |
| `src/lib/socideas-secciones-education-store.ts` | ✅ Completado | Creación | Usar en API/componente |
| `src/lib/socideas-secciones-political-store.ts` | ✅ Completado | Creación | Usar en API/componente |
| `src/lib/socideas-test-data-local.ts` | ✅ Completado | Creación | Remover antes de prod |
| `src/components/socideas/SeccionesIndicadorBuscador.tsx` | ✅ Completado | Modificación | Nada, ya funciona |
| `src/components/socideas/SeccionesEducationExtension.tsx` | ✅ Completado | Creación | Integrar en SeccionesAtlas |
| `scripts/load-section-education.ts` | 🟡 Stub | Creación | Implementar real |
| `scripts/load-section-elections.ts` | 🟡 Stub | Creación | Implementar real |
| `scripts/generate-education-test-data.ts` | ✅ Completado | Creación | Remover antes de prod |

### Datos

| Ruta | Estado | Contenido |
|------|--------|----------|
| `tmp/test-education-data/02003-education-2024.json` | ✅ Disponible | 17 secciones, 119 valores |
| `tmp/test-education-data/10037-education-2024.json` | ✅ Disponible | 12 secciones, 84 valores |
| `tmp/test-education-data/28079-education-2024.json` | ✅ Disponible | 131 secciones, 917 valores |

### No Modificados pero Relevantes

| Archivo | Razón |
|---------|-------|
| `src/components/socideas/SeccionesAtlas.tsx` | Será modificado en Fase 2 |
| `src/app/api/socideas/secciones/[codigoINE]/route.ts` | Será modificado en Fase 2 (agregar lógica educación/política) |
| `src/lib/socideas-secciones-store.ts` | Puede reutilizarse como referencia |
| `scripts/load-secciones-atlas.ts` | Referencia para patrón de loader |

---

## 7. NOTAS IMPORTANTES

### Sobre la Especificación Original

La especificación en `/pasted_content id="81c3"` es **COMPLETA y VINCULANTE**. Incluye:
- 41 puntos sobre arquitectura, ingesta, UI y pruebas
- Reglas exhaustivas de ND, supresión, confidencialidad
- Indicadores específicos (nivel educativo, participación electoral, etc.)
- Mensajes de error exactos
- Requisitos de responsive y dark mode
- Geometrías y correspondencias

**Referencia:** Si en algún momento hay dudas, consultar los puntos 1-41 de esa especificación.

### Decisiones Tomadas (Que se pueden revisar)

1. **Indicadores educativos iniciales: 7 (no 11)**
   - Se incluyeron los más básicos y verificables
   - Otros (máster, doctorado) se pueden agregar cuando la fuente los proporcione
   - Justificación: mantener alcance inicial manejable

2. **Política: municipales 2023 primero**
   - Es la convocatoria más reciente y con mayor cobertura
   - Patrón establecido → fácil replicar para 2019, Congreso, etc.

3. **Datos de prueba locales en dev**
   - Evita dependencia de R2 en desarrollo
   - Más rápido iterar
   - Se limpian antes de producción

4. **SeccionesEducationExtension como componente separado**
   - Evita complejidad en SeccionesAtlas
   - Reutilizable (igual patrón para Política)
   - Fácil de desactivar/debuguear

### Conocimientos Previos Necesarios

El siguiente agente debe estar familiarizado con:
- ✅ Next.js 15+ (App Router)
- ✅ TypeScript avanzado (tipos genéricos, narrowing)
- ✅ React Hooks (useCallback, useMemo, useTransition)
- ✅ Leaflet / GIS (mapas coropléticos)
- ✅ Estructura INE (CSV jaxiT3, códigos territoriales)
- ✅ S3/R2 (lectura y escritura de objetos JSON)
- ✅ git (commits, branches, rebase)
- ✅ Playwright (pruebas E2E)

### Riesgos Identificados

| Riesgo | Mitígación |
|--------|-----------|
| Tabla Censo educativa no encontrada o no publica por sección | Verificar en fase 3.1; si no existe, usar otra fuente (Laborales, EAPN) |
| Infoelectoral no tiene desglose por mesa en algunos años | Documentar cobertura; bloquear municipios sin datos |
| Geometrías electorales diferentes 2019→2023 | Calcular correspondencias; marcar como "unresolved" si no existe |
| Tamaño de archivo R2 excesivo | Usar formato compacto (como atlas); comprimir JSON |
| Candidaturas locales variadas por municipio | Normalizar en catálogo centralizado; no descartar las locales |

---

## 8. CONTACTO Y ESCALADAS

**Puntos de decisión que requieren escalada al usuario (Ideas Medioambientales):**

1. **¿Cuál es la tabla exacta del Censo 2024 para educación?**
   - Si no existe, ¿usar Censo 2021?
   - ¿O esperar a siguiente Censo?

2. **¿Todas las CCAA publican resultados electorales por mesa?**
   - Infoelectoral: SÍ para municipales
   - Autonómicas: varía por CA

3. **¿Senado necesita modelo especial en esta fase?**
   - O dejarlo para Fase 5?

4. **Cobertura nacional: ¿bloquear si algún municipio no tiene datos?**
   - O publicar parcial documentando cobertura?

---

## 9. PRÓXIMOS PASOS INMEDIATOS

Para el siguiente agente que continúe este trabajo:

1. **Antes de hacer nada:**
   ```bash
   git log --oneline | head -20  # Ver commits de esta sesión
   npm run build                  # Verificar que todo compila
   npm run dev                    # Levantar dev server
   ```

2. **Verificar que los datos de prueba están presentes:**
   ```bash
   ls -lh tmp/test-education-data/
   ```

3. **Iniciar con Fase 2:**
   - Integrar `SeccionesEducationExtension` en `SeccionesAtlas`
   - Hacer pruebas visuales en Albacete
   - Capturar pantallas
   - Documentar blockers

4. **Consultas al usuario (Ideas Medioambientales):**
   - Confirmar tabla Censo educativa exacta
   - Confirmar cobertura esperada de Infoelectoral

---

## RESUMEN EJECUTIVO

| Aspecto | Estado |
|--------|--------|
| **Arquitectura** | ✅ Definida y validada |
| **Contratos (tipos)** | ✅ Completados y compilables |
| **Infraestructura** | ✅ Rutas R2, helpers, almacenamiento |
| **Datos de prueba** | ✅ Generados (Albacete, Cáceres, Madrid) |
| **UI: Temas** | ✅ "Educación" y "Política" visibles |
| **Integración UI** | 🟡 Comenzada (component listo, no integrado) |
| **Loaders reales** | ❌ No iniciados (stubs solo) |
| **Carga nacional** | ❌ No iniciada |
| **Pruebas visuales** | ❌ No ejecutadas |
| **Compilación** | ✅ 0 errores |

**Tiempo invertido esta sesión:** ~6 horas  
**Tiempo estimado para completar todo:** 15-20 días (5 fases de ~3-4 días cada una)  
**Critical path:** Loader educación real → Carga nacional → Pruebas UI  

---

**Fin del documento. Listo para handoff.**
