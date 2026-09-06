interface Props {
  title?: string;
  lines?: number;
}

/** Carga sobria: shimmer lento + mensaje funcional (no bloquea lectura). */
export default function LoadingState({ title = "Cargando…", lines = 3 }: Props) {
  return (
    <div role="status" aria-live="polite" aria-label={title} className="flex flex-col gap-3">
      <p className="text-sm font-semibold text-[var(--color-text-secondary)]">{title}</p>
      <div className="flex flex-col gap-2" aria-hidden="true">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="premium-skeleton h-4 w-full"
            style={{ opacity: 1 - i * 0.15 }}
          />
        ))}
      </div>
    </div>
  );
}
