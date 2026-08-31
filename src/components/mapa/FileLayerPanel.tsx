"use client"
import React, { useRef, useState } from 'react'
import type { FileLayer } from './fileLayerUtils'
import { parseFile } from './fileLayerUtils'

interface FileLayerPanelProps {
  fileLayers: FileLayer[]
  onAdd: (layer: FileLayer) => void
  onRemove: (id: string) => void
  onToggle: (id: string) => void
  onColorChange: (id: string, color: string) => void
  onZoomTo: (id: string) => void
}

export function FileLayerPanel({
  fileLayers,
  onAdd,
  onRemove,
  onToggle,
  onColorChange,
  onZoomTo,
}: FileLayerPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)
    setLoading(true)

    try {
      const layer = await parseFile(file)
      onAdd(layer)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al procesar archivo")
    } finally {
      setLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  return (
    <div className="border-t border-[var(--color-border)]">
      <div className="px-4 py-3">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-2 mb-2">
          <svg className="w-4 h-4 text-[var(--color-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
          </svg>
          Mis capas (sesión)
        </h3>
        <p className="text-[10px] text-[var(--color-text-secondary)] mb-3">
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
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-[var(--border-radius)] border border-dashed border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-secondary)] hover:text-[var(--color-secondary)] transition-colors disabled:opacity-50"
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
          <p className="mt-2 text-[10px] text-red-400">{error}</p>
        )}
      </div>

      {fileLayers.length > 0 && (
        <div className="px-4 pb-3 flex flex-col gap-1.5">
          {fileLayers.map(layer => (
            <div
              key={layer.id}
              className="flex items-center gap-2 p-2 rounded-[var(--border-radius)] border border-[var(--color-border)] bg-[var(--color-input-bg)]/50"
            >
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

              <input
                type="color"
                value={layer.color}
                onChange={(e) => onColorChange(layer.id, e.target.value)}
                className="w-4 h-4 rounded cursor-pointer border-0 p-0 bg-transparent"
                title="Cambiar color"
              />

              <button
                onClick={() => onZoomTo(layer.id)}
                className="text-[var(--color-text-secondary)] hover:text-[var(--color-secondary)] transition-colors"
                title="Zoom a extensión"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                </svg>
              </button>

              <button
                onClick={() => onRemove(layer.id)}
                className="text-[var(--color-text-secondary)] hover:text-red-400 transition-colors"
                title="Eliminar"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
