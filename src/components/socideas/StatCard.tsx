interface StatCardProps {
  etiqueta: string;
  valor: string;
  detalle?: string;
}

// Tarjeta de indicador SOCideas (presentacional, sin datos propios).
export default function StatCard({ etiqueta, valor, detalle }: StatCardProps) {
  return (
    <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-card-bg)] p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
        {etiqueta}
      </p>
      <p className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-[var(--color-text-primary)] tabular-nums">
        {valor}
      </p>
      {detalle && (
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">{detalle}</p>
      )}
    </div>
  );
}
