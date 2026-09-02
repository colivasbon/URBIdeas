---
name: territorial-intelligence-redesign
description: Rediseña Urb Ideas como una plataforma premium de exploración, consulta y análisis territorial. Úsala cuando se pida elevar la calidad visual, rehacer la interfaz completa, eliminar el aspecto de dashboard genérico o construir una experiencia editorial, cartográfica y profesional.
---

# Territorial Intelligence Redesign

## Propósito

Transformar Urb Ideas en una experiencia digital de alta calidad percibida, sobria, precisa y visualmente distintiva.

La plataforma debe sentirse como una herramienta profesional de consulta y exploración: contemporánea, editorial, clara y fiable. No debe parecer un dashboard SaaS genérico, una plantilla administrativa ni una interfaz generada automáticamente.

Mantener intactas todas las funcionalidades actuales: rutas, datos, filtros, formularios, autenticación, lógica de negocio, llamadas API, visualizaciones, mapas, capas, tablas y comportamiento responsive.

## Dirección artística

La identidad visual debe combinar:

- diseño editorial contemporáneo
- sistemas de información profesional
- cartografía y exploración de datos
- sobriedad institucional moderna
- precisión técnica sin apariencia fría o burocrática
- sensación de producto cuidado y diseñado a medida

Buscar una estética limpia, con peso tipográfico, composiciones amplias, ritmo vertical y contraste controlado.

No buscar una estética futurista genérica, oscura por defecto, llena de neones, cristal translúcido, degradados azules o morados, sombras exageradas ni efectos decorativos continuos.

## Principios visuales

- Reducir al mínimo las tarjetas repetidas.
- Evitar bordes alrededor de todos los elementos.
- Usar separación, alineación, contraste y espacio en lugar de cajas dentro de cajas.
- Reservar las superficies con fondo o borde para contenido realmente independiente.
- Dar importancia al contenido central: una búsqueda, un mapa, una ficha, una tabla o una acción principal.
- Crear jerarquías claras: título, contexto, acción, datos principales, detalle.
- Usar una paleta contenida con una base neutra y uno o dos colores de acento.
- Evitar los degradados genéricos de interfaces SaaS.
- Mantener contraste suficiente y lectura cómoda en pantallas grandes y móviles.
- Diseñar interfaces que transmitan calma, precisión, fiabilidad y calidad.

## Tipografía

- Establecer una jerarquía tipográfica marcada y consistente.
- Usar títulos con presencia editorial, sin convertir cada bloque en un titular gigante.
- Usar textos de interfaz compactos, claros y legibles.
- Diferenciar con claridad: navegación, etiquetas, títulos, datos, ayuda, metadatos y acciones.
- Evitar texto excesivamente pequeño, gris débil o densidad visual innecesaria.
- Tratar números, fechas, categorías y localizaciones como información importante, no como texto secundario sin estructura.

## Reglas de composición

- Crear una retícula sólida y consistente.
- Usar espacios amplios entre secciones importantes.
- Reducir la fragmentación visual.
- Crear zonas de lectura y trabajo reconocibles.
- No centrar todos los bloques por defecto.
- Alinear los elementos a una lógica funcional, no solo decorativa.
- Permitir que una pantalla tenga una pieza principal clara.
- Usar asimetría controlada cuando aporte interés, especialmente en páginas de detalle, exploración o presentación.
- Diseñar cabeceras que den contexto, no solo una fila de título y botones.

## Mapas, resultados y datos

Cuando haya mapas, capas, filtros, resultados, listados o indicadores:

- El mapa debe sentirse como una superficie de trabajo central, no como un widget encerrado en una tarjeta.
- Los controles deben estar ordenados, tener jerarquía y ocupar únicamente el espacio necesario.
- No superponer controles innecesarios sobre el mapa.
- Hacer visibles el contexto, la escala, las capas activas y los resultados relevantes.
- Los listados y tablas deben parecer herramientas profesionales de consulta.
- Usar filas, columnas, tipografía y espacio para organizar datos antes que tarjetas individuales.
- Diseñar estados de carga, vacío, error y sin resultados de forma útil y elegante.
- Mantener filtros cerca del contenido que modifican.
- Dar prioridad a la legibilidad y rapidez de consulta.

## Reglas para paneles y dashboards

- No convertir cada métrica en una tarjeta.
- Destacar una métrica, tendencia o tarea principal cuando sea relevante.
- Integrar métricas secundarias con discreción.
- Mostrar información operativa mediante estructura visual, no mediante decoración.
- Reducir iconos decorativos.
- Evitar gráficos sin propósito o métricas falsas.
- Usar gráficos solo cuando ayuden a tomar una decisión o entender una evolución.
- Diseñar tablas compactas, ordenadas y fáciles de escanear.

## Navegación

- Diseñar una navegación tranquila, clara y persistente.
- Reducir elementos de navegación redundantes.
- Diferenciar de forma inequívoca la sección actual.
- Mantener las acciones importantes accesibles sin saturar la cabecera.
- En móvil, conservar el acceso a las funciones esenciales sin trasladar toda la complejidad a menús ocultos.

## Interacciones y movimiento

Aplicar animaciones discretas, funcionales y rápidas.

- Duración habitual entre 150 y 250 milisegundos.
- Transiciones suaves en paneles, filtros, cambios de vista y elementos interactivos.
- Estados hover y focus visibles pero sobrios.
- Evitar animaciones continuas, rebotes, efectos llamativos o movimientos que distraigan.
- Respetar prefers-reduced-motion.
- Cada animación debe comunicar una acción, una relación espacial o un cambio de estado.

## Método de ejecución

1. Inspeccionar primero toda la aplicación.
2. Identificar componentes repetidos, estilos heredados, pantallas principales y elementos funcionales críticos.
3. Proponer un plan breve con:
   - pantallas que se rediseñarán
   - nueva dirección visual
   - componentes que se unificarán
   - elementos que se conservarán por funcionalidad
4. Aplicar primero el sistema visual global:
   - colores
   - fuentes
   - escalas de espaciado
   - botones
   - campos
   - tablas
   - modales
   - navegación
   - estados interactivos
5. Rediseñar las páginas principales, no solo la pantalla inicial.
6. Revisar versión móvil, escritorio, estados vacíos, carga, errores y accesibilidad.
7. Eliminar estilos duplicados, clases obsoletas y elementos decorativos que ya no aporten valor.

## Restricciones

- No romper ninguna funcionalidad existente.
- No inventar contenido, resultados, cifras, registros ni gráficos.
- No añadir dependencias grandes si no son imprescindibles.
- No reemplazar componentes funcionales por maquetas estáticas.
- No eliminar filtros, controles, búsquedas, tablas, mapas o acciones sin verificar primero su función.
- No usar una estética de plantilla SaaS.
- No abusar de tarjetas, sombras, gradientes, bordes o transparencia.
- No aplicar un modo oscuro si no existe una decisión clara de producto para ello.

## Resultado esperado

El resultado debe parecer una plataforma profesional consolidada y visualmente cuidada, con identidad propia.

Debe transmitir:
- claridad
- autoridad
- utilidad
- precisión
- modernidad sobria
- calidad editorial
- confianza

Al terminar, indicar de forma sencilla:
- qué pantallas y componentes se han rediseñado
- qué elementos funcionales se han mantenido
- qué mejoras visuales y de usabilidad se han aplicado
- cualquier detalle que requiera una decisión del usuario
