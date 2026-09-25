interface Props {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}

/** Estado vacío: composición tipográfica con icono lineal, sin ilustración. */
export default function EmptyState({ title, description, action, icon }: Props) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[6px] border border-dashed border-[var(--border-default)] bg-[var(--bg-surface)] px-6 py-10 text-center" role="status">
      <span className="text-[var(--musgo)]" aria-hidden="true">
        {icon ?? (
          <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z" />
          </svg>
        )}
      </span>
      <h4 className="type-h4 text-[var(--text-primary)]">{title}</h4>
      {description ? (
        <p className="measure text-sm leading-relaxed text-[var(--text-secondary)]">{description}</p>
      ) : null}
      {action ? <div className="mt-1 flex justify-center">{action}</div> : null}
    </div>
  );
}
