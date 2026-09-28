// Verificación del atlas de secciones censales contra un despliegue real.
// Comprueba el contrato que viaja por la API y la descarga XLSX, sin mocks.
//   node scripts/verify-secciones-produccion.mjs [base] [ine...]
const base = process.argv[2] ?? 'https://urb-ideas.vercel.app'
const ines = process.argv.slice(3)
const lista = ines.length ? ines : ['02007', '16016', '16211', '45090', '28079', '41091', '46250', '51001', '52001']

// Secciones reales publicadas (los agregados CSEC=000 quedan fuera por diseño).
const esperado = {
  '02007': 1, '16016': 1, '16211': 1, '45090': 1,
  '28079': 2462, '41091': 522, '46250': 588, '51001': 56, '52001': 44,
}

let fallos = 0
const ok = (cond, msg) => { console.log(`   ${cond ? 'OK   ' : 'FALLA'} ${msg}`); if (!cond) fallos++ }
const esND = o => o && typeof o.status === 'string' && o.status !== 'observado'

for (const ine of lista) {
  console.log(`\n── ${ine} ${'─'.repeat(40)}`)
  const r = await fetch(`${base}/api/socideas/secciones/${ine}`)
  if (!r.ok) { console.log(`   FALLA API HTTP ${r.status}`); fallos++; continue }

  const j = await r.json()
  const a = j.data?.atlas
  ok(a != null, 'el objeto atlas viaja en la API')
  if (!a) { fallos++; continue }

  const n = a.sections?.length ?? 0
  ok(n === esperado[ine], `secciones=${n} (esperado ${esperado[ine]})`)

  // 1. La clave que se indexa es la CUSEC oficial de 10 dígitos, y coincide
  //    exactamente con la de la capa de seccionado.
  const claves = Object.keys(a.observations ?? {})
  const deGeom = new Set(a.sections.map(s => s.properties.CUSEC))
  ok(claves.every(c => /^\d{10}$/.test(c)), 'todas las claves son CUSEC de 10 dígitos')
  ok(claves.every(c => deGeom.has(c)), 'cada observación se ancla en un polígono real')

  // 2. Ningún agregado de distrito (CSEC=000) se publica como si fuera sección.
  ok(![...deGeom].some(c => c.endsWith('000')), 'ningún agregado de distrito (CSEC=000) publicado')

  // 3. Un ND es value null con estado propio: jamás un 0 silencioso.
  let nd = 0, ndComoCero = 0, cerosReales = 0
  for (const porIndicador of Object.values(a.observations)) {
    for (const porAnio of Object.values(porIndicador)) {
      for (const o of Object.values(porAnio)) {
        if (esND(o)) { nd++; if (o.value === 0) ndComoCero++ }
        else if (o.value === 0) cerosReales++
      }
    }
  }
  ok(ndComoCero === 0, `ND nunca como 0 (${nd} ND, ${ndComoCero} como 0, ${cerosReales} ceros reales)`)

  // 4. Cada indicador declara su procedencia y unidad, y el valor por defecto
  //    está cubierto: sin eso un ND o un 0 no se podría ni explicar.
  const sinProveniencia = a.indicators.filter(
    i => !i.unidad || !i.universo || !i.sourceTable || !i.url || typeof i.publicadoPorSeccion !== 'boolean',
  )
  ok(sinProveniencia.length === 0,
    `los ${a.indicators.length} indicadores declaran unidad, universo, tabla y URL`)

  const cob = (a.cobertura ?? []).find(c => c.indicatorId === a.indicators[0].id)
  const perDefecto = cob?.periodoPorDefecto
  ok(cob != null && perDefecto > 0,
    `cobertura de ${a.indicators[0].id}: ${cob?.seccionesConDato} con dato, ` +
    `${cob?.seccionesSinDifundir} sin difundir, por defecto ${perDefecto}`)

  // Una escala de color solo informa si el valor varía. Con una sola sección no
  // puede variar, así que solo se exige variación real cuando hay varias.
  const distintos = new Set()
  for (const [cusec, porIndicador] of Object.entries(a.observations)) {
    const o = porIndicador[a.indicators[0].id]?.[perDefecto]
    if (o && !esND(o) && typeof o.value === 'number') distintos.add(o.value)
  }
  const exigido = n > 1 ? 2 : 1
  ok(distintos.size >= exigido,
    `${distintos.size} valores distintos en el periodo ${perDefecto} ` +
    `sobre ${n} sección(es) ${n > 1 ? '(deben variar para que la escala informe)' : '(sección única)'}`)

  // 5. La geometría está en un CRS coherente con España, no reproyectada a ciegas.
  const xs = a.sections[0]?.geometry?.coordinates?.[0]?.[0]?.[0] ?? []
  const [lon, lat] = xs
  ok(Number.isFinite(lon) && lon > -10 && lon < 5 && lat > 35 && lat < 44,
    `geometría en grados (${lon}, ${lat}), CRS declarado: ${a.geometryCrs}`)

  // 6. El desfase entre geometría y estadística se declara, no se esconde.
  ok(typeof a.geometryYear === 'number' && a.statsRetrievedAt != null,
    `geometría ${a.geometryYear} · estadísticas recuperadas ${String(a.statsRetrievedAt).slice(0, 10)}`)

  // 7. La descarga XLSX responde con contenido real.
  const x = await fetch(`${base}/api/socideas/secciones-descarga/${ine}`)
  const buf = Buffer.from(await x.arrayBuffer())
  ok(x.ok && buf.length > 5000 && buf.subarray(0, 2).toString() === 'PK',
    `XLSX ${x.status} · ${(buf.length / 1024).toFixed(0)} KB · cabecera PK válida`)

  // 8. La trazabilidad registra lo que no casó, en vez de descartarlo en silencio.
  const q = a.quality ?? {}
  const desc = q.seccionesSinFila?.length ?? 0, filas = q.filasSinPoligono?.length ?? 0
  ok(Array.isArray(q.filasSinPoligono) && Array.isArray(q.seccionesSinFila),
    `trazabilidad: ${desc} secciones sin fila, ${filas} filas sin polígono`)
}

console.log(fallos ? `\nFALLOS: ${fallos}` : '\nOK — atlas de secciones censales verificado contra el despliegue')
process.exit(fallos ? 1 : 0)
