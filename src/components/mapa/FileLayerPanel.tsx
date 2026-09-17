"use client"
import React, { useRef, useState, useCallback, useEffect } from 'react'
import type { FileLayer } from './fileLayerUtils'
import { parseFile } from './fileLayerUtils'
import { ProvinceSelector } from './ProvinceSelector'

interface SoilFeature {
  type: 'Feature'
  properties: Record<string, unknown>
  geometry: unknown
}

interface FileLayerPanelProps {
  fileLayers: FileLayer[]
  onAdd: (layer: FileLayer) => void
  onRemove: (id: string) => void
  onToggle: (id: string) => void
  onColorChange: (id: string, color: string) => void
  onFillOpacityChange: (id: string, fillOpacity: number) => void
  onWeightChange: (id: string, weight: number) => void
  onBorderColorChange: (id: string, borderColor: string) => void
  onZoomTo: (id: string) => void
  onSoilToggle?: (geojson: GeoJSON.FeatureCollection | null) => void
}

const CLASE_SUELO_COLORS: Record<string, string> = {
  'SUELO URBANO': '#e74c3c',
  'SUELO URBANO NO CONSOLIDADO': '#e67e22',
  'SUELO URBANIZABLE DELIMITADO O SECTORIZADO': '#f1c40f',
  'SUELO URBANIZABLE NO DELIMITADO O SECTORIZADO': '#2ecc71',
  'SUELO NO URBANIZABLE': '#3498db',
  'SISTEMAS GENERALES': '#9b59b6',
}

export function FileLayerPanel({
  fileLayers,
  onAdd,
  onRemove,
  onToggle,
  onColorChange,
  onFillOpacityChange,
  onWeightChange,
  onBorderColorChange,
  onZoomTo,
  onSoilToggle,
}: FileLayerPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showProvinceSelector, setShowProvinceSelector] = useState(true)
  const [selectedProvinces, setSelectedProvinces] = useState<string[]>([])
  const [soilGeoJSON, setSoilGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null)
  const [expandedLayer, setExpandedLayer] = useState<string | null>(null)

  const toggleProvince = useCallback((code: string) => {
    setSelectedProvinces(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    )
  }, [])

  useEffect(() => {
    if (selectedProvinces.length === 0) {
      setSoilGeoJSON(null)
      onSoilToggle?.(null)
      return
    }

    let cancelled = false

    async function loadProvinces() {
      const allFeatures: SoilFeature[] = []

      for (const code of selectedProvinces) {
        if (cancelled) break
        try {
          const res = await fetch(`/data/soil/province_${code}.geojson`)
          if (res.ok && !cancelled) {
            const data = await res.json()
            allFeatures.push(...data.features)
          }
        } catch { /* ignore */ }
      }

      if (!cancelled && allFeatures.length > 0) {
        const merged: GeoJSON.FeatureCollection = {
          type: 'FeatureCollection',
          features: allFeatures as unknown as GeoJSON.Feature[]
        }
        setSoilGeoJSON(merged)
        onSoilToggle?.(merged)
      } else if (!cancelled) {
        setSoilGeoJSON(null)
        onSoilToggle?.(null)
      }
    }

    loadProvinces()
    return () => { cancelled = true }
  }, [selectedProvinces])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)
    setLoading(true)

    try {
      const layers = await parseFile(file)
      layers.forEach(layer => onAdd(layer))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al procesar archivo")
    } finally {
      setLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  return (
    <div className="border-t border-[var(--color-border-subtle)]">
      {/* Soil Classification Section */}
      <div className="border-b border-[var(--color-border-subtle)]">
        <button
          onClick={() => setShowProvinceSelector(!showProvinceSelector)}
          className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-[var(--color-input-bg)] transition-colors"
        >
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-[var(--color-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
            </svg>
            <span className="text-sm font-medium text-[var(--color-text-primary)]">Clasificación de suelo</span>
          </div>
          <div className="flex items-center gap-2">
            {selectedProvinces.length > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-[6px] border border-conifera bg-crisopa text-carbon-deep">
                {selectedProvinces.length}
              </span>
            )}
            <svg className={`w-4 h-4 text-[var(--color-text-muted)] transition-transform ${showProvinceSelector ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </div>
        </button>

        {showProvinceSelector && (
          <ProvinceSelector
            selectedProvinces={selectedProvinces}
            onToggle={toggleProvince}
          />
        )}
      </div>

      {/* Legend */}
      {soilGeoJSON && (
        <div className="px-4 py-2 border-b border-[var(--color-border-subtle)]">
          <p className="text-[10px] font-medium text-[var(--color-text-muted)] mb-1">Leyenda:</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {Object.entries(CLASE_SUELO_COLORS).map(([name, color]) => (
              <div key={name} className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
                <span className="text-[9px] text-[var(--color-text-muted)]">{name.replace('SUELO ', '').replace(' DELIMITADO O SECTORIZADO', '').replace(' NO DELIMITADO O SECTORIZADO', ' (no delim.)').replace('SISTEMAS GENERALES', 'Sist. generales')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* File Upload Section */}
      <div className="px-4 py-3">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-2 mb-2">
          <svg className="w-4 h-4 text-[var(--color-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
          </svg>
          Mis capas (sesión)
        </h3>
        <p className="text-[10px] text-[var(--color-text-muted)] mb-3">
          GeoJSON, KML, KMZ, SHP — desaparecen al recargar
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".geojson,.json,.kml,.kmz,.shp,.zip"
          onChange={handleFileChange}
          className="hidden"
        />

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-[var(--border-radius)] border border-dashed border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)] transition-colors disabled:opacity-50"
        >
          {loading ? (
            <>
              <div className="animate-spin w-3.5 h-3.5 border-2 border-[var(--color-secondary)] border-t-transparent rounded-full" />
              Procesando...
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Cargar archivo
            </>
          )}
        </button>

        {error && (
          <p className="mt-2 text-[10px] text-[var(--color-error-light)]">{error}</p>
        )}
      </div>

      {/* Active file layers */}
      {fileLayers.length > 0 && (
        <div className="px-4 pb-3 flex flex-col gap-1.5">
          {fileLayers.map(layer => (
            <div
              key={layer.id}
              className="rounded-[var(--border-radius)] border border-[var(--color-border-subtle)] bg-[var(--color-input-bg)]/50"
            >
              <div className="flex items-center gap-2 p-2">
                <button
                  onClick={() => onToggle(layer.id)}
                  className="flex-shrink-0"
                  title={layer.visible ? "Ocultar" : "Mostrar"}
                >
                  <div
                    className="w-3 h-3 rounded-sm border flex items-center justify-center transition-colors"
                    style={{
                      background: layer.visible ? layer.color : 'transparent',
                      borderColor: layer.color,
                    }}
                  >
                    {layer.visible && (
                      <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </button>

                <span className="flex-1 text-xs text-[var(--color-text-primary)] truncate">
                  {layer.nombre}
                </span>

                <button
                  onClick={() => setExpandedLayer(expandedLayer === layer.id ? null : layer.id)}
                  className="text-[var(--color-text-muted)] hover:text-[var(--color-secondary)] transition-colors"
                  title="Estilos"
                >
                  <svg className={`w-3 h-3 transition-transform ${expandedLayer === layer.id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>

                <button
                  onClick={() => onZoomTo(layer.id)}
                  className="text-[var(--color-text-muted)] hover:text-[var(--color-secondary)] transition-colors"
                  title="Zoom a extensión"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                  </svg>
                </button>

                <button
                  onClick={() => onRemove(layer.id)}
                  className="text-[var(--color-text-muted)] hover:text-[var(--color-error-light)] transition-colors"
                  title="Eliminar"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Panel de estilos expandible */}
              {expandedLayer === layer.id && (
                <div className="px-3 pb-3 pt-1 border-t border-[var(--color-border-subtle)]">
                  <div className="space-y-2">
                    {/* Color de relleno */}
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-[var(--color-text-muted)]">Relleno</label>
                      <input
                        type="color"
                        value={layer.color}
                        onChange={(e) => onColorChange(layer.id, e.target.value)}
                        className="w-5 h-5 rounded cursor-pointer border-0 p-0 bg-transparent"
                      />
                    </div>

                    {/* Opacidad del relleno */}
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-[var(--color-text-muted)]">Opacidad</label>
                      <div className="flex items-center gap-1">
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={layer.fillOpacity}
                          onChange={(e) => onFillOpacityChange(layer.id, parseFloat(e.target.value))}
                          className="w-16 h-1 accent-[var(--color-secondary)]"
                        />
                        <span className="text-[9px] text-[var(--color-text-muted)] w-6 text-right">
                          {Math.round(layer.fillOpacity * 100)}%
                        </span>
                      </div>
                    </div>

                    {/* Color del borde */}
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-[var(--color-text-muted)]">Borde</label>
                      <input
                        type="color"
                        value={layer.borderColor}
                        onChange={(e) => onBorderColorChange(layer.id, e.target.value)}
                        className="w-5 h-5 rounded cursor-pointer border-0 p-0 bg-transparent"
                      />
                    </div>

                    {/* Grosor del borde */}
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-[var(--color-text-muted)]">Grosor</label>
                      <div className="flex items-center gap-1">
                        <input
                          type="range"
                          min="1"
                          max="10"
                          step="1"
                          value={layer.weight}
                          onChange={(e) => onWeightChange(layer.id, parseInt(e.target.value))}
                          className="w-16 h-1 accent-[var(--color-secondary)]"
                        />
                        <span className="text-[9px] text-[var(--color-text-muted)] w-6 text-right">
                          {layer.weight}px
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
