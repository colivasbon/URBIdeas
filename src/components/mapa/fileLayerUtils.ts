"use client"

import { kml } from "@mapbox/togeojson"
import shp from "shpjs"
import JSZip from "jszip"

export interface FileLayer {
  id: string
  nombre: string
  geojson: GeoJSON.FeatureCollection
  color: string
  visible: boolean
  fillOpacity: number
  weight: number
  borderColor: string
}

const LAYER_COLORS = [
  "#3E665C", "#86B73D", "#E07B39", "#3B82F6",
  "#8B5CF6", "#EC4899", "#14B8A6", "#F59E0B",
]

let colorIndex = 0
function nextColor(): string {
  const c = LAYER_COLORS[colorIndex % LAYER_COLORS.length]
  colorIndex++
  return c
}

const MAX_SIZE_BYTES = 20 * 1024 * 1024

const SUPPORTED_EXTENSIONS = [".geojson", ".json", ".kml", ".kmz", ".shp", ".zip"]

function getExtension(filename: string): string {
  const lower = filename.toLowerCase()
  if (lower.endsWith(".geojson") || lower.endsWith(".json")) return "geojson"
  if (lower.endsWith(".kml")) return "kml"
  if (lower.endsWith(".kmz")) return "kmz"
  if (lower.endsWith(".shp")) return "shp"
  if (lower.endsWith(".zip")) return "zip"
  return "unknown"
}

async function parseGeoJson(file: File): Promise<GeoJSON.FeatureCollection> {
  try {
    const text = await file.text()
    const parsed = JSON.parse(text)
    if (parsed.type === "FeatureCollection") return parsed
    if (parsed.type === "Feature") return { type: "FeatureCollection", features: [parsed] }
    throw new Error("El archivo no es un GeoJSON válido (se esperaba Feature o FeatureCollection).")
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error("El archivo no contiene JSON válido. Verifica que el formato sea correcto.")
    }
    throw err
  }
}

async function parseKml(file: File): Promise<GeoJSON.FeatureCollection> {
  const text = await file.text()
  const parser = new DOMParser()
  const xml = parser.parseFromString(text, "application/xml")
  const errorNode = xml.querySelector("parsererror")
  if (errorNode) throw new Error("El archivo KML no es válido (error de formato XML).")
  const geojson = kml(xml)
  if (geojson.type !== "FeatureCollection") {
    throw new Error("No se pudo convertir el KML a GeoJSON.")
  }
  return geojson as GeoJSON.FeatureCollection
}

interface KmlLayer {
  nombre: string
  geojson: GeoJSON.FeatureCollection
}

async function parseKmz(file: File): Promise<KmlLayer[]> {
  try {
    const buffer = await file.arrayBuffer()
    const zip = await JSZip.loadAsync(buffer)

    // Buscar archivos KML en todo el ZIP (incluyendo subcarpetas)
    const kmlFiles: JSZip.JSZipObject[] = []
    zip.forEach((path, obj) => {
      if (path.toLowerCase().endsWith(".kml") && !obj.dir) {
        kmlFiles.push(obj)
      }
    })

    if (kmlFiles.length === 0) {
      throw new Error("El KMZ no contiene ningún archivo KML interno.")
    }

    const parser = new DOMParser()
    const results: KmlLayer[] = []

    for (const kmlFile of kmlFiles) {
      const kmlText = await kmlFile.async("text")
      const xml = parser.parseFromString(kmlText, "application/xml")
      const errorNode = xml.querySelector("parsererror")
      if (errorNode) continue // Saltar KMLs inválidos

      const geojson = kml(xml)
      if (geojson.type !== "FeatureCollection") continue

      const fc = geojson as GeoJSON.FeatureCollection
      if (!fc.features || fc.features.length === 0) continue

      // Nombre del archivo KML sin extensión
      const nombreKml = kmlFile.name.split("/").pop()?.replace(/\.kml$/i, "") || "Capa"

      results.push({ nombre: nombreKml, geojson: fc })
    }

    if (results.length === 0) {
      throw new Error("El KMZ no contiene KMLs con elementos geométricos válidos.")
    }

    return results
  } catch (err) {
    if (err instanceof Error) throw err
    throw new Error("No se pudo leer el archivo KMZ. Verifica que no esté dañado.")
  }
}

async function parseShapefileZip(file: File): Promise<GeoJSON.FeatureCollection> {
  let zip: JSZip
  try {
    const buffer = await file.arrayBuffer()
    zip = await JSZip.loadAsync(buffer)
  } catch {
    throw new Error("El archivo ZIP no se pudo leer. Asegúrate de que no está dañado o protegido con contraseña.")
  }

  const fileNames = Object.keys(zip.files)
  const hasShp = fileNames.some(n => n.toLowerCase().endsWith(".shp"))
  const hasDbf = fileNames.some(n => n.toLowerCase().endsWith(".dbf"))
  const hasShx = fileNames.some(n => n.toLowerCase().endsWith(".shx"))

  if (!hasShp) {
    throw new Error("El ZIP no contiene un archivo .shp. Para shapefiles, el ZIP debe incluir al menos .shp, .dbf y .shx.")
  }
  if (!hasDbf) {
    throw new Error("El ZIP no contiene un archivo .dbf (atributos). El shapefile está incompleto.")
  }
  if (!hasShx) {
    throw new Error("El ZIP no contiene un archivo .shx (índice). El shapefile está incompleto.")
  }

  try {
    const buffer = await file.arrayBuffer()
    const geojson = await shp(buffer) as unknown as GeoJSON.FeatureCollection
    return geojson
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes("but-unzip") || msg.includes("unzip") || msg.includes("corrupt")) {
      throw new Error("El ZIP no se pudo procesar internamente. Intenta re-exportar el shapefile desde tu GIS y generar un nuevo ZIP.")
    }
    throw new Error(`Error al procesar el shapefile: ${msg.length > 120 ? msg.substring(0, 120) + "..." : msg}`)
  }
}

function createLayer(nombre: string, geojson: GeoJSON.FeatureCollection): FileLayer {
  return {
    id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    nombre,
    geojson,
    color: nextColor(),
    visible: true,
    fillOpacity: 0.25,
    weight: 2,
    borderColor: nextColor(),
  }
}

export async function parseFile(file: File): Promise<FileLayer[]> {
  if (file.size > MAX_SIZE_BYTES) {
    throw new Error(`El archivo supera el límite de ${MAX_SIZE_BYTES / 1024 / 1024}MB (${(file.size / 1024 / 1024).toFixed(1)}MB recibidos).`)
  }

  const ext = getExtension(file.name)

  if (ext === "unknown") {
    const supported = SUPPORTED_EXTENSIONS.join(", ")
    throw new Error(`Formato no soportado (${file.name}). Formatos válidos: ${supported}`)
  }

  const nombreBase = file.name.replace(/\.[^.]+$/, "")

  switch (ext) {
    case "geojson": {
      const geojson = await parseGeoJson(file)
      if (!geojson.features || geojson.features.length === 0) {
        throw new Error("El archivo no contiene elementos geométricos.")
      }
      return [createLayer(nombreBase, geojson)]
    }
    case "kml": {
      const geojson = await parseKml(file)
      if (!geojson.features || geojson.features.length === 0) {
        throw new Error("El archivo no contiene elementos geométricos.")
      }
      return [createLayer(nombreBase, geojson)]
    }
    case "kmz": {
      const layers = await parseKmz(file)
      // Si solo hay un KML, usar el nombre del archivo KMZ
      if (layers.length === 1) {
        return [createLayer(nombreBase, layers[0].geojson)]
      }
      // Si hay varios, prefiere el nombre de cada KML pero con prefijo del KMZ
      return layers.map(l => createLayer(`${nombreBase} / ${l.nombre}`, l.geojson))
    }
    case "shp":
    case "zip": {
      const geojson = await parseShapefileZip(file)
      if (!geojson.features || geojson.features.length === 0) {
        throw new Error("El archivo no contiene elementos geométricos.")
      }
      return [createLayer(nombreBase, geojson)]
    }
    default:
      throw new Error("Formato no soportado.")
  }
}

export function getFileLayerBounds(layer: FileLayer): L.LatLngBoundsExpression | null {
  try {
    const geojson = layer.geojson
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity

    for (const feature of geojson.features) {
      extractCoords(feature.geometry).forEach(([lng, lat]) => {
        if (lat < minLat) minLat = lat
        if (lat > maxLat) maxLat = lat
        if (lng < minLng) minLng = lng
        if (lng > maxLng) maxLng = lng
      })
    }

    if (minLat === Infinity) return null
    return [[minLat, minLng], [maxLat, maxLng]]
  } catch {
    return null
  }
}

function extractCoords(geometry: GeoJSON.Geometry): [number, number][] {
  const coords: [number, number][] = []
  if (geometry.type === "Point") {
    coords.push(geometry.coordinates as [number, number])
  } else if (geometry.type === "MultiPoint" || geometry.type === "LineString") {
    coords.push(...(geometry.coordinates as [number, number][]))
  } else if (geometry.type === "MultiLineString" || geometry.type === "Polygon") {
    for (const ring of geometry.coordinates) {
      coords.push(...(ring as [number, number][]))
    }
  } else if (geometry.type === "MultiPolygon") {
    for (const polygon of geometry.coordinates) {
      for (const ring of polygon) {
        coords.push(...(ring as [number, number][]))
      }
    }
  } else if (geometry.type === "GeometryCollection" && geometry.geometries) {
    for (const g of geometry.geometries) {
      coords.push(...extractCoords(g))
    }
  }
  return coords
}
