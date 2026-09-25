# PR — feat(visual): rediseño integral IDEAS Sostenibilidad con el sistema IMA

> Título: **feat(visual): rediseño integral IDEAS Sostenibilidad con el sistema IMA**
> Rama: `feat/rediseno-visual` → `main`
> Crear en: https://github.com/colivasbon/URBIdeas/pull/new/feat/rediseno-visual

---

## Resumen

Rediseño de la capa visual completa de la plataforma (todas las rutas públicas) con el sistema de identidad IMA: tokens como fuente única de verdad, Poppins latin-ext, componentes base únicos con estados completos, cabecera clara accesible y verificación automatizada.

**Informe completo:** `design-audit/INFORME.md` · **Auditoría previa:** `design-audit/00-auditoria.md`

## Qué incluye

- **Tokens** (`src/app/globals.css`): escalas OKLab generadas y verificadas (musgo, conífera, carbón, rupestre, limo, crisopa), semánticos de superficie/texto/borde/acción/estado, tipografía `clamp`, sombras tintadas, movimiento y z-index. Remapeo de tokens heredados para que los ~90 componentes adopten la identidad sin reescribirse.
- **Tipografía**: Poppins con `latin + latin-ext`, `display: swap` y fallback de sistema.
- **Componentes base**: Button (6 estados, loading sin CLS), Badge (mapeo cerrado), Card, Input, Modal (focus trap y retorno de foco), EmptyState, PageShell, Breadcrumbs, KpiNumber (conteo accesible) y SectionReveal.
- **Layout**: cabecera clara con blur al scrollear, indicador deslizante en conífera, drawer móvil con focus trap/Esc/stagger; footer único en musgo con retama como único acento; card de módulo con un solo enlace.
- **Rutas**: home, /urbideas, /urbideas/municipios, /urbideas/legislacion, /socideas y /socideas/como-funciona rediseñadas; mapa y filtros migrados a tokens; **404/error/loading globales** nuevos; **/design-system** (noindex) para validación del equipo.
- **Codificación**: corrección de mojibake UTF-8 (erratas evidentes) en copy visible de 160+ archivos.

## Verificación

| Métrica | Antes | Después |
| --- | --- | --- |
| axe-core (WCAG 2.0/2.1/2.2 AA, 7 rutas) | 9 violaciones / 90 nodos | **0 violaciones** |
| Contraste de tokens | — | Matriz completa verificada (`node design-audit/verify-contrast.mjs`) |
| Build | — | `npm run build` sin errores |

- 42 capturas before/after (375/768/1440) en `design-audit/before|after`.
- Sin cambios en lógica de negocio, fetching, rutas ni contratos de datos.
- Sin dependencias nuevas de runtime.

## Desviaciones justificadas (detalle en el informe)

1. CTA `:active` mantiene conífera-600 + `translateY(1px)` (conífera-700 con texto carbón-900 da 3,25:1 y falla AA).
2. CTA en modo oscuro mantiene conífera + carbón-900 (hueso sobre conífera-700 = 4,38:1).
3. Opacidades del footer subidas del 80 % al 94–100 % para cumplir 4,5:1.
4. `--border-default` usa limo-700 (limo puro no alcanza 3:1 para componentes UI).
5. Sin gradientes, parallax ni glassmorphism (blur solo en cabecera, permitido); retícula por patrón SVG.

## Pendientes (requieren decisión humana)

- Lighthouse móvil (no ejecutable en el entorno de trabajo; comando propuesto en el informe).
- Logo negativo/monocromo para el footer (no existe el activo).
- Migración del set de iconos a lucide-react y pasada fina del panel del mapa.
- Copy mejorable detectado, no modificado.
