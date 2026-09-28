# Contrato de Datos Electorales SOCideas v2.1

## 1. Ámbitos y granularidad

| Ámbito | Fuente | Granularidad | Script de carga |
|--------|--------|--------------|-----------------|
| **Municipal** | Infoelectoral >250 hab | Municipio (INE 5 dígitos) | `load-elections-muni2023.ts` |
| **Circunscripción** | Infoelectoral / Datos Abiertos CLM | Provincia (INE 2 dígitos) | `ingest-elections-toledo-2023.ts` |

### Reglas de oro

1. **Municipio ≠ Circunscripción**: Los resultados municipales son del municipio. Los resultados de Congreso/Senado/Cortes son de la circunscripción provincial.
2. **Congreso ≠ Senado**: Nunca se mezclan ni se suman. Son cámaras distintas.
3. **Escaños**: Los concejales son municipales. Los escaños de Congreso/Senado/Cortes son de circunscripción.
4. **Ausencia ≠ 0**: Un valor no publicado es `null` (se pinta ND), nunca 0.

## 2. Fuentes oficiales

### 2.1 Elecciones municipales (>250 hab)

- **Fuente**: Ministerio del Interior · Infoelectoral · Datos Abiertos
- **URL**: https://descargas.interior.gob.es/datasets/resultados_electorales/Elecciones-a-municipios-de-mas-de-250-hab.xlsx
- **Verificación**: 2026-09-16 (HTTP 200, 36.505.355 bytes, 866.576 filas)
- **Licencia**: CC BY 4.0
- **Periodicidad**: Por convocatoria (última: 2023-05-28)

### 2.2 Elecciones municipales (≤250 hab)

- **Fuente**: Ministerio del Interior · Infoelectoral · Datos Abiertos
- **URL**: https://descargas.interior.gob.es/datasets/resultados_electorales/Elecciones-a-municipios-de-hasta-250-hab.xlsx
- **Verificación**: 2026-09-16 (HTTP 200, 11.352.481 bytes)
- **Licencia**: CC BY 4.0
- **NOTA**: Fuera del alcance MVP por grano distinto (candidato, no candidatura) y sin participación.

### 2.3 Autonómicas Castilla-La Mancha 2023

- **Fuente**: Datos Abiertos de Castilla-La Mancha
- **URL**: https://datosabiertos.castillalamancha.es/sites/datosabiertos.castillalamancha.es/files/Resultados_CLM_2023.xlsx
- **Verificación**: 2026-09-25
- **Licencia**: CC BY-SA
- **Complemento**: Junta Electoral de CLM, DOCM 2023/5411 (participación provincial, escaños)

### 2.4 Senado 2023

- **Fuente**: Ministerio del Interior · Infoelectoral
- **URL**: https://infoelectoral.interior.gob.es/estaticos/docxl/apliextr/03202307_TOTA.zip
- **Verificación**: 2026-09-25
- **Licencia**: CC BY 4.0
- **Formato**: Ficheros fijos MIR 03/04/07/08 (candidato, votos, elegido)

### 2.5 Congreso 2023

- **Fuente**: Ministerio del Interior · Infoelectoral · Datos Abiertos
- **URL**: https://descargas.interior.gob.es/datasets/resultados_electorales/Elecciones-Congreso.xlsx
- **Verificación**: 2026-09-25
- **Licencia**: CC BY 4.0

## 3. Indicadores municipales

| Slug | Nombre | Unidad | Ámbito |
|------|--------|--------|--------|
| `elec_censo` | Censo electoral | personas | municipio |
| `elec_votantes` | Votantes | votos | municipio |
| `elec_participacion` | Participación electoral | % | municipio |
| `elec_votos_validos` | Votos válidos | votos | municipio |
| `elec_votos_candidaturas` | Votos a candidaturas | votos | municipio |
| `elec_votos_blanco` | Votos en blanco | votos | municipio |
| `elec_votos_nulos` | Votos nulos | votos | municipio |
| `elec_votos_candidatura` | Votos por candidatura | votos | municipio |
| `elec_concejales` | Concejales por candidatura | concejales | municipio |

## 4. Indicadores de circunscripción

### 4.1 Autonómicas (Cortes de CLM)

| Campo | Descripción | Ámbito |
|-------|-------------|--------|
| `censo` | Censo electoral | circunscripción |
| `votantes` | Votantes | circunscripción |
| `validos` | Votos válidos | circunscripción |
| `nulos` | Votos nulos | circunscripción |
| `blancos` | Votos en blanco | circunscripción |
| `escanosTotal` | Escaños de la circunscripción | circunscripción |
| `candidaturas[].votos` | Votos por candidatura | circunscripción |
| `candidaturas[].escanos` | Escaños por candidatura | circunscripción |

### 4.2 Senado

| Campo | Descripción | Ámbito |
|-------|-------------|--------|
| `censo` | Censo electoral | circunscripción |
| `nulos` | Votos nulos | circunscripción |
| `blancos` | Votos en blanco | circunscripción |
| `votosACandidaturas` | Votos a candidaturas | circunscripción |
| `candidatos[].votos` | Votos por candidato | circunscripción |
| `candidatos[].elegido` | Elegido S/N | circunscripción |

### 4.3 Congreso

| Campo | Descripción | Ámbito |
|-------|-------------|--------|
| `censo` | Censo electoral | circunscripción |
| `votantes` | Votantes | circunscripción |
| `validos` | Votos válidos | circunscripción |
| `nulos` | Votos nulos | circunscripción |
| `blancos` | Votos en blanco | circunscripción |
| `candidaturas[].votos` | Votos por candidatura | circunscripción |
| `candidaturas[].escanos` | Escaños por candidatura | circunscripción |

## 5. Carga de datos

### 5.1 Municipales

```bash
# Dry-run (sin escritura)
npx tsx scripts/load-elections-muni2023.ts --parse-only

# Carga con verificación de cobertura
npx tsx scripts/load-elections-muni2023-v2.ts --check-coverage --codes=02007,28079

# Carga real (requiere credenciales R2)
npx tsx scripts/load-elections-muni2023.ts --write --limit 500 --offset 0
```

### 5.2 Provinciales

```bash
# Genera fixtures locales
npx tsx scripts/ingest-elections-toledo-2023.ts

# Publica en R2 (requiere credenciales R2)
npx tsx scripts/publish-electoral-provincial-r2.ts --write
```

## 6. Verificación de cobertura

```bash
# Verifica si un municipio tiene datos electorales en R2
npx tsx scripts/verify-electoral-coverage.ts 02007 28079 45090

# Verifica todos los municipios
npx tsx scripts/verify-electoral-coverage.ts --all
```

## 7. Limitaciones conocidas

1. **Municipios ≤250 hab**: No tienen datos electorales en el XLSX >250 hab. El XLSX ≤250 hab tiene grano candidato (no candidatura) y sin participación. Fuera del alcance MVP.
2. **Carga no ejecutada**: El script `load-elections-muni2023.ts` no se ha ejecutado con --write, por lo que ningún municipio tiene datos electorales en R2.
3. **Autonómicas**: Solo están integradas para Castilla-La Mancha (Toledo). Otras CCAA requieren fuentes específicas.
4. **Congreso/Senado**: Solo están integrados para Toledo. Otros provincias requieren carga adicional.

## 8. Ejemplo: Alcalá del Júcar (02007)

### Datos en el XLSX >250 hab (convocatoria 2023-05-28)

| Descripción | Resultados | Concejales |
|-------------|------------|------------|
| Electores | 979 | - |
| Votantes | 812 | - |
| Votos Válidos | 802 | - |
| Votos a candidaturas | 791 | - |
| Votos en blanco | 11 | - |
| Votos nulos | 10 | - |
| PSOE | 582 | 7 |
| PP | 209 | 2 |

### Estado en R2

- **Está en R2**: Sí (1092 valores)
- **Tiene datos electorales**: No (0 valores `elec_*`)
- **Problema**: El script de carga no se ha ejecutado con --write

### Serie histórica (12 convocatorias)

| Año | Candidaturas | Concejales | Censo | Votantes | Participación |
|-----|--------------|------------|-------|----------|---------------|
| 1979 | 3 | 11 | 1626 | 1090 | 67% |
| 1983 | 2 | 9 | 1506 | 1281 | 85.1% |
| 1987 | 2 | 9 | 1525 | 1383 | 90.7% |
| 1991 | 3 | 9 | 1471 | 1299 | 88.3% |
| 1995 | 3 | 9 | 1386 | 1248 | 90% |
| 1999 | 2 | 9 | 1350 | 1142 | 84.6% |
| 2003 | 2 | 9 | 1277 | 1058 | 82.9% |
| 2007 | 2 | 9 | 1206 | 989 | 82% |
| 2011 | 2 | 9 | 1147 | 919 | 80.1% |
| 2015 | 2 | 9 | 1082 | 887 | 82% |
| 2019 | 2 | 9 | 1037 | 819 | 79% |
| 2023 | 2 | 9 | 979 | 812 | 82.9% |
