interface StatCardProps {
  etiqueta: string;
  valor: string;
  detalle?: string;
}

// Tarjeta de indicador SOCideas (presentacional, sin datos propios).
// Lenguaje premium: misma firma, clases del sistema compartido.
export default function StatCard({ etiqueta, valor, detalle }: StatCardProps) {
  return (
    <div className="data-card">
      <p className="data-card__label">
        {etiqueta}
      </p>
      <p className="data-card__value">
        {valor}
      </p>
      {detalle && (
        <p className="data-card__detail">{detalle}</p>
      )}
    </div>
  );
}
