# Hito 1 — Contratos y plataforma de cargas

## Esquema (migraciones 042–045, reversibles, ensayadas en `ensayo`)

`incideas_bloques` (25) + `incideas_fuentes_nac` (16): no se tocó la
`incideas_fuentes` existente (otro registro, otra forma). `incideas_cobertura`
(control por municipio×bloque×fuente×edición), `incideas_snapshots`,
`incideas_entidades` (solo designadas/aportadas) y `incideas_aportaciones`.
045 abre lectura pública (sin datos personales en estas tablas). Ensayo:
DDL + semillas + FK + upsert + `DOWN` ejecutados y revertidos; `ensayo`
devuelto a su estado previo. Aplicadas a `public`: 042–045 (tablas nuevas,
cero alteraciones).

## Reparto y snapshot

R2 `incideas/…`: originales por fuente+edición+municipio con checksum, capas,
exports y plantillas. Supabase: índices + control + snapshots. Estimación
nacional: cobertura ~100k filas (20–30 MB, cabe); entidades masivas a R2
(límites ~1 GB y tramos ~1,6 GB si fueran todos con geometría: se guardan
recortes y se sirve simplificado). Snapshot `incideas:snap:<hash>` de
ediciones+recuentos+algoritmo; web y exports leen la misma aprobada.

## Panel y actualización

`/incideas/cobertura` (matriz por bloque y estado) y
`/incideas/[codigoINE]/bloques` (fuente, edición, fecha, motivo; descarga y
actualización arriba a la derecha). Actualización: programada por fuente +
manual por par (`--solo`, H7) + revalidación ligera web en bloques rápidos;
un fallo no borra y se registra.
