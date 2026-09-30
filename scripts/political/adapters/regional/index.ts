// Registro de adaptadores AUTONÓMICOS. Lo consume el loader.
// Cada adaptador vive en su propio fichero de esta carpeta; `_shared.ts` sólo
// agrupa utilidades comunes (descarga con caché, CSV, validación aritmética).

import type { OfficialElectionSourceAdapter } from '../../adapter'
import { gvaAdapter } from './gva-dadesobertes'
import { gencatAdapter } from './gencat-dadeselectorals'
import { euskadiAdapter } from './euskadi-descargas'
import { navarraAdapter } from './navarra-datosabiertos'
import { riojaAdapter } from './larioja-ias'
import { aragonAdapter } from './aragon-opendata'
import { istacAdapter } from './istac-canarias'
import { ibestatAdapter } from './ibestat-edatos'
import { xuntaAdapter } from './xunta-abertos'
import { carmAdapter } from './carm-datosabiertos'

export const REGIONAL_ADAPTERS: OfficialElectionSourceAdapter[] = [gvaAdapter, gencatAdapter, euskadiAdapter, navarraAdapter, riojaAdapter, aragonAdapter, istacAdapter, ibestatAdapter, xuntaAdapter, carmAdapter]

export function findRegionalAdapter(sourceId: string): OfficialElectionSourceAdapter | undefined {
  return REGIONAL_ADAPTERS.find((a) => a.sourceId === sourceId)
}
