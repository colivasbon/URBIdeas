---
name: qa-frontend
description: Verifica visual y funcionalmente un rediseño web en páginas y estados reales antes de proponer su publicación.
---

# Validación final del rediseño

Primero revisa el diff: rechaza cambios accidentales en datos, permisos, autenticación, servidores, secretos y configuración de despliegue. No elimines modificaciones previas ajenas. Ejecuta los comandos de lint, tipos, pruebas y build que existan en el proyecto; registra literalmente cuáles se ejecutaron y si pasaron. No inventes pruebas inexistentes ni instales herramientas sin permiso.

Si hay navegador accesible, abre la app real o una vista local: prueba como mínimo portada, un recorrido representativo por cada área, una página con datos, formulario o buscador, y estados disponibles de vacío, carga y error. Revisa escritorio, móvil y anchura intermedia; comprueba navegación, controles, enlaces, ausencia de scroll horizontal accidental, foco visible y preferencia de movimiento reducido. Usa capturas para comparar y corrige las incidencias antes de cerrar. Si no hay navegador, declara expresamente que no se ha validado visualmente.

Revisa que los cambios no perjudiquen títulos, metadatos, contenido indexable ni comportamiento de las rutas. Si hay métricas disponibles, compara rendimiento antes/después sin inventar valores. No confundas build correcto con experiencia verificada. Entrega informe de «comprobado / resultado / pendiente», rutas revisadas y límite de la comprobación. No hagas push ni despliegues: solicita instrucción independiente si el usuario desea publicar.
