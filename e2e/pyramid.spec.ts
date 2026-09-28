// Tests E2E de la pirámide de población (PyramidChart.tsx).
// Verifica: selector de referencia, radios de modo, teclado, tooltip, tabla,
// y vistas responsive (390/768/1440).
//
// Requiere: `npm run dev` en otro terminal.
// Uso: npx playwright test e2e/pyramid.spec.ts

import { test, expect, Page } from '@playwright/test'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const MUNICIPIO = '02007' // Alcalá del Júcar

async function navigateToPyramid(page: Page) {
  await page.goto(`${BASE}/socideas/${MUNICIPIO}`)
  await page.waitForSelector('[role="img"][aria-label*="Pirámide"]', {
    timeout: 15000,
  })
}

test.describe('Pirámide de población', () => {
  test('selector de referencia cambia la vista', async ({ page }) => {
    await navigateToPyramid(page)

    // Debe haber 4 opciones de referencia en el primer radiogroup
    const refRadios = page.locator('[role="radiogroup"][aria-label="Territorio de comparación"] input[type="radio"]')
    await expect(refRadios).toHaveCount(4)

    // Seleccionar "Provincia"
    await page.locator('[role="radiogroup"][aria-label="Territorio de comparación"] label:has-text("Provincia")').click()
    await expect(page.locator('[role="radiogroup"][aria-label="Territorio de comparación"] label:has-text("Provincia")')).toHaveClass(/border-\[var\(--color-secondary\)\]/)

    // Seleccionar "CCAA"
    await page.locator('[role="radiogroup"][aria-label="Territorio de comparación"] label:has-text("CCAA")').click()
    await expect(page.locator('[role="radiogroup"][aria-label="Territorio de comparación"] label:has-text("CCAA")')).toHaveClass(/border-\[var\(--color-secondary\)\]/)

    // Volver a "Sin comparación"
    await page.locator('[role="radiogroup"][aria-label="Territorio de comparación"] label:has-text("Sin comparación")').click()
    await expect(page.locator('[role="radiogroup"][aria-label="Territorio de comparación"] label:has-text("Sin comparación")')).toHaveClass(/border-\[var\(--color-secondary\)\]/)
  })

  test('radios de modo funcionan', async ({ page }) => {
    await navigateToPyramid(page)

    // Debe haber 2 modos en el radiogroup de modo
    const modoRadios = page.locator('[role="radiogroup"][aria-label="Modo de visualización"] input[type="radio"]')
    await expect(modoRadios).toHaveCount(2)

    // Seleccionar "Diferencia"
    await page.locator('[role="radiogroup"][aria-label="Modo de visualización"] label:has-text("Diferencia")').click()
    await expect(page.locator('[role="radiogroup"][aria-label="Modo de visualización"] label:has-text("Diferencia")')).toHaveClass(/border-\[var\(--color-secondary\)\]/)

    // Volver a "Perfil"
    await page.locator('[role="radiogroup"][aria-label="Modo de visualización"] label:has-text("Perfil")').click()
    await expect(page.locator('[role="radiogroup"][aria-label="Modo de visualización"] label:has-text("Perfil")')).toHaveClass(/border-\[var\(--color-secondary\)\]/)
  })

  test('navegación por teclado', async ({ page }) => {
    await navigateToPyramid(page)

    // Tab debe llegar a un elemento interactivo
    await page.keyboard.press('Tab')
    const focused = page.locator(':focus')
    await expect(focused).toBeVisible()

    // Navegar con flechas entre radios (el foco debe moverse)
    const initialFocused = await focused.evaluate((el) => el.tagName)
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')

    // Verificar que el foco sigue en un elemento interactivo
    const newFocused = page.locator(':focus')
    await expect(newFocused).toBeVisible()
  })

  test('tooltip aparece al hover', async ({ page }) => {
    await navigateToPyramid(page)

    // Hover sobre una fila de la pirámide
    const firstRow = page.locator('ul li').first()
    await firstRow.hover()

    // Debe aparecer el tooltip visible (no hidden)
    const visibleTooltip = page.locator('[role="tooltip"]:visible')
    await expect(visibleTooltip).toBeVisible()
    await expect(visibleTooltip).toContainText('Hombres')
    await expect(visibleTooltip).toContainText('Mujeres')
  })

  test('tabla de estructura presente', async ({ page }) => {
    await navigateToPyramid(page)

    // Debe haber una tabla con los datos (usar selector específico)
    const table = page.locator('table').filter({ hasText: 'Grupo de edad' }).first()
    await expect(table).toBeVisible()

    // Debe tener las columnas esperadas (solo columnheaders)
    await expect(table.locator('th:has-text("Grupo de edad")')).toBeVisible()
    await expect(table.locator('th:has-text("Hombres")')).toBeVisible()
    await expect(table.locator('th:has-text("Mujeres")')).toBeVisible()
    await expect(table.locator('th:has-text("Total")').first()).toBeVisible()

    // Debe tener 21 filas de datos
    const rows = table.locator('tbody tr')
    await expect(rows).toHaveCount(21)
  })

  test('vista móvil (390px)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await navigateToPyramid(page)

    // La pirámide debe ser visible
    const pyramid = page.locator('[role="img"][aria-label*="Pirámide"]')
    await expect(pyramid).toBeVisible()

    // Los radios deben estar presentes
    const radios = page.locator('[role="radiogroup"][aria-label="Territorio de comparación"] input[type="radio"]')
    await expect(radios).toHaveCount(4)
  })

  test('vista tablet (768px)', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await navigateToPyramid(page)

    const pyramid = page.locator('[role="img"][aria-label*="Pirámide"]')
    await expect(pyramid).toBeVisible()
  })

  test('vista escritorio (1440px)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await navigateToPyramid(page)

    const pyramid = page.locator('[role="img"][aria-label*="Pirámide"]')
    await expect(pyramid).toBeVisible()

    // La tabla debe ser visible
    const table = page.locator('table').filter({ hasText: 'Grupo de edad' }).first()
    await expect(table).toBeVisible()
  })

  test('sin datos muestra estado pendiente', async ({ page }) => {
    // Usar un municipio sin datos
    await page.goto(`${BASE}/socideas/99999`)
    // Esperar a que cargue la página
    await page.waitForLoadState('networkidle')
    // Debe mostrar algún mensaje de estado (no disponible, pendiente, etc.)
    // Nota: el texto exacto puede variar; verificamos que haya algún mensaje de estado
    const statusMessage = page.locator('[role="status"], [data-state="pending"], .ideas-status').first()
    await expect(statusMessage).toBeVisible({ timeout: 15000 })
  })
})
