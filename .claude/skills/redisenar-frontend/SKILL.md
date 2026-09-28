---
name: redisenar-frontend
description: Coordina el rediseño integral de una aplicación web existente, desde la auditoría hasta la implementación y la validación visual, sin alterar datos ni publicar.
disable-model-invocation: true
---

# Rediseño integral de frontend

Trabaja sobre el repositorio actual. No te detengas en un plan: implementa y verifica el rediseño dentro del alcance autorizado. El usuario no debe hacer tareas de programación. Comunica en español, de forma sobria y sin jerga innecesaria.

## Alcance y seguridad

- Antes de editar, examina instrucciones del proyecto, estado de Git, estructura, rutas, dependencias, componentes, estilos y forma de ejecutar la aplicación. Registra cambios previos del usuario y no los sobrescribas.
- Define el alcance según la petición. Si pide «rediseño total», abarca páginas, estados y recorridos existentes; no cambies reglas de negocio, datos, permisos, APIs, autenticación, pagos, almacenamiento, infraestructura o SEO funcional salvo que sea imprescindible para mantenerlos intactos.
- No instales dependencias sin justificación y autorización previa. No leas ni muestres secretos innecesarios. No cambies producción ni despliegues ni hagas push. Si el trabajo requiere algo fuera de este alcance, indícalo y continúa con lo que sí está permitido.
- No borres contenido real para facilitar el diseño. Mantén enlaces, rutas, títulos y metadatos importantes. Conserva comportamiento de formularios, buscadores, mapas, tablas, filtros y exportaciones.

## Orden de trabajo

1. Lee íntegros `.claude/skills/auditoria-frontend/SKILL.md` y `.claude/skills/direccion-visual/SKILL.md`. Sigue sus criterios y documenta un diagnóstico breve, un inventario de pantallas y una dirección visual específica del producto.
2. Lee `.claude/skills/sistema-diseno/SKILL.md` y define un sistema coherente de color, tipografía, espaciado, componentes, estados e interacción. Aprovecha los elementos valiosos que ya existan.
3. Implementa por etapas lógicas: estructura y navegación; páginas principales; páginas interiores; estados de carga, vacío y error; móvil; detalles. Evita pasar de pantalla sin corregir incoherencias visibles.
4. Lee `.claude/skills/movimiento-accesible/SKILL.md` y aplica sus límites a animaciones, fondos, contraste y accesibilidad.
5. Lee `.claude/skills/qa-frontend/SKILL.md`; ejecuta validaciones de código y, si hay navegador disponible, prueba recorridos y captura imágenes de escritorio y móvil. Itera tras detectar fallos.
6. Entrega una relación concreta de pantallas intervenidas, decisiones adoptadas, pruebas realizadas con sus resultados reales, problemas pendientes y cambios no realizados por seguridad.

Si existen skills externas como `frontend-design`, `design-taste-frontend`, `critique`, `polish` o `web-design-guidelines`, aprovéchalas según su disponibilidad como apoyo, nunca como sustituto del briefing real ni de estas salvaguardas. Comprueba si están disponibles antes de invocarlas. No afirmes que se han usado si no ha ocurrido.

## Criterio de aceptación

El producto conserva todas las funciones y se percibe como un único sistema visual en las rutas principales y secundarias. No hay elementos superpuestos, desbordamientos, navegación rota, placeholders ficticios ni degradación evidente en móvil. El diseño es distinguible del de una plantilla genérica por decisiones vinculadas al contenido y a los usuarios reales. Las verificaciones fallidas quedan identificadas sin disimulo. No publiques ni hagas push sin orden posterior explícita.
