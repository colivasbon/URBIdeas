"use client";

interface Props {
  children: React.ReactNode;
  /** Conservado por compatibilidad; ya no tiene efecto (sin animación de entrada). */
  delay?: number;
  className?: string;
}

/**
 * Envoltorio neutro. Antes animaba la entrada por scroll; el contenido
 * técnico se muestra sin animación decorativa.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function SectionReveal({ children, delay = 0, className = "" }: Props) {
  return <div className={className || undefined}>{children}</div>;
}
