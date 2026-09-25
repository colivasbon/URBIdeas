interface Props {
  /** Profundidad de parallax en px para scroll completo del hero. 0 = estático. */
  depth?: number;
  className?: string;
}

/**
 * Retícula cartográfica geométrica, fina y precisa.
 *
 * Construida solo con CSS (`repeating-linear-gradient`, sin nodos DOM
 * extra, sin canvas). Retícula menor cada 24px casi imperceptible y
 * mayor cada 120px ligeramente marcada (120 = 5 × 24: las mayores
 * coinciden siempre con menores, sin líneas dobles). Puramente decorativa.
 */
export default function TerritorialGrid({ depth = 0, className = "" }: Props) {
  return (
    <div
      className={`territorial-grid ${className}`}
      data-depth={depth}
      aria-hidden="true"
      role="presentation"
    />
  );
}
