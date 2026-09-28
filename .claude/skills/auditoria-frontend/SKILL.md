---
name: auditoria-frontend
description: Audita una web existente antes de rediseñarla; inventaría pantallas, funciones, problemas visuales y riesgos de regresión.
---

# Auditoría de interfaz existente

Examina el código real y, cuando haya acceso, la aplicación funcionando. No inventes páginas ni problemas no observados. Identifica rutas y plantillas compartidas, navegación, pie, formularios, buscadores, filtros, visualizaciones, tablas, mapas y estados de error, vacío y carga.

Distingue lo estructural de lo ornamental: jerarquía y comprensión, densidad, consistencia, tipografía, color, lectura de datos, uso en móvil, interacción, accesibilidad, velocidad percibida y señales de diseño genérico. Señala específicamente qué funciona y debe conservarse. Localiza componentes o estilos repetidos que conviene unificar sin tocar la lógica de negocio.

Entrega al agente principal una matriz breve «pantalla o flujo / problema comprobado / prioridad / riesgo de cambiarlo» y una lista de recorridos que habrá que repetir tras el rediseño. Si no hay navegador, indica que el diagnóstico visual se basa en código y no en capturas reales.
