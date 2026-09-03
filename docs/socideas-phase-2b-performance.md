# Rendimiento Fase 2B — presupuesto y plan de medición

## 1. Presupuesto

- JSON municipal: base demográfica ~55 KB; **tope +150 KB por bloque económico amplio** (medido con `JSON.stringify(envelope).length` antes de `putMunicipioJson`). Estimación: +25-60 KB. Si se supera: detener y documentar (no subir).
- Ficha: 1 lectura R2 + territorio + último run (igual que hoy; Economía no añade lecturas). Sin llamadas a fuentes oficiales en lectura ordinaria.
- Sync económico (1 municipio): AEAT xlsx (1 descarga/ejercicio, reutilizable en lote) + ADRH CSV (1-2 descargas) + Tempus3 4721 con `tv=` (1-2 llamadas) + comparativas 53688 (reutilizables) + Censo Agrario CSV (1 descarga). Timeouts 15-30 s + 1 reintento; `maxDuration` 180 s como el sync actual.

## 2. Tabla de medición (syncs 2026-09-03/04, 169 registros/municipio, 0 errores)

| Municipio | JSON antes (B) | JSON después (B) | Añadido (B) | Sync (s) | Estado |
|---|---|---|---|---|---|
| 02069 La Roda | 55.072 | 66.984 | 11.912 | 54 | partial (AEAT + CA-detalle pendientes) |
| 02081 Villarrobledo | 55.194 | 67.126 | 11.932 | 49 | partial (idem) |
| 02003 Albacete | 55.928 | 67.920 | 11.992 | 50 | partial (idem) |
| 41091 Sevilla | 56.817 | 68.867 | 12.050 | 55 | partial (idem) |
| 50297 Zaragoza | 18.385* | 21.669 | 3.284 | 56 | partial (idem) |
| 15078 Santiago | 55.958 | 67.939 | 11.981 | 35 | partial (idem) |

*Zaragoza traía un JSON demográfico previo más ligero (sin pirámide completa); se preservó íntegro.
Desglose por fuente (La Roda): ADRH 96 (municipal 54 + comparativas 42), DIRCE 70, Censo Agrario 3. Tope 150 KB: holgura ×12.

## 3. Riesgos y medidas

- DIRCE 4721 sin filtro (>5 MB) → siempre `tv=` por municipio; si Tempus3 limita, paginar y registrar.
- AEAT xlsx multi-municipio en memoria → parsear una vez por proceso (caché como `warmProvinceCatalog`), filtrar por municipio.
- Secciones: proxy con filtro municipal + simplificación + caché 24 h; sin precarga.
- Cliente: sin librerías nuevas; SVG propios; Leaflet solo en secciones bajo demanda.

## 4. Recomendación para una futura carga nacional económica

Por lotes reanudables como `sync-all-municipios.ts` (provincias por cuartos, pausa entre municipios, caché de catálogos/ficheros por proceso, `--stale` por año de referencia), tras validar los 6 municipios de prueba y con autorización expresa. Nunca desde la interfaz ni en una sola ejecución.
