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

export function GetFeatureInfoPopup({ features, coordenadas }: GetFeatureInfoPopupProps) {
  if (!features.length) {
    return (
      <div style={{ fontFamily: 'var(--font-family)', minWidth: 200 }}>
        <p style={{ color: 'var(--color-text-secondary)', margin: 0, fontSize: 13 }}>
          No se encontraron elementos en esta ubicación.
        </p>
        <p style={{ color: 'var(--color-text-secondary)', margin: '4px 0 0', fontSize: 11 }}>
          {coordenadas.lat.toFixed(5)}, {coordenadas.lng.toFixed(5)}
        </p>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: 'var(--font-family)', minWidth: 240, maxWidth: 360 }}>
      <p style={{
        margin: '0 0 8px',
        fontSize: 11,
        color: 'var(--color-text-secondary)',
      }}>
        {coordenadas.lat.toFixed(5)}, {coordenadas.lng.toFixed(5)}
      </p>
      {features.map((feature, i) => (
        <div key={i} style={{ marginBottom: i < features.length - 1 ? 10 : 0 }}>
          <div style={{
            background: feature.error ? '#92400e' : 'var(--color-primary)',
            color: '#fff',
            padding: '3px 8px',
            borderRadius: 'var(--border-radius)',
            fontSize: 12,
            fontWeight: 600,
            marginBottom: 4,
          }}>
            {feature.capa}
          </div>
          {feature.error ? (
            <p style={{ color: '#fbbf24', fontSize: 11, margin: '2px 0 0' }}>
              {feature.error}
            </p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <tbody>
                {Object.entries(feature.atributos).map(([key, value]) => (
                  <tr key={key}>
                    <td style={{
                      padding: '2px 6px 2px 0',
                      color: 'var(--color-text-secondary)',
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                      verticalAlign: 'top',
                    }}>
                      {key}
                    </td>
                    <td style={{
                      padding: '2px 0',
                      color: 'var(--color-text-primary)',
                      wordBreak: 'break-word',
                    }}>
                      {value || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  )
}
