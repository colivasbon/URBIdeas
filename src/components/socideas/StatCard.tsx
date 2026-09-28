import { FIGURE, FIGURE_DETAIL, FIGURE_LABEL, FIGURE_VALUE } from "./ficha-ui";

interface StatCardProps {
  etiqueta: string;
  valor: string;
  detalle?: string;
}

// Cifra clave SOCideas (presentacional, sin datos propios): número tabular
// grande, etiqueta debajo y fuente/año visibles. Sin tarjeta ni sombra: el
// filete superior la agrupa con las demás cifras de la fila.
export default function StatCard({ etiqueta, valor, detalle }: StatCardProps) {
  return (
    <div className={FIGURE}>
      <p className={FIGURE_VALUE}>{valor}</p>
      <p className={FIGURE_LABEL}>{etiqueta}</p>
      {detalle && <p className={FIGURE_DETAIL}>{detalle}</p>}
    </div>
  );
}
