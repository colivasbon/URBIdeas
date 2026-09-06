# Auditoría visual territorial

Rama: `feat/urbideas-premium-editorial-ui`.
HEAD auditado: `248269f` (incluye `28e5fc5` y `248269f` sobre `05222e2`).
Fecha: 2026-09-06.
Método: inspección de código (sin render en navegador; lo visual se califica
como deducido del código, no como observado). No se modificó la interfaz.

## Resumen ejecutivo

1. El estado real auditado es `248269f`, no `05222e2`: hay dos commits territoriales encima.
2. Las curvas son effectively invisibles por opacidad compuesta: path (0,10–0,26) × capa (0,9/0,95) × contenedor `.editorial-hero__decor` (0,5) → 0,045–0,12 real.
3. El grid de home cubre ~2/3 del ancho: máscara al 100% hasta el 38%, transparente recién en el 68%.
4. La transición 28–68% es una superposición competida, no un fundido, justo detrás del texto centrado.
5. El macizo "este" es un nido de 8 óvalos concéntricos (mismo centro, squash 0,82 uniforme, oscilación ±16px): se leerá como blob/óvalo, no como relieve.
6. `preserveAspectRatio="xMidYMid slice"` destruye la composición en extremos: en desktop apaisado recorta ~1/3 vertical (macizo sudoeste `cy=990` desaparece); en móvil 390px recorta laterales (este amputado, sudoeste invisible).
7. URBideas declara solo-curvas en código, pero el único macizo visible está al 74% del ancho: 60% izquierdo vacío.
8. SOCideas declara grid-only, pero el buscador está FUERA del hero (hero = solo texto; card en la sección siguiente, con doble padding entre ambos).
9. Asistencias repite literalmente el grid de SOCideas (`decor` por defecto = `variant="grid"`). Sin identidad propia.
10. El parallax (10/18/12px en todo el scroll del hero) es prácticamente imperceptible; el problema es de composición estática, no de movimiento.

## Evaluación por página

### Home — severidad: alta (bloqueante para la transición)
- Qué funciona: arquitectura (`decor` por página, componentes reutilizables, sin dependencias, `aria-hidden`, sin listeners cuando es estático), textos y marca intactos, fallback `@supports` con máscaras.
- Qué no funciona: grid hasta el 68%; curvas a ~0,05–0,12 efectivas; nido de 8 óvalos a la derecha; contenido 100% centrado y simétrico contra fondo asimétrico; cifras (`data-card`) flotando sin anclaje; hero alto (`lg:py-20`) con el peso abajo.
- Recomendación: contenido a la izquierda (`max-w-2xl/3xl`), opacidad efectiva de curvas ~0,18–0,30 en el tercio derecho, fundido del grid completo antes del 55%, cifras ancladas con hairline/franja inferior, macizo principal al ~80–85% del ancho.

### URBideas — severidad: alta
- Qué funciona: solo curvas en código, cero grid; CTAs e indicadores intactos.
- Qué no funciona: vacío izquierdo; 8 anillos concéntricos = óvalo; opacidad ~0,05–0,12 sobre `#1A1D1B` con mineral `#3E665C`; slice amputa el macizo inferior en desktop y deja el móvil casi sin curvas.
- Recomendación: 3 macizos reequilibrados (derecha 70–85%, inferior-izquierda con arcos visibles, uno menor alto-izquierda), zona tranquila central 40–60%, opacidad efectiva 0,15–0,28, excentricidad real por macizo.

### SOCideas — severidad: media-alta
- Qué funciona: grid-only real, estático, recto, quiet zone radial, contraste de texto correcto.
- Qué no funciona: menor 28px a ~4,5% efectiva ≈ invisible (queda un mayor 140px grueso y vacío: ~3–4 líneas por hero); buscador fuera del hero; doble padding texto→búsqueda; eyebrow + 2 pills + título + lede = 4 capas de microtexto.
- Recomendación: buscador DENTRO del hero (o solape robusto sin absoluto frágil), menor 20–24px a ~0,06–0,08 efectiva, una sola capa entre lede y buscador, quiet zone residual 60–65%.

### Asistencias — severidad: media
- Qué funciona: coherencia de shell, textos intactos.
- Qué no funciona: fondo idéntico a SOCideas; hero `py-10/sm:py-14` para 3 líneas; lista "Próximamente" = filas con pill repetida, sin identidad.
- Recomendación: variante sobria propia (retícula mayor-only tenue, sin quiet zone radial), hero `py-8/sm:py-10`, índice editorial 01–05 con hairlines y etiqueta secundaria. Sin curvas.

### Fichas SOCideas — severidad: baja
- Sin hero territorial; fuera del alcance de fondos. Si cambian tokens globales, conservar contraste; no rediseñar bloques funcionales.

## Diagnóstico de grid

- Implementación actual: solo CSS, 4 `repeating-linear-gradient` (`globals.css`): mayor 140px a `color-mix(mineral 16%)`, menor 28px a `color-mix(mineral 9%)`; cero nodos DOM; `will-change: transform`.
- Escala: en hero de ~500px caben ~3,5 celdas mayores → trama gruesa y vacía; la menor (~4,5% efectiva) está bajo el umbral perceptivo.
- Opacidad: mayor ~8% efectiva, menor ~4,5%; quiet zone de SOCideas vela el centro al 42%: el grid desaparece donde debería enmarcar el título.
- Composición: `rotate: -1,2deg + scale: 1,04` en home (compone bien con el `translate3d` del JS, sin bug) inclina líneas que deberían leerse técnicas tras texto centrado.
- Corrección: menor 20–24px a 6–8% efectivo, mayor 120px a 10–14%; fundido completo antes del 55% en home; quiet zone residual 60–65% en SOCideas; sin `rotate` (o ≤0,5°) en home.

## Diagnóstico de curvas de nivel

- Implementación actual: 19 paths en 3 macizos, bucles cerrados solo-`C`, semilla fija, sin filtros; sin cruces por construcción. La parte "segura" es correcta; la expresiva, no.
- Geométricos: mismo centro + squash 0,82 uniforme + 8 anillos + oscilación ±16px fijos (~5% del radio) = óvalo tímido, sin valles/depresiones.
- Composición: este (1190,370) choca con texto centrado; sudoeste (110,990) invisible en apaisado; noreste testimonial y oculto en móvil por CSS.
- Escala: `slice` en 1440×520 muestra solo y∈[161,739] (sudoeste fuera); en 390×700 solo x∈[550,1051] (este amputado). La composición solo existe en ~1280–1440×800.
- Contraste: 0,045–0,12 efectivo. Invisible en la práctica.
- Corrección: 3 macizos con 6–8 / 2–4 / 4–5 anillos; excentricidad por macizo; oscilación 8–12% del radio variando por dirección; zona tranquila central 40–60%; opacidad efectiva 0,15–0,28 (maestras 0,30); verificar en 1920×500, 1440×650, 1280×700, 768×900, 390×700 y 320×650.

## Diagnóstico de transición home

- Cómo funciona: dos capas absolutas con máscaras 90°: grid 100%→0% entre 38–68%, curvas 0%→100% entre 28–66%, más `opacity .9` y contenedor a `.5`.
- Por qué se percibe mal: banda de solape 38–58% detrás del texto centrado; grid hasta el 68%; curvas a 0,05–0,12 no "emergen" (el ojo solo registra que el grid se apaga); el nido de óvalos aparece donde la máscara supera el 55%.
- Composición recomendada: grid 0–30% pleno / fundido 30–52% / 0% tras 52–55%; curvas 0% hasta 35–38% / rampa 38–60% / pleno 60–100%; texto a la izquierda (12–16% del ancho, `max-w-2xl/3xl`); zona tranquila 15–55% con velo radial sutil (sin panel opaco); macizo principal ~82% del ancho con arcos saliendo por el borde derecho; segundo macizo inferior-izquierdo con 2–3 arcos exteriores.

## Sistema visual

- Header: `h-14/sm:h-16`, correcto en altura pero genérico (píldora + subrayado lima redundantes); lima `#86B73D` en detalles pequeños vibra sobre oscuro → reservarla a estados/datos/`aria-current`, activo editorial con surface + hairline.
- Tipografía: display Georgia del sistema (sin webfont) correcto pero no premium; Poppins para todo lo demás; exceso de micro-mayúsculas con tracking compitiendo (eyebrow + pills + labels).
- Espaciado: heroes `py-10/14/20` + `mt-8` + secciones `py-12/16` suman demasiado aire encadenado; reducir `lg:py-20→16` y el `pt` post-hero.
- Cards: `data-card` bien calibrada; problema compositivo (flotan sin anclaje), no del componente.
- Colores: mineral `#3E665C` correcto y dominante; lima limitar a datos/estados; interactivos sobre oscuro en mineral más luminoso si el contraste lo exige. Sin rehacer paleta.
- Estados: overlay, skeletons, `EmptyState`, focos coherentes; no tocar.
- Movimiento: parallax imperceptible por diseño; `reduced-motion` correcto (CSS + no-listener). No añadir animación.
- Mobile: transición vertical definida; riesgo sin confirmar: hero casi sin curvas por `slice`, H1 `text-4xl` y cifras `min-w-40` a 320px (posible scroll horizontal).

## Plan de corrección priorizado

### P0 — Obligatorio antes de seguir
1. Curvas a opacidad efectiva 0,15–0,28 (elevar/eliminar el `opacity: 0.5` de `.editorial-hero__decor`). Archivos: `globals.css`, `TopographicContours.tsx`. No romper: contraste de texto, reduced-motion. Aceptación: anillos legibles sin competir con el titular.
2. Recomponer macizos (3, excentricidad propia, cobertura en 6 breakpoints). Archivo: `TopographicContours.tsx`. No romper: no-intersección, ≤30 paths, determinismo, sin filtros/librerías. Aceptación: ≥2 macizos reconocibles en desktop, curvas visibles en móvil, ningún óvalo perfecto, cero cruces, zona libre para texto.
3. Transición home estrecha (grid 0/30/52, curvas 38/60) + contenido a la izquierda. Archivos: `globals.css`, `app/page.tsx`. No romper: rutas/CTAs/textos. Aceptación: tres bandas distinguibles sin corte.
4. Buscador dentro del hero de SOCideas + una sola capa entre lede y buscador. Archivo: `app/socideas/page.tsx`. No romper: `SocideasSearch`, caché, endpoints, navegación. Aceptación: distancia visual corta texto→buscador, grid legible tras inputs.

### P1 — Recomendado
5. Grid menor 20–24px / mayor 120px con 6–8% / 10–14% efectivos; quiet zone residual 60–65%.
6. Variante sobria propia para Asistencias (mayor-only tenue) + hero compacto + índice 01–05.
7. `lg:py-20→16` en home, recorte del `pt` post-hero, cifras ancladas con hairline.
8. Lima solo a datos/estados; mineral más luminoso para interactivos si el contraste lo exige.

### P2 — Ajustes finos posteriores
9. Parallax: mantener o eliminar (no ampliar); grid 8px / curvas 16px fijos.
10. Revisar `text-4xl` y `min-w-40` a 320px; evaluar serif web solo si el resto convence.

## Checklist visual para preview

- Desktop 1920×500 / 1440×650 / 1280×700: tres bandas home sin corte; ≥2 macizos; texto dominante.
- Tablet 768×900: sin solape decoración/texto; tabs y cards intactas.
- Móvil 390×700 / 320×650: sin scroll horizontal; curvas/grid reducidos pero presentes; CTA y buscador en primer scroll.
- Reduced-motion + recarga: cero desplazamiento, fondos estáticos, mismo contenido/acciones.
- Contraste de titular, lede, input, tabs y CTAs sobre las zonas más densas.
- Regresión: `/socideas/28079` y `?categoria=economia` cargan; cambio de categoría sin saltos; GeoJSON solo tras "Cargar"; botones internos tras flag; sin cambios en endpoints/R2/Supabase.
