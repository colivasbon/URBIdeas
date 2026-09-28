interface Props {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}

/** Contenedor genérico: superficie plana con filete; el hover solo cambia el borde. */
export default function PremiumCard({ children, className = "", hover = false }: Props) {
  return (
    <article className={`premium-card ${hover ? "premium-card--hover" : ""} p-6 sm:p-7 ${className}`}>
      {children}
    </article>
  );
}
