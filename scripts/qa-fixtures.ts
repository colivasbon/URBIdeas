/**
 * Fixtures compartidos de QA SOCideas — fuente única de verdad de las muestras.
 *
 * Evita divergencias entre scripts (p. ej. el INE de Bilbao):
 *   Bilbao = 48020 · 48013 = Barakaldo (verificado catálogo SOCideas ↔ CONPREL).
 *   Santiago de Compostela = 15078 · 27044 = A Pastoriza (Lugo).
 *
 * Consumido por:
 *   - scripts/qa-cobertura-muestra.ts       (muestra de 14)
 *   - scripts/verify-revalidate-muestra.ts  (muestra de 10 con irpf)
 */

export type MuestraKind = 'con_dato' | 'foral' | 'sin_puente'

export interface MuestraCoberturaItem {
  ine: string
  nombre: string
  kind: MuestraKind
}

/** Muestra mínima de cobertura (14) del QA de fusión/despliegue. */
export const MUESTRA_COBERTURA: readonly MuestraCoberturaItem[] = [
  { ine: '02003', nombre: 'Albacete', kind: 'con_dato' },
  { ine: '28079', nombre: 'Madrid', kind: 'con_dato' },
  { ine: '41091', nombre: 'Sevilla', kind: 'con_dato' },
  { ine: '08019', nombre: 'Barcelona', kind: 'con_dato' },
  { ine: '15078', nombre: 'Santiago de Compostela', kind: 'con_dato' },
  { ine: '47186', nombre: 'Valladolid', kind: 'con_dato' },
  { ine: '33044', nombre: 'Oviedo', kind: 'con_dato' },
  { ine: '30016', nombre: 'Cartagena', kind: 'con_dato' },
  { ine: '07040', nombre: 'Palma', kind: 'con_dato' },
  { ine: '05019', nombre: 'Ávila', kind: 'con_dato' },
  { ine: '31201', nombre: 'Pamplona', kind: 'foral' },
  { ine: '48020', nombre: 'Bilbao', kind: 'foral' }, // INE real (48013 = Barakaldo)
  { ine: '51001', nombre: 'Ceuta', kind: 'sin_puente' },
  { ine: '52001', nombre: 'Melilla', kind: 'sin_puente' },
]

/** Muestra de la evidencia de revalidación (10 municipios con irpf esperado). */
export const MUESTRA_REVALIDACION: ReadonlyArray<[ine: string, nombre: string]> = [
  ['02003', 'Albacete'],
  ['28079', 'Madrid'],
  ['41091', 'Sevilla'],
  ['08019', 'Barcelona'],
  ['15078', 'Santiago de Compostela'],
  ['47186', 'Valladolid'],
  ['33044', 'Oviedo'],
  ['30016', 'Cartagena'],
  ['07040', 'Palma'],
  ['05019', 'Ávila'],
]

/** Capitales de provincia con INE verificado contra el catálogo SOCideas. */
export const CAPITALES_INE_VERIFICADAS: readonly string[] = [
  '01059', '02003', '03014', '04013', '05019', '07040', '08019', '09059',
  '10037', '11012', '12013', '13016', '14021', '15030', '16078', '17093',
  '18087', '19130', '20069', '21041', '22125', '23050', '24089', '25120',
  '26078', '27028', '28079', '29067', '30030', '31201', '32030', '33044',
  '34120', '35016', '36038', '37274', '38038', '39075', '40194', '41091',
  '42173', '43004', '44216', '45168', '46078', '47186', '48020', '49257',
  '50297',
]
