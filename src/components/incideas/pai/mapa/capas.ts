// Fondos y capas oficiales (WMS) del visor de análisis de entorno. Todas son de cobertura nacional.

const IGN_WMTS = "https://www.ign.es/wmts";
const wmts = (servicio: string, capa: string, matriz: string, formato: string) =>
  `${IGN_WMTS}/${servicio}?service=WMTS&request=GetTile&version=1.0.0&layer=${capa}&style=default&tilematrixset=${matriz}&tilematrix={z}&tilecol={x}&tilerow={y}&format=${formato}`;

export interface CapaTesela {
  url: string;
  maxNativeZoom: number;
  /** Teselas ya servidas a doble resolución (no se pide z+1 en pantallas retina). */
  retinaNativa?: boolean;
  subdominios?: string;
  opacidad?: number;
}

export interface FondoMapa {
  id: string;
  nombre: string;
  descripcion: string;
  atribucion: string;
  capas: CapaTesela[];
}

export const FONDOS: FondoMapa[] = [
  {
    id: "ign",
    nombre: "Mapa IGN",
    descripcion: "Cartografía base del IGN",
    atribucion: "© Instituto Geográfico Nacional de España",
    capas: [{ url: wmts("ign-base", "IGNBaseTodo", "EPSG%3A3857", "image/png"), maxNativeZoom: 19 }],
  },
  {
    id: "pnoa",
    nombre: "Ortofoto PNOA",
    descripcion: "Imagen aérea de máxima actualidad",
    atribucion: "PNOA © Instituto Geográfico Nacional de España",
    capas: [{ url: wmts("pnoa-ma", "OI.OrthoimageCoverage", "EPSG%3A3857", "image/jpeg"), maxNativeZoom: 20 }],
  },
  {
    id: "hibrido",
    nombre: "Ortofoto con nombres",
    descripcion: "PNOA con carreteras y topónimos",
    atribucion: "PNOA © Instituto Geográfico Nacional de España",
    capas: [
      { url: wmts("pnoa-ma", "OI.OrthoimageCoverage", "EPSG%3A3857", "image/jpeg"), maxNativeZoom: 20 },
      { url: wmts("ign-base", "IGNBaseOrto", "EPSG%3A3857", "image/png"), maxNativeZoom: 19 },
    ],
  },
  {
    id: "mtn",
    nombre: "Topográfico",
    descripcion: "Mapa Topográfico Nacional (curvas de nivel)",
    atribucion: "MTN © Instituto Geográfico Nacional de España",
    capas: [{ url: wmts("mapa-raster", "MTN", "GoogleMapsCompatible", "image/jpeg"), maxNativeZoom: 17 }],
  },
  {
    id: "claro",
    nombre: "Claro",
    descripcion: "Fondo neutro para resaltar las mediciones",
    atribucion: "© OpenStreetMap contributors © CARTO",
    capas: [{ url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", maxNativeZoom: 19, retinaNativa: true, subdominios: "abcd" }],
  },
  {
    id: "osm",
    nombre: "OpenStreetMap",
    descripcion: "Cartografía colaborativa",
    atribucion: "© colaboradores de OpenStreetMap",
    capas: [{ url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", maxNativeZoom: 19 }],
  },
];

const IEPNB = "https://geoserver.iepnb.es/geoserver/wms";
const SNCZI = "https://servicios.idee.es/wms-inspire/riesgos-naturales/inundaciones";

export interface CapaOficial {
  id: string;
  nombre: string;
  descripcion: string;
  fuente: string;
  seccion: "Protección" | "Forestal e incendios" | "Agua e inundabilidad" | "Territorio";
  url: string;
  layers: string;
  /** Opacidad inicial (0-1). */
  opacidad: number;
  /** URL de la leyenda (GetLegendGraphic), si el servicio la ofrece. */
  leyenda?: string;
}

const leyenda = (capa: string) => `${IEPNB}?service=WMS&request=GetLegendGraphic&version=1.1.1&format=image/png&layer=${encodeURIComponent(capa)}`;

export const CAPAS_OFICIALES: CapaOficial[] = [
  { id: "enp", nombre: "Espacios Naturales Protegidos", descripcion: "Parques, reservas, monumentos naturales y paisajes protegidos", fuente: "IEPNB · MITECO", seccion: "Protección", url: IEPNB, layers: "ENP:enp", opacidad: 0.6, leyenda: leyenda("ENP:enp") },
  { id: "rn2000", nombre: "Red Natura 2000", descripcion: "ZEPA, ZEC y LIC", fuente: "IEPNB · MITECO", seccion: "Protección", url: IEPNB, layers: "RN2000:rn2000", opacidad: 0.6, leyenda: leyenda("RN2000:rn2000") },
  { id: "pecuarias", nombre: "Vías pecuarias", descripcion: "Red general de vías pecuarias", fuente: "IEPNB · MITECO", seccion: "Protección", url: IEPNB, layers: "vias_pecuarias:rgvp_2024", opacidad: 0.8 },
  { id: "mfe", nombre: "Mapa Forestal de España", descripcion: "Usos y formaciones forestales (foto fija)", fuente: "IEPNB · MITECO", seccion: "Forestal e incendios", url: IEPNB, layers: "foto_fija_mfe:ff_uso", opacidad: 0.6, leyenda: leyenda("foto_fija_mfe:ff_uso") },
  { id: "montes", nombre: "Catálogo de montes", descripcion: "Montes de utilidad pública y otros", fuente: "IEPNB · MITECO", seccion: "Forestal e incendios", url: IEPNB, layers: "propiedad_montes:propiedad_montes", opacidad: 0.6, leyenda: leyenda("propiedad_montes:propiedad_montes") },
  { id: "incendios", nombre: "Frecuencia de incendios 2006-2015", descripcion: "Número de incendios por cuadrícula", fuente: "IEPNB · MITECO", seccion: "Forestal e incendios", url: IEPNB, layers: "incendios_forestales:frec_incend_2006_2015", opacidad: 0.7, leyenda: leyenda("incendios_forestales:frec_incend_2006_2015") },
  { id: "incendios-antiguo", nombre: "Frecuencia de incendios 1996-2005", descripcion: "Serie anterior para comparar", fuente: "IEPNB · MITECO", seccion: "Forestal e incendios", url: IEPNB, layers: "incendios_forestales:frec_incend_1996_2005", opacidad: 0.7, leyenda: leyenda("incendios_forestales:frec_incend_1996_2005") },
  { id: "t10", nombre: "Inundable T=10 años", descripcion: "Peligrosidad alta (ARPSI, fluvial)", fuente: "SNCZI · MITECO", seccion: "Agua e inundabilidad", url: SNCZI, layers: "NZ.Flood.FluvialT10", opacidad: 0.7 },
  { id: "t100", nombre: "Inundable T=100 años", descripcion: "Peligrosidad media (ARPSI, fluvial y marina)", fuente: "SNCZI · MITECO", seccion: "Agua e inundabilidad", url: SNCZI, layers: "NZ.Flood.FluvialT100,NZ.Flood.MarinaT100", opacidad: 0.7 },
  { id: "t500", nombre: "Inundable T=500 años", descripcion: "Peligrosidad baja; criterio del análisis", fuente: "SNCZI · MITECO", seccion: "Agua e inundabilidad", url: SNCZI, layers: "NZ.Flood.FluvialT500,NZ.Flood.MarinaT500", opacidad: 0.7 },
  { id: "hidro", nombre: "Red hidrográfica", descripcion: "Ríos, arroyos y canales", fuente: "IGN", seccion: "Agua e inundabilidad", url: "https://servicios.idee.es/wms-inspire/hidrografia", layers: "HY.Network", opacidad: 0.9 },
  { id: "masas", nombre: "Masas de agua", descripcion: "Embalses, lagos y balsas", fuente: "IGN", seccion: "Agua e inundabilidad", url: "https://servicios.idee.es/wms-inspire/hidrografia", layers: "HY.PhysicalWaters.Waterbodies", opacidad: 0.8 },
  { id: "catastro", nombre: "Catastro", descripcion: "Parcelas catastrales", fuente: "DG del Catastro", seccion: "Territorio", url: "https://ovc.catastro.meh.es/Cartografia/WMS/ServidorWMS.aspx", layers: "Catastro", opacidad: 0.9 },
];

export const SECCIONES_CAPAS = ["Protección", "Forestal e incendios", "Agua e inundabilidad", "Territorio"] as const;
