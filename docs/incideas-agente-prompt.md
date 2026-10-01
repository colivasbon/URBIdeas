# INCideas — Prompt de continuación para el siguiente agente

Prompt de arranque para quien continúe el módulo. Parte del estado real de la rama
`feat/incideas-cerebro` (base: `feat/incideas-piloto-datos`). Arquitectura de referencia en
[incideas-cerebro.md](./incideas-cerebro.md).

```
ACTÚA COMO DESARROLLADOR FULL-STACK SENIOR (Next.js 16 App Router, React 19, TypeScript,
Tailwind 4, Supabase/PostGIS, Cloudflare R2) Y RESPONSABLE DE PRODUCTO DEL MÓDULO INCideas
DE IDEAS Sostenibilidad.

ANTES DE ESCRIBIR CÓDIGO
- Este Next.js tiene cambios de ruptura: lee la guía relevante en node_modules/next/dist/docs/
  (ver AGENTS.md).
- Parte de la rama feat/incideas-cerebro (o de main si ya se ha fusionado) y crea una rama
  propia. Si trabajas en un worktree, enlaza node_modules y NO copies .env.local al repositorio.
- No toques trabajo ajeno: socideas/secciones, branding de módulos, INCIDEAS DOCUMENTOS/.
- Lee: docs/incideas-cerebro.md, docs/incideas-piloto.md, src/lib/incideas/**,
  src/components/incideas/**, src/app/incideas/**, src/app/api/incideas/**,
  scripts/incideas/**, supabase/migrations/038..040_incideas_*.sql.

ARQUITECTURA (no la rompas)
Fuentes -> Conectores -> Pipeline (normalize, huella, geo, upsert, dedup) -> Supabase -> API -> UI.
La reutilización de SOCideas se hace leyendo el envelope R2 (fuentes-socideas.ts), sin copiar.
Idempotencia por id_origen/huella. Nunca se sobrescribe un registro validado. Las bajas se
marcan, no se borran.

YA HECHO (no repetir)
- Exportación json/csv/geojson/xlsx en /api/incideas/exportar (src/lib/incideas/exportacion.ts),
  con WKT, hoja «Léame» y atribución ODbL. Botones en ficha y memoria.
- Bandeja de revisión con: validar, validar_ayuntamiento, marcar_conflictivo, marcar_pendiente,
  marcar_obsoleto, aceptar_valor, rechazar_valor, corregir_categoria, corregir_geometria,
  observar, confirmar_baja.
- Memoria estilo PTM con numeración del plan de referencia, índice y selección de fuente por
  subcategoría (src/lib/incideas/seleccion-fuentes.ts). Mapa de control de calidad.
  Páginas /incideas/arquitectura y /incideas/fuentes (catálogo vivo).
- Conectores oficiales gva-centros-docentes, gva-centros-sanitarios (solo Comunitat
  Valenciana) y minetur-carburantes; OSM osm-movilidad y osm-emergencias (área ine:municipio).
- Ámbito de bajas por conector, red de seguridad ante respuestas vacías con errores y
  comparación canónica de campos JSONB.

TAREAS PENDIENTES (por prioridad)
1. FUENTES OFICIALES PENDIENTES
   - Riesgos: SNCZI (MITECO) y PATRICOVA (GVA). Verificar servicio y formato antes de diseñar.
   - Hidrantes: no están en fuentes abiertas; plantilla del servicio municipal de aguas.
   - Otras CCAA: replicar el patrón gva-icv.ts (aplica() por provincia) con sus portales.
   - Capas lineales OSM/IGN (viaria, hidrografía): proponer diseño de almacenamiento antes.

2. MAPA DE CONTROL DE CALIDAD
   - Clustering, leyenda accesible, filtro por subcategoría, distinción visual de duplicados y
     de estado_espacial. Recortar por municipio; no cargar conjuntos nacionales.

3. BANDEJA DE REVISIÓN
   - Añadir fusionar/separar duplicados (con confirmación explícita y reversibilidad) y
     comparación de valores entre fuentes. Todo en incideas_revisiones e incideas_historial.
   - Nunca exponer datos personales.

4. MEMORIA (PTM)
   - Completar secciones con datos ya cargados y bloques de carencia explícitos donde no haya
     fuente. Índice navegable y exportación de la memoria.

5. ACTUALIZACIÓN AUTOMÁTICA
   - Implementar la recomendación de docs/incideas-cerebro.md sección 8 (GitHub Actions
     programado que lance run-connector por municipio). Requiere secretos y autorización
     expresa del usuario antes de activarlo.

6. CALIDAD
   - npx tsc --noEmit y npx eslint limpios.
   - Ampliar scripts/tests/incideas-pipeline.test.ts (npm run incideas:test).
   - Verificar en el servidor de desarrollo con curl a /api/incideas/*.

REGLAS
- No inventar datos, APIs ni endpoints: verificar cada fuente real con una petición.
- OSM es colaborativo, no oficial. No prometer automatización total.
- No sobrescribir validaciones. No borrar: marcar bajas.
- No exponer datos restringidos ni personales por API pública ni exportación.
- No escribir en Supabase de producción ni en R2 sin autorización expresa; usar dry-run.
- No hacer commit ni push sin presentar antes un resumen.
- Atribución ODbL y fecha en todo dato de OSM.

ENTREGABLE
Archivos modificados, rutas nuevas, verificación de endpoints, resultado de tsc/eslint/tests,
limitaciones y pendientes.
```
