interface Props {
  etiqueta: string;
  valor: string;
  detalle?: string;
}

/**
 * KPI SOCideas en lenguaje premium. Compatible con `StatCard`
 * (misma firma) para evolucionar usos sin romper.
 */
export default function DataCard({ etiqueta, valor, detalle }: Props) {
  return (
    <div className="data-card">
      <p className="data-card__label">{etiqueta}</p>
      <p className="data-card__value">{valor}</p>
      {detalle ? <p className="data-card__detail">{detalle}</p> : null}
    </div>
  );
}
