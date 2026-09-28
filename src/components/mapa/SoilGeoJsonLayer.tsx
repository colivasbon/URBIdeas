"use client"
import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
// `import type` se borra al compilar: Leaflet toca `window` en cuanto se evalúa
// el módulo, y este fichero también lo importa `FileLayerPanel` para leer
// CLASES_SUELO. Traer Leaflet al grafo de SSR rompía el prerender de
// /urbideas/mapa. El valor se carga de forma perezosa dentro del efecto, que
// solo corre en el cliente.
import type * as Leaflet from 'leaflet'

/**
 * Clases de suelo → paleta corporativa. Leaflet pinta en SVG con atributos de
 * presentación, que no resuelven var(): los colores van en literal.
 * Convención cartográfica: urbano en rupestre, urbanizable en retama/crisopa,
 * rústico en conífera, sistemas generales en musgo.
 */
export const CLASES_SUELO: { clave: string; label: string; color: string }[] = [
  { clave: 'SUELO URBANO', label: 'Urbano', color: '#643335' },
  { clave: 'SUELO URBANO NO CONSOLIDADO', label: 'Urbano no consolidado', color: '#BF8E8E' },
  { clave: 'SUELO URBANIZABLE DELIMITADO O SECTORIZADO', label: 'Urbanizable delimitado', color: '#FBE122' },
  { clave: 'SUELO URBANIZABLE NO DELIMITADO O SECTORIZADO', label: 'Urbanizable no delimitado', color: '#C2E189' },
  { clave: 'SUELO NO URBANIZABLE', label: 'No urbanizable', color: '#86B73D' },
  { clave: 'SISTEMAS GENERALES', label: 'Sistemas generales', color: '#3E665C' },
]

const COLOR_POR_CLASE: Record<string, string> = Object.fromEntries(CLASES_SUELO.map(c => [c.clave, c.color]))
const LABEL_POR_CLASE: Record<string, string> = Object.fromEntries(CLASES_SUELO.map(c => [c.clave, c.label]))
const COLOR_SIN_CLASE = '#B0BDB0' // limo
const TRAZO = '#3C403E' // carbón

interface SoilGeoJsonLayerProps {
  geojson: GeoJSON.FeatureCollection | null
}

export function SoilGeoJsonLayer({ geojson }: SoilGeoJsonLayerProps) {
  const map = useMap()
  const layerRef = useRef<Leaflet.GeoJSON | null>(null)

  useEffect(() => {
    let cancelado = false

    const limpiar = () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current)
        layerRef.current = null
      }
    }

    limpiar()
    if (!geojson || geojson.features.length === 0) return limpiar

    void (async () => {
      const mod = (await import('leaflet')) as unknown as typeof Leaflet & { default?: typeof Leaflet }
      if (cancelado) return
      const L = mod.default ?? mod

      const geoJsonLayer = L.geoJSON(geojson, {
        style: (feature) => {
          const clase = feature?.properties?.ClaseSuelo || ''
          const color = COLOR_POR_CLASE[clase] || COLOR_SIN_CLASE
          return {
            color: TRAZO,
            weight: 0.5,
            opacity: 0.5,
            fillColor: color,
            fillOpacity: 0.5,
          }
        },
        onEachFeature: (feature, leafletLayer) => {
          const props = feature.properties || {}
          const clase = props.ClaseSuelo || ''
          const color = COLOR_POR_CLASE[clase] || COLOR_SIN_CLASE
          const label = LABEL_POR_CLASE[clase] || clase || 'Sin clasificar'

          const popupContent = `
          <div style="font-family:var(--font-family);min-width:180px">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
              <span style="width:12px;height:12px;flex:none;background:${color};border:1px solid ${TRAZO}"></span>
              <span style="font-size:13px;font-weight:600;color:var(--text-primary)">${label}</span>
            </div>
            <table style="font-size:12px;border-collapse:collapse;width:100%">
              ${props.NuclRural ? `<tr><td style="padding:2px 8px 2px 0;color:var(--text-muted)">Núcleo rural</td><td style="padding:2px 0;color:var(--text-primary)">${props.NuclRural}</td></tr>` : ''}
              ${props.AreaLamber ? `<tr><td style="padding:2px 8px 2px 0;color:var(--text-muted)">Área (Lambert)</td><td style="padding:2px 0;color:var(--text-primary);font-variant-numeric:tabular-nums">${Number(props.AreaLamber).toLocaleString('es-ES')} m²</td></tr>` : ''}
            </table>
          </div>
        `
          leafletLayer.bindPopup(popupContent, { maxWidth: 300, className: 'urbideas-popup' })
        },
      })

      if (cancelado) return
      geoJsonLayer.addTo(map)
      layerRef.current = geoJsonLayer
    })()

    return () => {
      cancelado = true
      limpiar()
    }
  }, [map, geojson])

  return null
}
