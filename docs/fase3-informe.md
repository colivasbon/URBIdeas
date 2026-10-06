# INCideas Fase 3 — Informe de misión (hitos 0–2, 5–6; J aprueba)

## Alcance entregado

Plataforma nacional en estructura y con la Fase 1 cargada en 6 municipios de
distinto tamaño, comunidad, insularidad y costa/interior (Benidorm, Murcia,
Lagrán, Santa Cruz de Tenerife, Pamplona/Iruña, Ceuta). Las 142 tablas del
documento quedan clasificadas en `docs/fase3-matriz-bloques.md` (0 sin regla)
y la Fase 4 habilitada con plantillas + validador (`salida/plantillas/`).

## Cifras reales

- Supabase: 6 tablas nuevas (~248 KB). Total BD ~178/500 MB. R2 Fase 3:
  44 objetos / 2,93 MB. R2 total 2,97 GB.
- Control: 40+ filas (64 pares planificados, 64/64 lote final). Snapshot
  aprobada `incideas:snap:e92540e4be4df78`.
- Pruebas: Fase 2A 20/20, Fase 3 8/8, libro 30/30, aceptación 27/27, QA 0
  bloqueos (7 iniciales, todos corregidos: R2 de hidro/inundabilidad Fase 2A,
  metadatos fuera de objetos, heurística de privacidad precisada).
- Web: `next build` compila; ficha de bloques, panel de cobertura, descarga
  XLSX/CSV/JSON y revalidación verificados contra servidor local.
- Población: auditoría sin escritura; `municipios.poblacion` intacta
  (propuesta de migración reversible pendiente de orden).

## Arquitectura y costes

Tres circuitos separados; procedencia+fecha+versión+evidencia por campo;
conflictos conservados. Estimación nacional documentada en el contrato.
Sin costes nuevos: todo en plan free + R2 existente.

## Pendiente de orden expresa

Push, fusión con `main`, despliegue, corrección de `municipios.poblacion`,
ampliación de Fase 2/3 por lotes, designaciones operativas. Commit local
preparado (rutas explícitas abajo), sin crear.

```sh
git add package.json MEMORIA.md docs/fase2a-contrato.md docs/informe-fase2a-benidorm-murcia.md docs/fase3-propiedad.md docs/fase3-contrato-bloques.md docs/fase3-matriz-bloques.md docs/fase3-hito0.md docs/fase3-hito1.md docs/fase3-hito2.md docs/fase3-auditoria-poblacion.md supabase/migrations/042_incideas_fase3_catalogo.sql supabase/migrations/042_incideas_fase3_catalogo_down.sql supabase/migrations/043_incideas_fase3_control.sql supabase/migrations/043_incideas_fase3_control_down.sql supabase/migrations/044_incideas_fase3_aportes.sql supabase/migrations/044_incideas_fase3_aportes_down.sql supabase/migrations/045_incideas_fase3_lectura.sql supabase/migrations/045_incideas_fase3_lectura_down.sql scripts/incideas/fase2a scripts/incideas/fase3 scripts/incideas/medir-r2.ts scripts/tests/fase2a-contrato.test.ts scripts/tests/incideas-fase3-muestra.test.ts scripts/tests/incideas-fase3-qa.ts src/lib/incideas/fase3 src/app/incideas/cobertura "src/app/incideas/[codigoINE]/bloques" src/app/api/incideas/bloques
git commit -m "feat(incideas): fase 2A hidrográfica y fase 3 (plataforma nacional, muestra Fase 1)"
```

Quedan fuera a propósito: `src/components/socideas/SeccionesAtlas.tsx`
(modificación ajena previa) y `scripts/incideas/qa-word-hidrografia.ts`
(no seguido previo). `salida/`, `tmp/` e `INCIDEAS DOCUMENTOS/` no se
versionan.
