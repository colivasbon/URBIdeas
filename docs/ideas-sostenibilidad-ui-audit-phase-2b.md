# Auditoría UI Fase 2B — IDEAS Sostenibilidad / SOCideas

## 1. Problemas detectados

1. **Landing (`/`)**: tres `ModuleCard` idénticas en peso visual ("tres tarjetas iguales"); hero genérico con dos párrafos casi redundantes; jerarquía plataforma→área→módulos débil; SOCideas marcada "Próximo módulo" cuando ya es beta funcional.
2. **Ficha SOCideas**: cabecera correcta pero sin cápsula de categorías (llegará Demografía/Economía/Secciones); filtros dispersos por bloque; tablas bien (copiables) pero estilo mínimo; estados `pending` como texto plano.
3. **SOCideas hub**: buscador presente pero sin foco visual dominante; sección de fuentes correcta.
4. **Asistencias**: lista plana sin jerarquía; enlaces correctos.
5. **Tablas/gráficos**: SVG sin leyenda de unidades en algún caso; sin roles de color por tipo de dato (municipal vs comparativa vs estructural).
6. **Header/Footer**: sólidos; header con buen estado activo. Footer correcto, ampliable con nota de fuentes.
7. **Tokens**: paleta corporativa (verde bosque `#3E665C`, lima `#86B73D`, ocre `#E8C547`) bien definida; faltan **roles semánticos** (superficie elevada, estados, datos) → se añaden como alias sobre la paleta existente, sin cambiar identidad. URBideas usa los mismos tokens: solo adiciones, ningún cambio de valor.

## 2. Sistema visual propuesto (roles sobre variables existentes)

| Rol | Token | Uso |
|---|---|---|
| Fondo general | `--color-dark-bg` / light | página |
| Superficie | `--color-card-bg` | tarjetas |
| Elevado | `--color-dark-bg-elevated` | cabeceras de tabla sticky, popovers |
| Borde / sutil | `--color-border` / `--color-border-subtle` | contenedores |
| Texto 1/2/3 | `--color-text-primary/secondary/muted` | jerarquía |
| Marca | `--color-primary` | acciones principales |
| Interacción | `--color-secondary` | enlaces activos, foco, datos municipales |
| `ok` | `--color-success` | validado |
| `partial` | `--color-warning` | parcial/estructural-histórico |
| `pending` | texto tenue + borde punteado | pendiente/deliberado |
| `error` | `--color-error` | error |
| Comparativas | `--color-primary`, `#b7791f`, tenue | provincia, CCAA, España |
| Estructural | ocre `--color-accent` + etiqueta de año | Censo 2020, datos no anuales |

Nuevas clases utilitarias (en `globals.css`): `.ideas-eyebrow` (kicker), `.ideas-h2`, `.ideas-card`, `.ideas-status[data-state]`, `.ideas-table` (tablas copiables con sticky header y scroll-x), `.ideas-tabs` (cápsula de categorías). Tipografía: Poppins existente; escala `12/14/16/20/24/30/36` con tracking estrecho en H1.

## 3. Cambios aplicados (en esta fase)

- Landing: hero con dato útil (nº municipios + fuentes), módulos con peso diferenciado (URBideas disponible / SOCideas beta con acceso directo al buscador / Asistencias), sección "La plataforma" compactada.
- SOCideas hub: buscador como foco (título + subtítulo + caja elevada), nota de cobertura con estados por categoría.
- Ficha: cabecera compacta (nombre, provincia·CCAA·INE de un vistazo, fecha sync), cápsula Demografía/Economía accesible (`role=tablist`, `aria-selected`, teclado), enlace Secciones censales; bloques economía con la jerarquía prescrita; tarjetas de estado `StatusCard`; tablas `.ideas-table`; SVG con leyenda+unidad+año.
- Secciones: misma identidad, mapa bajo demanda.
- Responsive: `max-w-7xl`, grids `1→sm:2/3→xl:5` existentes; tablas con `overflow-x-auto`; tabs con scroll horizontal en móvil; zonas táctiles ≥40 px.
- Accesibilidad: foco visible global ya existente; se añade `aria` en tabs/estados/gráficos (`role=img` + `aria-label` con resumen), sin color como único indicador (etiqueta textual siempre).
- Rendimiento: cero dependencias nuevas; sin imágenes; Leaflet solo en secciones.

## 4. Componentes afectados

`PlatformHeader` (sin cambios salvo correctos), `ModuleCard` (variante destacada), nuevos `CategoryTabs`, `StatusCard`, `EconomySection`, `SeccionesMap`; `StatCard/EvolutionChart/PyramidChart/Traceability` (leyendas y roles, sin rediseño destructivo); `page.tsx` (landing), `socideas/page.tsx`, `socideas/[codigoINE]/page.tsx`, `asistencias/page.tsx` (retoques menores).

## 5. No hacer

Sin fotos de stock, sin mapas decorativos, sin gradientes agresivos, sin librerías de UI/charts, sin rediseño de URBideas.
