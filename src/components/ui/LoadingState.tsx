interface Props {
  title?: string;
  lines?: number;
}

/** Carga: bloques skeleton que replican la geometría final (CLS ≈ 0). */
export default function LoadingState({ title = "Cargando…", lines = 3 }: Props) {
  return (
    <div role="status" aria-live="polite" aria-label={title} className="flex flex-col gap-3">
      <p className="text-sm font-medium text-[var(--text-secondary)]">{title}</p>
      <div className="flex flex-col gap-2" aria-hidden="true">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="skeleton h-4"
            style={{ width: `${100 - i * 12}%` }}
          />
        ))}
      </div>
    </div>
  );
}
