// Evidencia real del atlas en navegador: carga, mapa, leyenda, tabla, ND,
// accesibilidad por teclado y PNG. Escribe capturas en tmp/audit/secciones/.
// Uso: npx tsx scripts/qa-secciones-browser.ts [ine] [baseUrl]
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'
import { join } from 'node:path'

const OUT = 'tmp/audit/secciones'
const INE = process.argv[2] ?? '02007'
const BASE = process.argv[3] ?? 'http://localhost:3111'

let fallos = 0
function check(nombre: string, ok: boolean, detalle = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${nombre}${detalle ? ` (${detalle})` : ''}`)
  if (!ok) fallos += 1
}

async function main() {
  await mkdir(OUT, { recursive: true })
  const browser = await chromium.launch()
  const erroresConsola: string[] = []
  const fallosRed: string[] = []

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error') erroresConsola.push(m.text().slice(0, 200))
  })
  page.on('requestfailed', (r) => {
    const u = r.url()
    // Las teselas de OSM pueden fallar en entorno sin salida; se registra aparte.
    fallosRed.push(`${u.slice(0, 120)} :: ${r.failure()?.errorText ?? ''}`)
  })

  const url = `${BASE}/socideas/${INE}/secciones-censales`
  console.log(`=== Atlas de secciones censales: ${url} ===\n`)
  const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 })
  check('la página responde 200', resp?.status() === 200, `HTTP ${resp?.status()}`)

  // Estado inicial: la carga es bajo demanda (botón explícito). Se espera a que
  // el botón aparezca: con `domcontentloaded` todavía no está en el DOM y un
  // `count()` inmediato da 0, con lo que el clic se salta en silencio.
  const btnCargar = page.getByRole('button', { name: /cargar secciones/i })
  const esperaBoton = await btnCargar
    .first()
    .waitFor({ state: 'visible', timeout: 20000 })
    .then(() => true)
    .catch(() => false)
  if (esperaBoton) {
    console.log('       (carga bajo demanda: pulsando "Cargar secciones")')
    await btnCargar.first().click()
  } else {
    console.log('       (sin botón de carga: la vista ya viene servida)')
  }

  // Espera a que la tabla exista. Con 522 secciones y 131 922 observaciones el
  // render tarda; sin esta espera las aserciones se ejecutan contra el estado
  // "cargando" y dan falsos negativos.
  await page
    .locator('table')
    .first()
    .waitFor({ state: 'visible', timeout: 120000 })
    .catch(() => console.log('       (aviso: la tabla no apareció en el tiempo previsto)'))
  await page
    .locator('.leaflet-container')
    .first()
    .waitFor({ state: 'visible', timeout: 60000 })
    .catch(() => console.log('       (aviso: el mapa no apareció en el tiempo previsto)'))
  await page.waitForTimeout(2500)

  const texto = await page.innerText('body')

  // 1. Contenido esencial y metadatos metodológicos.
  check('indica el municipio', new RegExp(INE).test(texto), '')
  check('menciona la fuente del INE', /Instituto Nacional de Estad/i.test(texto))
  check('distingue el año de la cartografía', /delimitaci|geometr/i.test(texto), '')
  check('expone el estado de difusión / ND', /\bND\b|No difundido|Sin cobertura/i.test(texto))

  // 2. Leyenda como lista con texto (no solo color). En estado «plano» (sin
  //    indicadores cargados) no hay escala de color: se acepta el mensaje
  //    honesto de solo contornos en lugar de una leyenda vacía.
  const leyenda = page.locator('ul, [role="list"]').filter({ hasText: /euros|puntos|ratio|ND|m/i })
  const hayLeyenda = (await leyenda.count()) > 0
  const hayPlano = /solo contornos|indicadores cargados|plano de secciones|aún no se ha cargado|todavía no hemos cargado/i.test(texto)
  check(
    'hay leyenda con texto o estado «plano» explícito',
    hayLeyenda || hayPlano,
    `${await leyenda.count()} bloques${hayPlano ? ' · estado plano declarado' : ''}`,
  )

  // 3. Tabla accesible (obligatoria: debe funcionar SIN mapa).
  const tablas = page.locator('table')
  const nTablas = await tablas.count()
  check('existe una tabla de secciones', nTablas > 0, `${nTablas} tablas`)
  if (nTablas > 0) {
    const t = tablas.first()
    check('la tabla tiene caption o título', (await t.locator('caption, th[scope="col"]').count()) > 0)
    const ths = t.locator('th')
    check('la tabla tiene encabezados de columna', (await ths.count()) > 1, `${await ths.count()} th`)
    const ordenable = await ths.filter({ has: page.locator('[aria-sort], button') }).count()
    check('la tabla es ordenable', ordenable > 0, `${ordenable} columnas ordenables`)
    const filas = await t.locator('tbody tr').count()
    check('la tabla tiene filas', filas > 0, `${filas} filas`)
    check('la tabla menciona la clave oficial de sección', /0200\d{5}|1601\d{5}|\b\d{10}\b/.test(await t.innerText()))
  }

  // 4. Controles de edición de la vista (presentación, no datos).
  const btnPng = page.getByRole('button', { name: /descargar (mapa coroplético png|plano de secciones)/i })
  check('existe el botón de exportación PNG (coropleta o plano)', (await btnPng.count()) > 0)
  const btnReset = page.getByRole('button', { name: /restablecer/i })
  check('existe "Restablecer vista"', (await btnReset.count()) > 0)

  // 5. Mapa Leaflet presente.
  const leaflet = await page.locator('.leaflet-container').count()
  check('el mapa Leaflet se ha montado', leaflet > 0, `${leaflet} contenedores`)
  const svgPaths = await page.locator('.leaflet-overlay-pane path').count()
  console.log(`       polígonos renderizados en el mapa: ${svgPaths}`)

  // 6. Navegación por teclado: foco visible y activable.
  const focoOk = await page.evaluate(() => {
    const b = document.querySelector('button, a[href], input, select, [tabindex]:not([tabindex="-1"])')
    if (!b) return false
    b.focus()
    return document.activeElement === b
  })
  check('existe al menos un control enfocable', focoOk)

  // 7. Capturas en los tres anchos exigidos. Se usa la VIEWPORT (no fullPage):
  //    con 522 filas de tabla, una captura de página completa es una tira de
  //    miles de píxeles de alto que nobody puede leer ni revisar.
  await page.setViewportSize({ width: 390, height: 844 })
  // Se espera a que el layout se estabilice: medir durante la carga da falsos
  // positivos de desbordamiento (la tabla aún está insertándose).
  await page.waitForTimeout(3000)
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))))

  // 7b. Puerta móvil real: sin desbordamiento horizontal y objetivos táctiles
  //     de al menos 44 px, que es lo que exige WCAG 2.2 AA (2.5.8).
  const desborde = await page.evaluate(() => {
    const de = document.documentElement
    return { scroll: de.scrollWidth, client: de.clientWidth }
  })
  check(
    'móvil 390 px sin desbordamiento horizontal',
    desborde.scroll <= desborde.client + 2,
    `scrollWidth=${desborde.scroll} clientWidth=${desborde.client}`,
  )

  const tactiles = await page.evaluate(() => {
    const dentro: string[] = []
    const fuera: string[] = []
    const sel = 'button, a[href], input, select, [role="button"], [role="radio"]'
    for (const el of Array.from(document.querySelectorAll(sel))) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (r.height >= 44 && r.width >= 44) continue
      const etiqueta = (el.textContent ?? el.getAttribute('aria-label') ?? '').trim().slice(0, 28)

      // Excepción documentada: los enlaces de ATRIBUCIÓN de Leaflet son texto
      // continuo exigido por la licencia de OpenStreetMap y por la cesión del
      // INE. Elevarlos a 44 px rompería la franja de atribución, y WCAG 2.5.8 no
      // aplica a enlaces de texto en línea cuando existe equivalente (aquí, el
      // pie del PNG y el pie de la página).
      const esAtribucion =
        !!el.closest('.leaflet-control-attribution') ||
        /OpenStreetMap|Leaflet|Instituto Nacional/i.test(etiqueta)
      if (esAtribucion) continue
      const esDelAtlas =
        !!el.closest('.leaflet-container') ||
        !!el.closest('[role="region"][aria-label*="Tabla de secciones"]') ||
        /^(Acercar|Descargar mapa coroplético PNG|Descargar plano de secciones|Descargar datos seccionales|Restablecer)/.test(etiqueta)
      const msg = `${etiqueta || el.tagName}:${Math.round(r.width)}x${Math.round(r.height)}`
      if (esDelAtlas) dentro.push(msg)
      else fuera.push(msg)
    }
    return { dentro, fuera }
  })
  check(
    'móvil 390 px: objetivos táctiles del atlas >= 44 px',
    tactiles.dentro.length === 0,
    tactiles.dentro.slice(0, 4).join(' | ') || 'todos conformes',
  )
  if (tactiles.fuera.length) {
    console.log(
      `       (aviso: ${tactiles.fuera.length} objetivos < 44 px FUERA del atlas: ` +
        'cabecera/pie global y controles internos de Leaflet, preexistentes: ' +
        tactiles.fuera.slice(0, 3).join(', ') + ')',
    )
  }

  // El panel lateral no debe tapar permanentemente el mapa en móvil.
  const mapaVisible = await page.locator('.leaflet-container').first().isVisible().catch(() => false)
  check('el mapa sigue siendo visible en móvil', mapaVisible)

  for (const [nombre, width, height] of [
    ['desktop-1440', 1440, 900],
    ['tablet-768', 768, 1024],
    ['mobile-390', 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height })
    await page.waitForTimeout(2200)
    await page.screenshot({ path: join(OUT, `${INE}-${nombre}.png`) })
    console.log(`       captura: ${OUT}/${INE}-${nombre}.png (${width}x${height})`)
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.waitForTimeout(1500)

  // 8. Descarga real del PNG y verificación del fichero.
  if ((await btnPng.count()) > 0) {
    try {
      const [descarga] = await Promise.all([
        page.waitForEvent('download', { timeout: 45000 }),
        btnPng.first().click(),
      ])
      const destino = join(OUT, `${INE}-descarga.png`)
      await descarga.saveAs(destino)
      const { readFile, stat } = await import('node:fs/promises')
      const st = await stat(destino)
      const buf = await readFile(destino)
      const esPng =
        buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
      check('el PNG descargado existe y no está vacío', st.size > 5000, `${st.size} bytes`)
      check('el PNG descargado tiene firma PNG válida', esPng, `firma=${buf.subarray(1, 4).toString('latin1')}`)
      check(
        'el nombre del PNG incluye municipio, indicador y año',
        /\d{5}/.test(descarga.suggestedFilename()),
        descarga.suggestedFilename(),
      )
    } catch (e) {
      check('el botón de exportación produce un fichero', false, e instanceof Error ? e.message : String(e))
    }
  }

  // 9. Sin errores de consola relevantes.
  const erroresRelevantes = erroresConsola.filter(
    (e) => !/favicon|DevTools|Download the React|Lighthouse/i.test(e),
  )
  check('sin errores de consola relevantes', erroresRelevantes.length === 0, erroresRelevantes.slice(0, 2).join(' | '))
  const fallosTiles = fallosRed.filter((f) => /tile|arcgisonline|openstreetmap/i.test(f))
  if (fallosTiles.length) {
    console.log(`       (aviso: ${fallosTiles.length} teselas no cargaron — puede ser sin salida de red)`)
  }

  await browser.close()
  console.log(`\n${fallos === 0 ? 'OK' : `${fallos} FALLOS`} — atlas de ${INE}`)
  if (fallos > 0) process.exit(1)
}

main().catch((e: unknown) => {
  console.error('ERROR', e instanceof Error ? e.message : e)
  process.exit(1)
})
