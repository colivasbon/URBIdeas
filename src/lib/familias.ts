// Catálogo Urbideas: 9 familias de veto urbanístico (Fase 0).
// Cada capa (capas_wms / geo_layers) se clasifica en familia + severidad + norma corta.
// No se redacta BOE: solo cadena de referencia para la ficha.

export type Severidad = 'veto' | 'condicionante' | 'informativo'
export type PerfilId = 'parcela' | 'rustico' | 'cribado' | 'afecciones'

export interface Familia {
  id: string
  orden: number
  titulo: string
  descripcion: string
}

export const FAMILIAS: Familia[] = [
  { id: 'planeamiento', orden: 1, titulo: 'Planeamiento y clasificación del suelo', descripcion: 'Figura vigente, clasificación y calificación si la fuente las devuelve.' },
  { id: 'catastro', orden: 2, titulo: 'Catastro y parcela', descripcion: 'Referencia, superficie y uso. Identifica, no dictamina.' },
  { id: 'usos', orden: 3, titulo: 'Usos y ocupación', descripcion: 'Usos del suelo, ocupación y SIOSE.' },
  { id: 'patrimonio', orden: 4, titulo: 'Patrimonio (BIC, perímetros, distancias)', descripcion: 'Bienes declarados, perímetros de protección y distancias legales.' },
  { id: 'inundacion', orden: 5, titulo: 'Inundación y riesgos', descripcion: 'Flujo preferente, inundables fluvial y costera, sísmico. Mapa SNCZI.' },
  { id: 'dominio', orden: 6, titulo: 'Dominio público y servidumbres', descripcion: 'DPH, DPMT y servidumbres, viario y ferrocarril.' },
  { id: 'infra', orden: 7, titulo: 'Red e infraestructuras', descripcion: 'Redes, acceso vial y servicios. Informativo salvo servidumbre.' },
  { id: 'medio', orden: 8, titulo: 'Medio ambiente y espacios protegidos', descripcion: 'Red Natura 2000, parques, montes, Ramsar, humedales, IBA, ZEPA.' },
  { id: 'pecuarias', orden: 9, titulo: 'VÍas pecuarias', descripcion: 'Cañada, cordel, vereda, colada y lugares asociados. Ley 3/1995.' },
]

export const FAMILIA_IDS = FAMILIAS.map(f => f.id)

// Presets por perfil: familias encendidas por defecto (el usuario puede modificarlo;
// si lo hace, el dictamen marca preset_modificado=true).
export const PRESETS_PERFIL: Record<PerfilId, string[]> = {
  parcela: ['planeamiento', 'catastro', 'usos', 'patrimonio', 'inundacion', 'dominio'],
  rustico: ['planeamiento', 'catastro', 'inundacion', 'dominio', 'medio', 'pecuarias', 'patrimonio'],
  cribado: ['planeamiento', 'catastro', 'usos', 'inundacion', 'dominio', 'infra', 'medio'],
  afecciones: [...FAMILIA_IDS],
}

// Familias de veto por perfil: si alguna queda sin_datos, techo = condicionado + subtítulo.
export const VETO_POR_PERFIL: Record<PerfilId, string[]> = {
  parcela: ['patrimonio', 'inundacion', 'medio', 'dominio', 'pecuarias'],
  rustico: ['medio', 'inundacion', 'patrimonio', 'dominio', 'pecuarias'],
  cribado: ['inundacion', 'dominio', 'medio', 'patrimonio', 'pecuarias'],
  afecciones: ['patrimonio', 'inundacion', 'dominio', 'medio', 'pecuarias'],
}

interface Regla {
  familia: string
  severidad: Severidad
  norma: string
  test: RegExp
}

// Orden de reglas: primera coincidencia manda. Lo no matched => usos/informativo.
const REGLAS: Regla[] = [
  { familia: 'pecuarias', severidad: 'veto', norma: 'Ley 3/1995 de VÍas Pecuarias', test: /via.?pecuaria|ca[ñn]ada|cordel|vereda|colada|pecuari/i },
  { familia: 'medio', severidad: 'veto', norma: 'Ley 42/2007 Patrimonio Natural; Red Natura 2000', test: /red.?natura|natura.?2000|\blic\b|zepa|zec|parque.?nacional|parque.?natural|monte.?catalogado|monte.?utilidad|ramsar|humedal|iba\b|avifauna|espacio.?protegido|zona.?protegida/i },
  { familia: 'patrimonio', severidad: 'veto', norma: 'Ley 16/1985 Patrimonio Histórico; normativa autonómica', test: /patrimonio|bic\b|bien.?interes|bienes.?cultural|proteccion.?cultural|yacimiento|arqueolog/i },
  { familia: 'inundacion', severidad: 'veto', norma: 'R.D. 903/2010; mapa SNCZI', test: /inunda|flujo.?preferente|snc?zi|cauce|avenida|riesgo.?sism|sismic|deslizamiento|erosion/i },
  { familia: 'dominio', severidad: 'veto', norma: 'Legislación de costas / aguas; servidumbres sectoriales', test: /dominio.?publico|dpmt|dp.?maritimo|servidumbre.?proteccion|zona.?influencia|hidrograf|dph\b|viario|ferrocarril|carretera|dominio/i },
  { familia: 'planeamiento', severidad: 'condicionante', norma: 'Planeamiento municipal vigente; SIU (consulta)', test: /planeamiento|clasificacion|calificacion|pgou|pom\b|nnss|normas.?subsidiarias|plan.?parcial|plan.?especial|sector|unidad.?actuacion|suelo.?urbano|suelo.?urbanizable|no.?urbanizable|sist\.?\.?generales/i },
  { familia: 'catastro', severidad: 'informativo', norma: 'Sede Electrónica del Catastro (identifica, no dictamina)', test: /catastro|parcela|referencia.?catastral/i },
  { familia: 'infra', severidad: 'informativo', norma: 'Titular de la red / acceso vial', test: /infraestructura|red.?electrica|red.?viaria|acceso.?vial|gasoducto|oleoducto|electrica|curtailment|nudo/i },
  { familia: 'usos', severidad: 'condicionante', norma: 'Planeamiento municipal; SIOSE (ocupación)', test: /usos?.?suelo|ocupacion|siose|corine|cobertura.?suelo|aprovechamiento/i },
]

const CATEGORIA_MAP: Record<string, { familia: string; severidad: Severidad; norma: string }> = {
  planeamiento_general: { familia: 'planeamiento', severidad: 'condicionante', norma: 'Planeamiento municipal vigente; SIU (consulta)' },
  clasificacion_suelo: { familia: 'planeamiento', severidad: 'condicionante', norma: 'Planeamiento municipal vigente' },
  calificacion_urbanistica: { familia: 'planeamiento', severidad: 'condicionante', norma: 'Planeamiento municipal vigente' },
  categoria_suelo: { familia: 'planeamiento', severidad: 'condicionante', norma: 'Planeamiento municipal vigente' },
  usos_suelo: { familia: 'usos', severidad: 'condicionante', norma: 'Planeamiento municipal; SIOSE (ocupación)' },
  ocupacion_suelo: { familia: 'usos', severidad: 'condicionante', norma: 'SIOSE (ocupación)' },
  siose: { familia: 'usos', severidad: 'condicionante', norma: 'SIOSE (ocupación)' },
  sector: { familia: 'planeamiento', severidad: 'condicionante', norma: 'Planeamiento municipal vigente' },
  infraestructuras: { familia: 'infra', severidad: 'informativo', norma: 'Titular de la red / acceso vial' },
  proteccion_ambiental: { familia: 'medio', severidad: 'veto', norma: 'Ley 42/2007 Patrimonio Natural; Red Natura 2000' },
  patrimonio_cultural: { familia: 'patrimonio', severidad: 'veto', norma: 'Ley 16/1985 Patrimonio Histórico' },
  ortofoto: { familia: 'usos', severidad: 'informativo', norma: 'PNOA / ortofoto (apoyo visual)' },
}

export interface Clasificacion {
  familia: string
  severidad: Severidad
  norma: string
}

export function clasificarCapa(args: { nombre_capa?: string; layer_title?: string | null; categoria?: string | null }): Clasificacion {
  const ov = overrideDe(args)
  if (ov) return ov
  if (args.categoria && CATEGORIA_MAP[args.categoria]) {
    const m = CATEGORIA_MAP[args.categoria]
    return { familia: m.familia, severidad: m.severidad, norma: m.norma }
  }
  const texto = `${args.layer_title || ''} ${args.nombre_capa || ''}`
  for (const r of REGLAS) {
    if (r.test.test(texto)) return { familia: r.familia, severidad: r.severidad, norma: r.norma }
  }
  return { familia: 'usos', severidad: 'informativo', norma: 'Fuente WMS (ver ficha de capa)' }
}

export function tituloFamilia(id: string): string {
  return FAMILIAS.find(f => f.id === id)?.titulo || id
}

// Excepciones revisadas a mano (revisión de catálogo 2026-09):
// se comprueban ANTES que el mapa por categoría, porque el nombre manda.
interface Override {
  test: RegExp
  familia: string
  severidad: Severidad
  norma: string
  motivo: string
}

export const OVERRIDES: Override[] = [
  // VÍa pecuaria real: la categoría que traiga la CCAA no manda sobre el nombre.
  { test: /vias?[_ ]pecuarias|prot_vp|pecuari/i, familia: 'pecuarias', severidad: 'veto', norma: 'Ley 3/1995 de VÍas Pecuarias', motivo: 'capa de vías pecuarias' },
  // DPM de Aragón = Disponibilidad de Planeamiento, NO dominio público marítimo. No tocar.
  // Cartografía histórica del IGN: apoyo visual, no patrimonio protegido (un veto aquí bloquearía todo).
  { test: /planosig/i, familia: 'usos', severidad: 'informativo', norma: 'IGN PlanosIG (cartografía histórica, apoyo visual)', motivo: 'planimetría histórica, no BIC' },
  // Edafología: "suelos" que no son clasificación urbanística.
  { test: /unisuelos|mapa.?de.?suelos|edafolog/i, familia: 'usos', severidad: 'informativo', norma: 'Mapa de suelos (edafología, apoyo)', motivo: 'suelo edafológico, no urbanístico' },
  // Zonificación estadística navarra: NO es Natura 2000. No tocar hacia medio/veto.
  { test: /zonificaci.n.?navarra|navarra.?2000|nav2000|szonnav|estadi_pol/i, familia: 'usos', severidad: 'informativo', norma: 'Zonificación Navarra 2000 (zonificación estadística, apoyo)', motivo: 'zonificación estadística, no Red Natura' },
  // Ocupación/usos del suelo con categoría de clasificación heredada.
  { test: /siose|usos?.?del.?suelo|tiposusos/i, familia: 'usos', severidad: 'condicionante', norma: 'SIOSE (ocupación)', motivo: 'ocupación del suelo' },
  // Infraestructuras, equipamientos y mobiliario con categoría heredada.
  { test: /infraestructura|equipamiento|mobiliario.?urbano/i, familia: 'infra', severidad: 'informativo', norma: 'Titular de la red / equipamiento', motivo: 'infraestructura o equipamiento' },
  // Mallas de referencia espacial: apoyo, no condicionan.
  { test: /referencia.?espacial|^servicios_srs/i, familia: 'infra', severidad: 'informativo', norma: 'Servicio de referencia espacial (apoyo)', motivo: 'malla de referencia' },
]

export function overrideDe(args: { nombre_capa?: string; layer_title?: string | null }): Clasificacion | null {
  const texto = `${args.layer_title || ''} ${args.nombre_capa || ''}`
  for (const o of OVERRIDES) {
    if (o.test.test(texto)) return { familia: o.familia, severidad: o.severidad, norma: o.norma }
  }
  return null
}
