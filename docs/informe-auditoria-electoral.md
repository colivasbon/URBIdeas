# Informe de Auditoría y Reparación — Integración de Datos Electorales

**Agente**: A — Política y datos electorales  
**Fecha**: 2026-09-28  
**Proyecto**: SOCideas (URBIdeas)

---

## 1. Resumen ejecutivo

La integración de datos electorales tiene un **problema de ejecución, no de código**: el script de carga `load-elections-muni2023.ts` nunca se ha ejecutado con `--write`, por lo que **ningún municipio tiene datos electorales en R2**. El XLSX oficial de Infoelectoral sí incluye datos completos para Alcalá del Júcar (02007) y el resto de municipios >250 hab.

**Hallazgo principal**: Alcalá del Júcar (02007) tiene datos oficiales verificables en el XLSX >250 hab (979 electores, 812 votantes, 82.9% participación, PSOE 582 votos/7 concejales, PP 209 votos/2 concejales), pero no están en R2 porque la carga no se ha ejecutado.

---

## 2. Archivos tocados

| Archivo | Tipo | Cambios |
|---------|------|---------|
| `scripts/verify-electoral-coverage.ts` | **NUEVO** | Script de verificación de cobertura electoral en R2 |
| `scripts/load-elections-muni2023-v2.ts` | **NUEVO** | Versión mejorada del script de carga con verificación de cobertura |
| `docs/contrato-datos-electorales.md` | **NUEVO** | Documento de contrato de datos electorales |

**Archivos compartidos (NO modificados)**:
- `src/lib/socideas-elections.ts` — Correcto, no requiere cambios
- `src/lib/socideas-electoral-provincial.ts` — Correcto, no requiere cambios
- `src/lib/socideas-electoral-provincial-store.ts` — Correcto, no requiere cambios
- `src/lib/socideas-electoral-export.ts` — Correcto, no requiere cambios

---

## 3. Contrato de datos (nuevo)

Se ha creado `docs/contrato-datos-electorales.md` que documenta:

1. **Ámbitos y granularidad**: Municipio vs Circunscripción
2. **Fuentes oficiales**: URLs, fechas de verificación, licencias
3. **Indicadores**: Slugs, nombres, unidades, ámbitos
4. **Carga de datos**: Comandos para carga y verificación
5. **Limitaciones conocidas**: ≤250 hab, carga no ejecutada, etc.

### Reglas de oro verificadas

| Regla | Estado | Evidencia |
|-------|--------|-----------|
| Municipio ≠ Circunscripción | ✅ Cumplido | `ambito: "municipio"` en dimensiones; `circunscripcion` en payloads provinciales |
| Congreso ≠ Senado | ✅ Cumplido | Claves distintas en bundle (`congreso` y `senado` separados) |
| Escaños no se atribuyen al municipio | ✅ Cumplido | `elec_concejales` es municipal; `escanos` de Congreso/Senado/Cortes es de circunscripción |
| Ausencia ≠ 0 | ✅ Cumplido | `null` se pinta como ND, nunca 0 |

---

## 4. Fuentes verificadas

| Fuente | URL | Verificación | Licencia |
|--------|-----|--------------|----------|
| Infoelectoral >250 hab | https://descargas.interior.gob.es/datasets/resultados_electorales/Elecciones-a-municipios-de-mas-de-250-hab.xlsx | 2026-09-16 (HTTP 200, 36.505.355 bytes) | CC BY 4.0 |
| Infoelectoral ≤250 hab | https://descargas.interior.gob.es/datasets/resultados_electorales/Elecciones-a-municipios-de-hasta-250-hab.xlsx | 2026-09-16 (HTTP 200, 11.352.481 bytes) | CC BY 4.0 |
| Datos Abiertos CLM | https://datosabiertos.castillalamancha.es/sites/datosabiertos.castillalamancha.es/files/Resultados_CLM_2023.xlsx | 2026-09-25 | CC BY-SA |
| Senado 2023 | https://infoelectoral.interior.gob.es/estaticos/docxl/apliextr/03202307_TOTA.zip | 2026-09-25 | CC BY 4.0 |
| Congreso 2023 | https://descargas.interior.gob.es/datasets/resultados_electorales/Elecciones-Congreso.xlsx | 2026-09-25 | CC BY 4.0 |

---

## 5. Pruebas ejecutadas

### 5.1 Verificación de cobertura electoral

```bash
npx tsx scripts/verify-electoral-coverage.ts 02007 28079 45090 08019
```

**Resultado**:
```
FALTA 02007 Alcalá del Júcar: 0/1092 electorales, ámbito=ND [sin_datos_electorales]
FALTA 28079 Madrid: 0/1139 electorales, ámbito=ND [sin_datos_electorales]
FALTA 45090 Manzaneque: 0/1086 electorales, ámbito=ND [sin_datos_electorales]
FALTA 08019 Barcelona: 0/1145 electorales, ámbito=ND [sin_datos_electorales]
```

**Conclusión**: Ningún municipio tiene datos electorales en R2. El problema es de ejecución, no de código.

### 5.2 Parseo del XLSX >250 hab

```bash
npx tsx scripts/load-elections-muni2023.ts --parse-only --codes=02007
```

**Resultado**:
```
[fase1] convocatoria 2023-05-28 (excel 45074): 75010 filas
[fase1] total=1 observed=1 missing=0 (missing honesto scope_hasta250, nunca 0)
[fase1] KB min/mediana/max: 2/2/2 | total 1.9 KB | superan 150KB: 0
```

**Conclusión**: El XLSX incluye datos de 02007. El parseo funciona correctamente.

### 5.3 Serie histórica municipal

```bash
npx tsx scripts/qa-fixtures-elecciones-serie.ts 02007
```

**Resultado**: 12 convocatorias (1979-2023), todas completas. 2023: 2 candidaturas, 9 concejales, 979 censo, 812 votantes, 82.9% participación.

### 5.4 Dry-run 10 municipios

```bash
npx tsx scripts/dry-run-elections-sample.ts
```

**Resultado**: 10/10 municipios con datos electorales válidos.

---

## 6. Ejemplo de datos: Alcalá del Júcar (02007)

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

- **Está en R2**: Sí (1092 valores demográficos/económicos)
- **Tiene datos electorales**: No (0 valores `elec_*`)
- **Causa**: El script de carga no se ha ejecutado con `--write`

### Serie histórica (12 convocatorias, 1979-2023)

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

---

## 7. Limitaciones y riesgos

### 7.1 Limitaciones conocidas

1. **Municipios ≤250 hab**: No tienen datos electorales en el XLSX >250 hab. El XLSX ≤250 hab tiene grano candidato (no candidatura) y sin participación. **Fuera del alcance MVP**.

2. **Carga no ejecutada**: El script `load-elections-muni2023.ts` no se ha ejecutado con `--write`, por lo que ningún municipio tiene datos electorales en R2. **Requiere ejecución manual con credenciales R2**.

3. **Autonómicas**: Solo están integradas para Castilla-La Mancha (Toledo). Otras CCAA requieren fuentes específicas.

4. **Congreso/Senado**: Solo están integrados para Toledo. Otras provincias requieren carga adicional.

### 7.2 Riesgos

1. **Riesgo de sobrescritura**: Si se ejecuta `--write` sin `--force`, los municipios con datos electorales previos no se sobrescriben. **Mitigación**: El script verifica el manifest antes de escribir.

2. **Riesgo de presupuesto**: Algunos municipios grandes pueden superar el presupuesto de 150 KB. **Mitigación**: El script verifica el tamaño antes de escribir.

3. **Riesgo de datos desactualizados**: El XLSX local puede no estar actualizado. **Mitigación**: El script verifica la fecha de la convocatoria.

### 7.3 Próximos pasos recomendados

1. **Ejecutar la carga**: `npx tsx scripts/load-elections-muni2023.ts --write --limit 500 --offset 0` (requiere credenciales R2)
2. **Verificar la cobertura**: `npx tsx scripts/verify-electoral-coverage.ts --all`
3. **Ampliar autonómicas**: Integrar otras CCAA (Andalucía, Madrid, etc.)
4. **Ampliar Congreso/Senado**: Integrar otras provincias

---

## 8. Conclusión

El código de integración electoral es **correcto y está bien diseñado**. El problema es que **no se ha ejecutado la carga**. Para que Alcalá del Júcar (02007) y el resto de municipios muestren datos electorales en la ficha, es necesario ejecutar el script de carga con `--write` y las credenciales R2 correspondientes.

**No se requiere ningún cambio en el código de producción**. Solo es necesario ejecutar el pipeline de carga.
