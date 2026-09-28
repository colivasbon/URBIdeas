"use client"
import React from 'react'

export interface FeatureInfo {
  capa: string
  atributos: Record<string, string>
  error?: string
}

interface GetFeatureInfoPopupProps {
  features: FeatureInfo[]
  coordenadas: { lat: number; lng: number }
}

// El popup de Leaflet ya lleva superficie, borde, radio y sombra del sistema
// (globals.css). Se usan <div> y no <p> porque leaflet.css, sin capa,
// impone márgenes a los párrafos por encima de las utilidades.
export function GetFeatureInfoPopup({ features, coordenadas }: GetFeatureInfoPopupProps) {
  const coords = (
    <div className="tnum text-[11px] text-[var(--text-muted)]">
      {coordenadas.lat.toFixed(5)}, {coordenadas.lng.toFixed(5)}
    </div>
  )

  if (!features.length) {
    return (
      <div className="min-w-[200px]">
        <div className="m-0 text-[13px] text-[var(--text-secondary)]">
          Active una capa en el panel lateral y pulse sobre el mapa para consultar sus datos.
        </div>
        <div className="mt-1.5">{coords}</div>
      </div>
    )
  }

  const withData = features.filter(f => !f.error && Object.keys(f.atributos).length > 0)
  const withErrors = features.filter(f => f.error)

  return (
    <div className="max-h-[300px] min-w-[240px] max-w-[360px] overflow-y-auto">
      {coords}

      {withData.map((feature, i) => (
        <div key={i} className="mt-2.5">
          <div className="m-0 border-b border-[var(--border-subtle)] pb-1 text-[13px] font-semibold text-[var(--text-primary)]">
            {feature.capa}
          </div>
          <table className="mt-1 w-full border-collapse text-xs">
            <tbody>
              {Object.entries(feature.atributos).map(([key, value]) => (
                <tr key={key}>
                  <td className="whitespace-nowrap py-0.5 pr-2 align-top font-medium text-[var(--text-muted)]">
                    {key}
                  </td>
                  <td className="break-words py-0.5 text-[var(--text-primary)]">
                    {value || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {withErrors.length > 0 && withData.length === 0 && (
        <div className="mt-2">
          {withErrors.map((feature, i) => (
            <div key={i} className="my-0.5 text-[11px] text-[var(--text-secondary)]">
              <span className="font-medium text-[var(--text-primary)]">{feature.capa}:</span> {feature.error}
            </div>
          ))}
          <div className="mt-1.5 text-[11px] text-[var(--text-muted)]">
            Muchos servidores WMS no admiten consultas desde el navegador (CORS). Para obtener los datos completos, consulte el servicio directamente.
          </div>
        </div>
      )}

      {withErrors.length > 0 && withData.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] text-[var(--text-muted)]">
            {withErrors.length} capa{withErrors.length > 1 ? 's' : ''} sin respuesta
          </summary>
          {withErrors.map((feature, i) => (
            <div key={i} className="my-0.5 text-[11px] text-[var(--text-muted)]">
              {feature.capa}: {feature.error}
            </div>
          ))}
        </details>
      )}
    </div>
  )
}
