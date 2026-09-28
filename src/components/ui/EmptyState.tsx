interface Props {
  title: string;
  description?: string;
  action?: React.ReactNode;
  /** Icono funcional opcional. Sin icono por defecto: el texto explica el estado. */
  icon?: React.ReactNode;
}

/** Estado vacío: composición tipográfica sobre filete discontinuo, sin ilustración. */
export default function EmptyState({ title, description, action, icon }: Props) {
  return (
    <div
      className="flex flex-col items-start gap-2 rounded-[6px] border border-dashed border-[var(--border-default)] px-5 py-8 sm:px-6"
      role="status"
    >
      {icon ? (
        <span className="text-[var(--moss-ink)]" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <h4 className="type-h4 text-[var(--text-primary)]">{title}</h4>
      {description ? (
        <p className="type-body-sm max-w-[60ch] text-[var(--text-secondary)]">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
