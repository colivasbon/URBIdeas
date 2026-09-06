interface Props {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

/** Estado vacío elegante (sin datos, sin resultados). */
export default function EmptyState({ title, description, action }: Props) {
  return (
    <div className="premium-card p-6 text-center sm:p-8" role="status">
      <p className="text-base font-bold text-[var(--color-text-primary)]">{title}</p>
      {description ? (
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--color-text-muted)]">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
