// Riesgo intrínseco de instalaciones fotovoltaicas para Planes de Autoprotección (PAI/PAIF).
//
// Réplica de la hoja de cálculo interna «Cálculos riesgo intrínseco» (hoja PSF), que aplica el
// Reglamento de seguridad contra incendios en los establecimientos industriales (R.D. 164/2025):
//
//   Qs = (Σ qi · Ci · Gi) · R / A          [MJ/m²]
//
// Gi (kg) se obtiene de una cantidad tipo por sector y del factor de escala de cada sector:
//   - Campo solar, sala de grupo electrógeno y sala de celdas: kg/MW × potencia instalada (MW).
//   - Estaciones de potencia: kg/CT × número de centros de transformación.
//   - Edificio de control y almacén: kg tipo para 10 m²; si el sector supera 10 m² se escala
//     proporcionalmente a su superficie (fórmula =SI(A<=10; kg; kg·A/10) de la hoja).
//
// Los valores de qi y Ci proceden de la tabla de poderes caloríficos del R.D. 164/2025 (hoja «q»).

export type EscalaSector = "potencia" | "centros" | "superficie";

export interface MaterialSector {
  material: string;
  ubicacion: string;
  /** Cantidad tipo (kg por MW, por CT o por 10 m², según la escala del sector). */
  cantidadTipo: number;
  /** Poder calorífico qi (MJ/kg). null si el material no es combustible. */
  q: number | null;
  /** Coeficiente de peligrosidad por combustibilidad Ci. null si no combustible. */
  ci: number | null;
  observaciones: string;
}

export interface DefinicionSector {
  id: number;
  clave: string;
  nombre: string;
  /** Nombre alternativo usado en los PAI (tabla de sectores del informe). */
  nombreInforme: string;
  escala: EscalaSector;
  unidadCantidad: string;
  rPorDefecto: number;
  materiales: MaterialSector[];
}

const nc = (material: string, ubicacion: string, cantidadTipo: number): MaterialSector => ({
  material,
  ubicacion,
  cantidadTipo,
  q: null,
  ci: null,
  observaciones: "No combustible",
});

export const SECTORES_PSF: DefinicionSector[] = [
  {
    id: 1,
    clave: "campo_solar",
    nombre: "Campo solar",
    nombreInforme: "Campo solar",
    escala: "potencia",
    unidadCantidad: "kg/MW",
    rPorDefecto: 1,
    materiales: [
      { material: "Polietileno (PE)", ubicacion: "Aislamiento de cables DC/AC", cantidadTipo: 625.07, q: 43.92, ci: 1, observaciones: "Recipientes/piezas" },
      { material: "PVC", ubicacion: "Canalizaciones eléctricas", cantidadTipo: 4195.31, q: 18, ci: 1, observaciones: "Aislamientos/tubos" },
      { material: "PET", ubicacion: "Backsheet de módulos", cantidadTipo: 2789.59, q: 22.18, ci: 1, observaciones: "Lámina trasera" },
      { material: "Policarbonato (PC)", ubicacion: "Cajas de conexión", cantidadTipo: 766.77, q: 29.88, ci: 1.2, observaciones: "Carcasas" },
      { material: "Poliuretano (PU)", ubicacion: "Sellantes, espumas", cantidadTipo: 2789.59, q: 28.85, ci: 1.2, observaciones: "Masillas" },
      { material: "Caucho/Goma", ubicacion: "Juntas y protecciones", cantidadTipo: 10, q: 39.06, ci: 1.2, observaciones: "Juntas elásticas" },
      { material: "Aceite lubricante", ubicacion: "Mantenimiento de trackers", cantidadTipo: 5, q: 42, ci: 1.2, observaciones: "Inflamable" },
      nc("Silicio", "Células FV", 2440.89),
      nc("Vidrio", "Módulos", 48817.8),
      nc("Aluminio (masa)", "Marcos módulos", 5697.99),
      nc("Acero", "Trackers", 38521.65),
      nc("Hormigón", "Cimentaciones mesas anclaje", 19708.26),
      nc("Cobre", "De inversores asignados a campo", 4146.78),
      nc("Composites (fibra de vidrio)", "Carcasas (inversores)", 104.29),
    ],
  },
  {
    id: 2,
    clave: "estaciones_potencia",
    nombre: "Estaciones de potencia",
    nombreInforme: "Centro de Transformación, Protección, Medida y Control",
    escala: "centros",
    unidadCantidad: "kg/CT",
    rPorDefecto: 1.4,
    materiales: [
      { material: "Aceite mineral", ubicacion: "Aceite dieléctrico de transformadores", cantidadTipo: 8, q: 45.9, ci: 1.44, observaciones: "Carga combustible principal" },
      { material: "Polietileno (PE)", ubicacion: "Aislamiento de cables MT/BT", cantidadTipo: 8, q: 43.92, ci: 1, observaciones: "Recipientes/piezas" },
      { material: "PVC", ubicacion: "Canalizaciones eléctricas internas", cantidadTipo: 3, q: 18, ci: 1, observaciones: "Aislamientos/tubos" },
      { material: "Policarbonato (PC)", ubicacion: "Paneles y carcasas de protecciones", cantidadTipo: 1, q: 29.88, ci: 1.2, observaciones: "Equipos eléctricos" },
      { material: "Resina epoxi (EP)", ubicacion: "Encapsulados eléctricos", cantidadTipo: 2, q: 29.16, ci: 1.44, observaciones: "Aislantes" },
      { material: "Poliuretano (PU)", ubicacion: "Sellantes en equipos", cantidadTipo: 1, q: 28.85, ci: 1.2, observaciones: "Masillas/espumas" },
      { material: "Polipropileno (PP)", ubicacion: "Componentes plásticos de equipos", cantidadTipo: 2, q: 45.36, ci: 1, observaciones: "Dispositivos eléctricos" },
      { material: "Goma / Caucho", ubicacion: "Juntas, retenes, protecciones", cantidadTipo: 2, q: 39.06, ci: 1.2, observaciones: "Elementos elásticos" },
      nc("Acero", "Carcasas, chasis, estructura", 3135.8),
    ],
  },
  {
    id: 3,
    clave: "edificio_control",
    nombre: "Edificio de control",
    nombreInforme: "Centro de control",
    escala: "superficie",
    unidadCantidad: "kg/10 m²",
    rPorDefecto: 1,
    materiales: [
      { material: "Papel", ubicacion: "Documentación, material de oficina", cantidadTipo: 5, q: 16.5, ci: 1.2, observaciones: "Combustible ligero" },
      { material: "Polietileno (PE)", ubicacion: "Aislamiento de cableado interior", cantidadTipo: 10, q: 43.92, ci: 1, observaciones: "Conductores eléctricos" },
      { material: "PVC", ubicacion: "Canalizaciones eléctricas", cantidadTipo: 20, q: 18, ci: 1, observaciones: "Instalación eléctrica" },
      { material: "Policarbonato (PC)", ubicacion: "Carcasas de equipos electrónicos", cantidadTipo: 5, q: 29.88, ci: 1.2, observaciones: "Material de oficina/equipos" },
      { material: "PMMA", ubicacion: "Señalización, cubiertas", cantidadTipo: 2, q: 24.84, ci: 1, observaciones: "Material acrílico" },
      { material: "Poliuretano (PU)", ubicacion: "Aislamientos, espumas, sellantes", cantidadTipo: 10, q: 28.85, ci: 1.2, observaciones: "Cerramientos" },
      { material: "Polipropileno (PP)", ubicacion: "Carcasas, accesorios plásticos", cantidadTipo: 5, q: 45.36, ci: 1, observaciones: "Equipos y mobiliario" },
      { material: "Poliéster insaturado (UP)", ubicacion: "Carcasas, tapas, composites", cantidadTipo: 2, q: 27.36, ci: 1.2, observaciones: "Material plástico" },
      { material: "Aceite lubricante", ubicacion: "Equipos de mantenimiento guardados", cantidadTipo: 2, q: 42, ci: 1.2, observaciones: "Cantidad reducida" },
      { material: "White Spirit", ubicacion: "Productos de limpieza", cantidadTipo: 1, q: 43.5, ci: 1.68, observaciones: "Inflamable" },
      { material: "Madera", ubicacion: "Mobiliario", cantidadTipo: 20, q: 12.6, ci: 1.2, observaciones: "Carga combustible moderada" },
    ],
  },
  {
    id: 4,
    clave: "almacen",
    nombre: "Almacén",
    nombreInforme: "Almacén",
    escala: "superficie",
    unidadCantidad: "kg/10 m²",
    rPorDefecto: 0.8,
    materiales: [
      { material: "Cartón", ubicacion: "Cajas de almacenamiento", cantidadTipo: 100, q: 16.5, ci: 1.2, observaciones: "Combustible frecuente" },
      { material: "Madera (palets)", ubicacion: "Palets y embalajes", cantidadTipo: 100, q: 12.6, ci: 1.2, observaciones: "Gran carga combustible" },
      { material: "Poliestireno (PS)", ubicacion: "Embalajes protectores", cantidadTipo: 15, q: 39.6, ci: 1.2, observaciones: "Espumas" },
      { material: "Polietileno (PE)", ubicacion: "Material en repuestos, cables", cantidadTipo: 30, q: 43.92, ci: 1, observaciones: "Film y piezas" },
      { material: "Polipropileno (PP)", ubicacion: "Envases y componentes", cantidadTipo: 20, q: 45.36, ci: 1, observaciones: "Plásticos" },
      { material: "Policarbonato (PC)", ubicacion: "Repuestos de cajas y protecciones", cantidadTipo: 15, q: 29.88, ci: 1.2, observaciones: "Equipos" },
      { material: "Poliuretano (PU)", ubicacion: "Espumas, aislantes guardados", cantidadTipo: 15, q: 28.85, ci: 1.2, observaciones: "Combustible" },
      { material: "Resina epoxi (EP)", ubicacion: "Materiales eléctricos de repuesto", cantidadTipo: 20, q: 29.16, ci: 1.44, observaciones: "Aislantes" },
      { material: "Aceite lubricante", ubicacion: "Recipientes de mantenimiento", cantidadTipo: 15, q: 42, ci: 1.2, observaciones: "Inflamable" },
      { material: "White Spirit", ubicacion: "Material de obra/mantenimiento", cantidadTipo: 10, q: 43.5, ci: 1.68, observaciones: "Inflamable" },
      { material: "Poliéster insaturado (UP)", ubicacion: "Materiales de composite almacenados", cantidadTipo: 5, q: 27.36, ci: 1.2, observaciones: "Resinas" },
      { material: "Caucho", ubicacion: "Juntas, tubos, accesorios", cantidadTipo: 15, q: 39.06, ci: 1.2, observaciones: "Combustible" },
    ],
  },
  {
    id: 5,
    clave: "grupo_electrogeno",
    nombre: "Sala grupo electrógeno",
    nombreInforme: "Sala de grupo electrógeno",
    escala: "potencia",
    unidadCantidad: "kg/MW",
    rPorDefecto: 1.4,
    materiales: [
      { material: "Gasóleo (gasoil)", ubicacion: "Combustible del grupo electrógeno", cantidadTipo: 50, q: 41.8, ci: 1.44, observaciones: "Inflamable alto" },
      { material: "Aceite lubricante", ubicacion: "Lubricación del motor/generador", cantidadTipo: 5, q: 42, ci: 1.2, observaciones: "Carga importante" },
      { material: "Polietileno (PE)", ubicacion: "Aislamiento de cables", cantidadTipo: 10, q: 43.92, ci: 1, observaciones: "Presenta carga baja" },
      { material: "PVC", ubicacion: "Canalizaciones", cantidadTipo: 10, q: 18, ci: 1, observaciones: "Instalación eléctrica" },
      { material: "Caucho", ubicacion: "Mangueras y juntas", cantidadTipo: 5, q: 39.06, ci: 1.2, observaciones: "Combustible" },
      { material: "Papel/Cartón", ubicacion: "Manuales o embalajes menores", cantidadTipo: 2, q: 16.5, ci: 1.2, observaciones: "Carga baja" },
      { material: "Madera", ubicacion: "Soporte o embalaje, si existe", cantidadTipo: 5, q: 12.6, ci: 1.2, observaciones: "Variable" },
    ],
  },
  {
    id: 6,
    clave: "sala_celdas",
    nombre: "Sala de celdas",
    nombreInforme: "Sala de celdas",
    escala: "potencia",
    unidadCantidad: "kg/MW",
    rPorDefecto: 1.4,
    materiales: [
      { material: "Polietileno (PE)", ubicacion: "Cables MT/BT", cantidadTipo: 50, q: 43.92, ci: 1, observaciones: "Aislamiento principal" },
      { material: "PVC", ubicacion: "Canalizaciones y cableado", cantidadTipo: 50, q: 18, ci: 1, observaciones: "Común en instalaciones" },
      { material: "Policarbonato (PC)", ubicacion: "Celdas, protecciones, carcasas", cantidadTipo: 20, q: 29.88, ci: 1.2, observaciones: "Material técnico" },
      { material: "Resina epoxi (EP)", ubicacion: "Aisladores y encapsulados", cantidadTipo: 10, q: 29.16, ci: 1.2, observaciones: "Presente en equipos" },
      { material: "Poliuretano (PU)", ubicacion: "Sellantes y pequeñas espumas", cantidadTipo: 5, q: 28.85, ci: 1.2, observaciones: "Suele aparecer" },
      { material: "Poliéster insaturado (UP)", ubicacion: "Carcasas de equipos", cantidadTipo: 5, q: 27.36, ci: 1.2, observaciones: "Componente plástico" },
      { material: "Caucho", ubicacion: "Juntas, retenes", cantidadTipo: 5, q: 39.06, ci: 1.2, observaciones: "Combustible" },
      nc("Acero", "Celdas metálicas", 200),
      nc("Aluminio", "Componentes estructurales", 50),
    ],
  },
];

/** Coeficiente R (riesgo de activación), casuísticas del R.D. 164/2025 (hoja «R»). */
export const OPCIONES_R: { valor: number; descripcion: string }[] = [
  {
    valor: 0.8,
    descripcion:
      "Almacenamientos de baja altura (máx. 2,50 m) y superficie en planta inferior a 50 m², salvo que la tabla 1.3.5 (Rmin) exija un valor superior.",
  },
  { valor: 1, descripcion: "Valor por defecto cuando no concurre ninguna otra casuística." },
  {
    valor: 1.4,
    descripcion:
      "a) Actividades que aumentan significativamente la probabilidad de inicio (fuentes térmicas, químicas o equivalentes), o b) distribución de materiales que favorece la propagación rápida.",
  },
  { valor: 1.8, descripcion: "Concurren simultáneamente las situaciones a) y b)." },
];

/** Niveles de riesgo intrínseco por densidad de carga de fuego Qs (R.D. 164/2025, hoja «Qs»). */
export const NIVELES_QS: { nivel: number; riesgo: "Bajo" | "Medio" | "Alto"; hasta: number; rango: string }[] = [
  { nivel: 1, riesgo: "Bajo", hasta: 425, rango: "Qs ≤ 425" },
  { nivel: 2, riesgo: "Bajo", hasta: 850, rango: "425 < Qs ≤ 850" },
  { nivel: 3, riesgo: "Medio", hasta: 1275, rango: "850 < Qs ≤ 1.275" },
  { nivel: 4, riesgo: "Medio", hasta: 1700, rango: "1.275 < Qs ≤ 1.700" },
  { nivel: 5, riesgo: "Medio", hasta: 3400, rango: "1.700 < Qs ≤ 3.400" },
  { nivel: 6, riesgo: "Alto", hasta: 6800, rango: "3.400 < Qs ≤ 6.800" },
  { nivel: 7, riesgo: "Alto", hasta: 13600, rango: "6.800 < Qs ≤ 13.600" },
  { nivel: 8, riesgo: "Alto", hasta: Infinity, rango: "Qs > 13.600" },
];

export function clasificarQs(qs: number) {
  return NIVELES_QS.find((n) => qs <= n.hasta) ?? NIVELES_QS[NIVELES_QS.length - 1];
}

export interface EntradaSector {
  /** Superficie del sector en m². 0 o vacío = sector no presente en la instalación. */
  area: number;
  r: number;
}

export interface EntradaRiesgo {
  nombre: string;
  /** Potencia instalada (MW) que escala los sectores por potencia. */
  potenciaMW: number;
  numeroCTs: number;
  sectores: Record<string, EntradaSector>;
}

export interface MaterialCalculado extends MaterialSector {
  cantidadKg: number;
  /** qi · Ci · Gi (MJ). null si no combustible. */
  cargaMJ: number | null;
}

export interface SectorCalculado {
  definicion: DefinicionSector;
  presente: boolean;
  area: number;
  r: number;
  materiales: MaterialCalculado[];
  cargaTotalMJ: number;
  qs: number | null;
  nivel: ReturnType<typeof clasificarQs> | null;
}

export interface ResultadoRiesgo {
  nombre: string;
  potenciaMW: number;
  numeroCTs: number;
  sectores: SectorCalculado[];
  /** Nivel global: el más desfavorable de los sectores presentes. */
  global: ReturnType<typeof clasificarQs> | null;
}

export function entradaPorDefecto(nombre = "", potenciaMW = 0, numeroCTs = 1): EntradaRiesgo {
  const sectores: Record<string, EntradaSector> = {};
  for (const s of SECTORES_PSF) sectores[s.clave] = { area: 0, r: s.rPorDefecto };
  return { nombre, potenciaMW, numeroCTs, sectores };
}

function cantidadInstalacion(s: DefinicionSector, m: MaterialSector, e: EntradaRiesgo, area: number) {
  if (s.escala === "potencia") return m.cantidadTipo * e.potenciaMW;
  if (s.escala === "centros") return m.cantidadTipo * e.numeroCTs;
  return area <= 10 ? m.cantidadTipo : m.cantidadTipo * (area / 10);
}

export function calcularRiesgoIntrinseco(e: EntradaRiesgo): ResultadoRiesgo {
  const sectores = SECTORES_PSF.map((def): SectorCalculado => {
    const entrada = e.sectores[def.clave] ?? { area: 0, r: def.rPorDefecto };
    const area = Number.isFinite(entrada.area) ? entrada.area : 0;
    const r = Number.isFinite(entrada.r) && entrada.r > 0 ? entrada.r : def.rPorDefecto;
    const materiales = def.materiales.map((m): MaterialCalculado => {
      const cantidadKg = cantidadInstalacion(def, m, e, area);
      const cargaMJ = m.q !== null && m.ci !== null ? m.q * m.ci * cantidadKg : null;
      return { ...m, cantidadKg, cargaMJ };
    });
    const cargaTotalMJ = materiales.reduce((acc, m) => acc + (m.cargaMJ ?? 0), 0);
    const presente = area > 0;
    const qs = presente ? (cargaTotalMJ * r) / area : null;
    return { definicion: def, presente, area, r, materiales, cargaTotalMJ, qs, nivel: qs === null ? null : clasificarQs(qs) };
  });

  const niveles = sectores.filter((s) => s.nivel).map((s) => s.nivel!);
  const global = niveles.length ? niveles.reduce((a, b) => (b.nivel > a.nivel ? b : a)) : null;
  return { nombre: e.nombre, potenciaMW: e.potenciaMW, numeroCTs: e.numeroCTs, sectores, global };
}

/** Formato numérico español (miles con punto, decimales con coma). */
export function fmtNum(n: number, decimales = 2): string {
  return n.toLocaleString("es-ES", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
    useGrouping: "always" as unknown as boolean,
  });
}
