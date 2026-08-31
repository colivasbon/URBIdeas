export interface ComunidadAutonoma {
  id: string
  nombre: string
  competencia_urbanistica: string
  ley_marco_vigente: string
  fecha_publicacion: string | null
  enlace_boe_o_boletin_autonomico: string | null
  created_at: string
}

export interface Provincia {
  id: string
  comunidad_autonoma_id: string
  nombre: string
  codigo_ine: string | null
  comunidad_autonoma?: ComunidadAutonoma
}

export interface Municipio {
  id: string
  provincia_id: string
  nombre: string
  codigo_ine: string
  poblacion: number | null
  geom: string | null
  provincia?: Provincia
}

export interface InstrumentoPlaneamiento {
  id: string
  municipio_id: string
  tipo: 'PGOU' | 'Normas Subsidiarias' | 'Plan de Ordenación Municipal' | 'Plan Parcial' | 'Plan Especial' | 'Modificación Puntual' | 'OPA' | 'PDI'
  estado: 'vigente' | 'en tramitación' | 'en revisión' | 'aprobado definitivamente' | 'aprobado provisionalmente'
  fecha_aprobacion_inicial: string | null
  fecha_aprobacion_definitiva: string | null
  enlace_documento_oficial: string | null
  enlace_geoportal: string | null
  fuente: string | null
  created_at: string
  municipio?: Municipio
}

export interface NormativaVigente {
  id: string
  ambito: 'estatal' | 'autonomico'
  comunidad_autonoma_id: string | null
  titulo: string
  referencia_legal: string
  fecha_publicacion: string | null
  enlace_boe_boletin: string | null
  estado_vigencia: 'vigente' | 'derogada' | 'parcialmente derogada' | 'en revisión'
  created_at: string
  comunidad_autonoma?: ComunidadAutonoma
}

export interface FuenteGeoportal {
  id: string
  comunidad_autonoma_id: string | null
  provincia_id: string | null
  nombre: string
  url: string
  tipo_servicio: 'visor web' | 'WMS' | 'WFS' | 'PDF' | 'Excel' | 'API'
  ultima_actualizacion: string
  activo: boolean
  created_at: string
}

export interface CapaWMS {
  id: string
  comunidad_autonoma_id: string
  nombre_capa: string
  url_servicio: string
  tipo_servicio: 'WMS' | 'WFS' | 'ArcGIS REST'
  formato_soportado: string
  sistema_referencia: string
  fecha_verificacion: string
  activo: boolean
  created_at: string
  categoria?: string
  comunidad_autonoma?: ComunidadAutonoma
}
