"use client"
import React, { useRef, useState, useCallback, useEffect } from 'react'
import type { FileLayer } from './fileLayerUtils'
import { parseFile } from './fileLayerUtils'
import { ProvinceSelector } from './ProvinceSelector'
import { CLASES_SUELO } from './SoilGeoJsonLayer'

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
      setError(err instanceof Error ? err.message : "No se pudo leer el archivo. Compruebe que es GeoJSON, KML, KMZ o un shapefile comprimido.")
    } finally {
      setLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const iconBtn = "flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"

  return (
    <div>
      {/* Clasificación de suelo por provincias */}
      <div className="border-b border-[var(--border-subtle)]">
        <button
          type="button"
          onClick={() => setShowProvinceSelector(!showProvinceSelector)}
          aria-expanded={showProvinceSelector}
          className="flex min-h-[48px] w-full items-center justify-between gap-2 px-4 text-left transition-colors hover:bg-[var(--bg-surface-sunken)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
        >
          <span className="text-sm font-semibold text-[var(--text-primary)]">Clasificación de suelo</span>
          <span className="flex items-center gap-2">
            {selectedProvinces.length > 0 && (
              <span className="badge badge-available tnum">
                {selectedProvinces.length}
                <span className="sr-only"> provincias seleccionadas</span>
              </span>
            )}
            <svg aria-hidden="true" className={`h-4 w-4 text-[var(--text-muted)] transition-transform ${showProvinceSelector ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </span>
        </button>

        {showProvinceSelector && (
          <ProvinceSelector
            selectedProvinces={selectedProvinces}
            onToggle={toggleProvince}
          />
        )}
      </div>

      {/* Leyenda */}
      {soilGeoJSON && (
        <div className="border-b border-[var(--border-subtle)] px-4 py-3">
          <p className="mb-2 text-xs font-medium text-[var(--text-secondary)]">Leyenda</p>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            {CLASES_SUELO.map(c => (
              <li key={c.clave} className="flex items-center gap-2">
                <span aria-hidden="true" className="h-3 w-3 shrink-0 border border-[var(--carbon)]" style={{ background: c.color }} />
                <span className="text-[11px] leading-tight text-[var(--text-secondary)]">{c.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Capas de archivo */}
      <div className="px-4 py-4">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Mis capas de sesión</h3>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          GeoJSON, KML, KMZ o shapefile comprimido. Se descartan al recargar la página.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".geojson,.json,.kml,.kmz,.shp,.zip"
          onChange={handleFileChange}
          className="hidden"
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
          className="btn btn-secondary btn-sm mt-3 w-full"
        >
          {loading ? (
            <>
              <span className="spinner" aria-hidden="true" />
              Procesando archivo…
            </>
          ) : (
            'Subir archivo'
          )}
        </button>

        {error && (
          <p className="mt-2 text-xs text-[var(--danger-ink)]" role="alert">{error}</p>
        )}
      </div>

      {/* Capas de archivo activas */}
      {fileLayers.length > 0 && (
        <ul className="flex flex-col gap-2 px-4 pb-4">
          {fileLayers.map(layer => (
            <li
              key={layer.id}
              className="rounded-[6px] border border-[var(--border-subtle)]"
            >
              <div className="flex items-center gap-1 py-1 pr-1 pl-2">
                <button
                  type="button"
                  onClick={() => onToggle(layer.id)}
                  className={iconBtn}
                  title={layer.visible ? "Ocultar" : "Mostrar"}
                  aria-label={layer.visible ? `Ocultar ${layer.nombre}` : `Mostrar ${layer.nombre}`}
                  aria-pressed={layer.visible}
                >
                  <span
                    aria-hidden="true"
                    className="h-3.5 w-3.5 border-2 transition-colors"
                    style={{
                      background: layer.visible ? layer.color : 'transparent',
                      borderColor: layer.borderColor,
                    }}
                  />
                </button>

                <span className={`min-w-0 flex-1 truncate text-sm ${layer.visible ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
                  {layer.nombre}
                </span>

                <button
                  type="button"
                  onClick={() => setExpandedLayer(expandedLayer === layer.id ? null : layer.id)}
                  className={iconBtn}
                  title="Estilos"
                  aria-label={`Estilos de ${layer.nombre}`}
                  aria-expanded={expandedLayer === layer.id}
                >
                  <svg aria-hidden="true" className={`h-3.5 w-3.5 transition-transform ${expandedLayer === layer.id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>

                <button
                  type="button"
                  onClick={() => onZoomTo(layer.id)}
                  className={iconBtn}
                  title="Encuadrar la capa"
                  aria-label={`Encuadrar ${layer.nombre}`}
                >
                  <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                  </svg>
                </button>

                <button
                  type="button"
                  onClick={() => onRemove(layer.id)}
                  className={`${iconBtn} hover:text-[var(--danger-ink)]`}
                  title="Quitar"
                  aria-label={`Quitar ${layer.nombre}`}
                >
                  <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Estilos de la capa */}
              {expandedLayer === layer.id && (
                <div className="grid gap-3 border-t border-[var(--border-subtle)] px-3 py-3 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor={`${layer.id}-relleno`} className="text-[var(--text-secondary)]">Relleno</label>
                    <input
                      id={`${layer.id}-relleno`}
                      type="color"
                      value={layer.color}
                      onChange={(e) => onColorChange(layer.id, e.target.value)}
                      className="h-7 w-10 cursor-pointer rounded-[6px] border border-[var(--border-subtle)] bg-transparent p-0.5"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor={`${layer.id}-opacidad`} className="text-[var(--text-secondary)]">Opacidad del relleno</label>
                    <div className="flex items-center gap-2">
                      <input
                        id={`${layer.id}-opacidad`}
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={layer.fillOpacity}
                        onChange={(e) => onFillOpacityChange(layer.id, parseFloat(e.target.value))}
                        className="w-24 cursor-pointer accent-[var(--musgo)]"
                      />
                      <span className="tnum w-9 text-right text-[var(--text-muted)]">
                        {Math.round(layer.fillOpacity * 100)} %
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor={`${layer.id}-borde`} className="text-[var(--text-secondary)]">Borde</label>
                    <input
                      id={`${layer.id}-borde`}
                      type="color"
                      value={layer.borderColor}
                      onChange={(e) => onBorderColorChange(layer.id, e.target.value)}
                      className="h-7 w-10 cursor-pointer rounded-[6px] border border-[var(--border-subtle)] bg-transparent p-0.5"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor={`${layer.id}-grosor`} className="text-[var(--text-secondary)]">Grosor del borde</label>
                    <div className="flex items-center gap-2">
                      <input
                        id={`${layer.id}-grosor`}
                        type="range"
                        min="1"
                        max="10"
                        step="1"
                        value={layer.weight}
                        onChange={(e) => onWeightChange(layer.id, parseInt(e.target.value))}
                        className="w-24 cursor-pointer accent-[var(--musgo)]"
                      />
                      <span className="tnum w-9 text-right text-[var(--text-muted)]">
                        {layer.weight} px
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
