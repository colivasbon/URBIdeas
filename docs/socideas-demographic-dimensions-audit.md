# SOCideas — Auditoría de dimensiones demográficas

Fecha: 2026-09-06 · Rama: `feat/urbideas-premium-editorial-ui`
Prohibido en esta fase: escribir R2/Supabase, migraciones, batch real, afirmar
filtros disponibles, crear selectores visibles sin datos. Nada de “población nativa”.

## 1. Matriz por dimensión

| Dimensión | Categorías exactas de fuente | Fuente oficial | Tabla/API | Año | Escala | Código de join | Cobertura | Secreto estadístico | Existe en SOCideas | Apta para carga |
|---|---|---|---|---|---|---|---|---|---|---|
| sexo | Total, Hombres, Mujeres | INE · Padrón/DPOP (Tempus3) | Tablas DPOP provinciales ya integradas | Serie anual (corte H/M: último publicado) | Municipio (+prov/CCAA/ESP en total) | INE 5 dígitos (verificado) | Total: todos; H/M: publicados | No aplica al corte publicado | **Sí** (corte anual + comparativa por sexo) | Sí (ya cargada; sin acción) |
| edad | Tramos quinquenales 0-4 … 95-99, 100+ (publicados) | INE · Padrón (tabla 33570) | 33570 ya integrada | Año de pirámide | Municipio | INE 5 dígitos (verificado) | Todos | Tramos con 0 son recuento real, no supresión | **Sí** (pirámide + índices derivados documentados) | Sí (ya cargada; agrupaciones solo con fórmula y tramos completos) |
| nacionalidad | Nacionalidad española; Nacionalidad extranjera (+ detalle solo si se publica sin secreto) | INE · Censo 2021 / Padrón por nacionalidad | **Por verificar: sin ID inventado** | Por verificar | Municipio (sección: futuro) | INE 5 dígitos (patrón del proyecto) | Por verificar (dry-run) | Probable supresión en municipios pequeños | **No** | **No todavía**: requiere validación |
| país de nacimiento | Nacida en España; Nacida en el extranjero (+ país/región solo si se publica sin secreto) | INE · Censo 2021 | **Por verificar: sin ID inventado** | Por verificar | Municipio (sección: futuro) | INE 5 dígitos | Por verificar (dry-run) | Probable supresión | **No** | **No todavía**: requiere validación. Nunca “extranjero” = “nacida fuera” |
| relación nacimiento-residencia | Mismo municipio; Otro municipio de la misma provincia; Otra provincia de la misma CCAA; Otra CCAA; Nacida en el extranjero (categorías candidatas, a confirmar contra fuente) | INE · Censo 2021 | **Por verificar: sin ID inventado** | Por verificar | Municipio (sección: futuro) | INE 5 dígitos | Por verificar (dry-run) | Probable supresión | **No** | **No todavía**: requiere validación. No mezclar con nacionalidad ni país |

## 2. Registro de capacidades (implementar en `socideas-demographic-dimensions.ts`)

```ts
type DemographicDimensionCapability = {
  id: 'sex' | 'age_group' | 'nationality' | 'birth_country' | 'birth_residence_relation'
  label: string
  source: string
  period: string
  territoryLevel: 'municipio' | 'seccion'
  sourceTable: string
  categories: string[]
  coverageRule: string
  confidentialityRule?: string
  loadStatus: 'available' | 'prepared' | 'requires-validation' | 'without-coverage'
}
```

Estados iniciales honestos: `sex`/`age_group` → `available` (ya integradas, sin
selectores nuevos); `nationality`/`birth_country`/`birth_residence_relation` →
`requires-validation` (nada cargado, ningún selector visible).

## 3. Pipeline dry-run (permitido: parser, normalizador, validador, informe)

Script `scripts/dry-run-demographic-dimensions.ts`: parser CSV genérico INE
(marca de secreto `.`/`..`/`ND`/vacío → null+flag, nunca 0), normalizador a filas
candidatas, validador (INE-5, año, cobertura, secreto), informe por municipio
muestra (02003 grande, 02069 medio, 28143 pequeño, 02065 posible secreto) contra
el envelope REAL (solo lectura): qué dimensiones existen hoy (ninguna nueva),
tamaño adicional estimado (filas hipotéticas × ~120 B, etiquetado como estimado),
recomendación por dimensión. Sin escrituras, sin cambios visibles, sin selectores.
