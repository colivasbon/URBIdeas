import TopographicContours from "@/components/ui/TopographicContours";

/**
 * Hoja cartográfica: marco con retícula geográfica rotulada en los bordes,
 * como una hoja del MTN. Los rótulos corresponden a la extensión de la España
 * peninsular (36°–44° N, 9° O–4° E); el marco no es una proyección, es el
 * soporte del contenido de portada. Las curvas de nivel ocupan el interior
 * derecho y quedan recortadas por el marco.
 */

// Posición en % a lo largo del borde (izquierda→derecha, arriba→abajo).
const MERIDIANOS = [
  { label: "8° O", at: 7.7 },
  { label: "5° O", at: 30.8 },
  { label: "2° O", at: 53.8 },
  { label: "1° E", at: 76.9 },
];
const PARALELOS = [
  { label: "43° N", at: 12.5 },
  { label: "41° N", at: 37.5 },
  { label: "39° N", at: 62.5 },
  { label: "37° N", at: 87.5 },
];

export type SheetLegendItem = { label: string; value: string };

interface Props {
  children: React.ReactNode;
  /** Cajetín: datos de la hoja al pie del marco (cobertura, fuentes). */
  legend?: SheetLegendItem[];
  /** Relieve interior. Desactívelo si el contenido ocupa todo el ancho. */
  relief?: boolean;
}

export default function MapSheet({ children, legend, relief = true }: Props) {
  return (
    <div className="map-sheet">
      <div className="map-sheet__ticks map-sheet__ticks--top" aria-hidden="true">
        {MERIDIANOS.map((m) => (
          <span key={m.label} className="map-sheet__tick" style={{ left: `${m.at}%` }} />
        ))}
      </div>
      <div className="map-sheet__ticks map-sheet__ticks--left" aria-hidden="true">
        {PARALELOS.map((p) => (
          <span key={p.label} className="map-sheet__tick" style={{ top: `${p.at}%` }} />
        ))}
      </div>
      <div className="map-sheet__frame">
        {/* Marcas sin rótulo en los bordes opuestos, como en la hoja impresa. */}
        <div className="map-sheet__edge map-sheet__edge--bottom" aria-hidden="true">
          {MERIDIANOS.map((m) => (
            <span key={m.label} style={{ left: `${m.at}%` }} />
          ))}
        </div>
        <div className="map-sheet__edge map-sheet__edge--right" aria-hidden="true">
          {PARALELOS.map((p) => (
            <span key={p.label} style={{ top: `${p.at}%` }} />
          ))}
        </div>
        {relief && (
          <div className="map-sheet__relief" aria-hidden="true">
            <TopographicContours align="xMaxYMid" />
          </div>
        )}
        <div className="map-sheet__body">{children}</div>
        {legend && legend.length > 0 && (
          <dl className="map-sheet__legend">
            {legend.map((item) => (
              <div key={item.label} className="map-sheet__legend-item">
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}
