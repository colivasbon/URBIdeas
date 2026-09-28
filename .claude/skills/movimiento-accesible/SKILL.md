---
name: movimiento-accesible
description: Aplica movimiento sobrio, fondos visuales y accesibilidad a un rediseño frontend sin sacrificar legibilidad ni rendimiento.
---

# Movimiento y accesibilidad

La interacción manda: anima cambios de estado que ayuden a comprender qué ha sucedido. Evita parallax universal o animaciones encadenadas para cada sección. Si se utiliza profundidad o desplazamiento, aplícalo solo donde aporte orientación, sin desplazar controles ni dificultar lectura, y ofrece una alternativa estática para quien prefiera movimiento reducido.

Los fondos decorativos nunca deben impedir la lectura ni bloquear clics; evita grandes imágenes o capas que penalicen la carga. Revisa contraste de texto e interfaz, foco visible, orden de tabulación, semántica, etiquetas de formularios, mensajes de error comprensibles, zonas activables cómodas y ausencia de dependencia exclusiva de color o hover. Prueba a 320 px de ancho cuando sea viable y a 200 % de zoom sin perder contenido esencial.

Toma WCAG 2.2 AA como referencia de revisión, pero no declares conformidad formal por ejecutar comprobaciones parciales. Si no puedes medir contraste o probar con tecnologías de apoyo, dilo. Si hay mapas o gráficos, conserva una vía textual o de datos para la información indispensable cuando sea practicable.
