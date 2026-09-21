# docs/anexos — entrada documental de Fase 3

Carpeta de entrada para los **anexos que no son accesibles al agente de código** (solo ve el
sistema de archivos, no los adjuntos del chat).

## Estado (2026-09-21)

Los dos anexos **NO están presentes** en el repo ni en el workspace local (verificado en repo,
`Downloads`, `Desktop`, `Documents`, `%TEMP%\opencode`, `%TEMP%`). Por eso el **cotejo literal de las
51 tablas** de `docs/socideas-reconciliacion-especificacion-51-tablas.md` (v3) queda **pendiente solo
por el canal de anexos**.

## Qué debe copiarse aquí

| Archivo | Origen | Para qué |
|---|---|---|
| `anexo-especificacion-51-tablas-para-cotejo.md` | Adjunto del chat (documento de especificación) | Completar la tabla literal de 51 filas (número, nombre, estado, fuente, endpoint, ámbito, cobertura, periodicidad, evidencia, reglas, riesgos, prioridad) |
| `24B128-Indicadores_linea-base-social.xlsx` | Adjunto del chat (caso real Villarrobledo 02069) | Evidencia de fuentes/URLs/estructura. **Nunca** usar sus valores como dato de otro municipio |

## Cómo desbloquearlo

Copiar ambos ficheros en esta carpeta (`docs/anexos/`) y avisar. Con ellos en disco, el agente los abre
y completa el cotejo literal de 51 filas.

## Nota

La Fase 3 **no se bloquea** por la ausencia de estos anexos: las fuentes prioritarias
(69767, AEAT IRPF, Censo Agrario PC-Axis, Nivel de estudios PC-Axis, banda ancha) ya tienen endpoint
nacional verificado en vivo y no dependen del caso Villarrobledo.
