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
          Selecciona una capa activa en el panel lateral y haz clic en el mapa para consultar sus datos.
        </p>
        <p style={{ color: 'var(--color-text-secondary)', margin: '6px 0 0', fontSize: 11 }}>
          {coordenadas.lat.toFixed(5)}, {coordenadas.lng.toFixed(5)}
        </p>
      </div>
    )
  }

  const withData = features.filter(f => !f.error && Object.keys(f.atributos).length > 0)
  const withErrors = features.filter(f => f.error)

  return (
    <div style={{ fontFamily: 'var(--font-family)', minWidth: 240, maxWidth: 360, maxHeight: 300, overflowY: 'auto' }}>
      <p style={{
        margin: '0 0 8px',
        fontSize: 11,
        color: 'var(--color-text-secondary)',
      }}>
        {coordenadas.lat.toFixed(5)}, {coordenadas.lng.toFixed(5)}
      </p>

      {withData.map((feature, i) => (
        <div key={i} style={{ marginBottom: withData.length > 1 ? 10 : 0 }}>
          <div style={{
            background: 'var(--color-primary)',
            color: 'var(--color-white)',
            padding: '3px 8px',
            borderRadius: 'var(--border-radius)',
            fontSize: 12,
            fontWeight: 600,
            marginBottom: 4,
          }}>
            {feature.capa}
          </div>
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
        </div>
      ))}

      {withErrors.length > 0 && withData.length === 0 && (
        <div style={{ padding: '4px 0' }}>
          {withErrors.map((feature, i) => (
            <p key={i} style={{ color: 'var(--color-text-muted)', fontSize: 11, margin: '2px 0' }}>
              <strong>{feature.capa}:</strong> {feature.error}
            </p>
          ))}
          <p style={{ color: 'var(--color-text-muted)', fontSize: 10, margin: '6px 0 0', fontStyle: 'italic' }}>
            Muchos servidores WMS no permiten consultas desde el navegador (CORS). Para datos completos, consulta el servicio directamente.
          </p>
        </div>
      )}

      {withErrors.length > 0 && withData.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary style={{ fontSize: 11, color: 'var(--color-text-muted)', cursor: 'pointer' }}>
            {withErrors.length} capa{withErrors.length > 1 ? 's' : ''} sin respuesta
          </summary>
          {withErrors.map((feature, i) => (
            <p key={i} style={{ color: 'var(--color-text-muted)', fontSize: 10, margin: '2px 0' }}>
              {feature.capa}: {feature.error}
            </p>
          ))}
        </details>
      )}
    </div>
  )
}
