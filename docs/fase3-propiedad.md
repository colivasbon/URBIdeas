# Fase 3 — Propiedad de archivos y contratos compartidos

> Integrador: único que toca contratos compartidos (con aviso). Cada agente o
> fase trabaja en sus rutas; nadie edita las de otro. Rama de trabajo:
> `feat/incideas-hidrografia` (fase 3 sin fusionar ni desplegar).

## 1. Propiedad

| Responsable | Rutas propias | Prohibido tocar |
|---|---|---|
| Integrador | `docs/fase3-*`, `supabase/migrations/04[2-9]_incideas_fase3*`, `src/lib/incideas/fase3/`, `scripts/incideas/fase3/`, `scripts/tests/incideas-fase3*`, `src/app/incideas/**`, `MEMORIA.md` (solo § fase 3) | `src/components/socideas/*`, resto de SOCideas |
| B Catálogo y documento | `tmp/agente-b/`, `docs/fase3-matriz-bloques.md` (contenido; la estructura la fija el integrador) | Contratos, esquema |
| C Fuentes nacionales | `tmp/agente-c/`, `scripts/incideas/fase3/conectores/*` (cada conector su fichero) | Conectores de otro |
| D Autonómicas y locales | `tmp/agente-d/`, `scripts/incideas/fase3/conectores/autonomicas/*` | Nacionales |
| E Geometría y territorio | `src/lib/incideas/fase3/geo.*`, reutiliza Fase 2A sin modificarla | `scripts/incideas/fase2a/*` (congelado) |
| F Datos y almacenamiento | Migraciones (propone; aplica el integrador), `scripts/incideas/fase3/cargas/*`, `scripts/incideas/medir-r2.ts` | Datos de producción sin dry-run |
| G Producto web | `src/app/incideas/**` (páginas y componentes bajo esa ruta) | API SOCideas |
| H Exportaciones | `src/lib/incideas/fase3/exportar-bloques.*`, reutiliza estilo SOCideas sin copiarlo | `src/lib/socideas-xlsx*` |
| I Aportación municipal | `scripts/incideas/fase3/plantillas/*`, `salida/plantillas/` | Tablas de inventario |
| J QA adversarial | `scripts/tests/incideas-fase3*` (lectura de todo, escritura solo ahí) | Código de producto |
| Fase 2A (congelada) | `scripts/incideas/fase2a/*`, `scripts/tests/fase2a-contrato.test.ts`, `docs/fase2a-*` | Nadie la modifica en fase 3 |

## 2. Contratos compartidos (los cambia solo el integrador)

1. `docs/fase2a-contrato.md` — estados de consulta, ejes, procedencia (congelado; la fase 3 lo extiende, no lo reescribe).
2. `docs/fase3-contrato-bloques.md` (este paquete): bloques, estados por municipio y bloque, snapshot, R2/Supabase.
3. Clave territorial única: `municipios.codigo_ine` (`character(5)`).
4. Tres circuitos separados: oficial-automático / calculado-reproducible / aportado. Nunca se mezclan en un mismo campo.
5. `municipios.poblacion`: sin escribir hasta la auditoría §6 (solo lectura para el diagnóstico).

## 3. Reglas de entrega entre agentes

- Toda cifra cruza con evidencia (URL, hash, edición). Sin evidencia no hay «verificada».
- Cada hito termina con revisión de J; J bloquea con motivo escrito.
- Commits con rutas explícitas; jamás `git add .`. Sin push/merge/despliegue sin orden expresa.
