interface Props {
  children: React.ReactNode;
  title?: string;
}

/** Cápsula de trazabilidad/frescura: fuente, fecha o estado. */
export default function SourcePill({ children, title }: Props) {
  return (
    <span className="source-pill" title={title}>
      <span aria-hidden="true" className="source-pill__dot" />
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}
