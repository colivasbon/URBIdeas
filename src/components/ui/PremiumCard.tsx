interface Props {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}

/** Contenedor editorial genérico. Hover limitado a translateY(-2px). */
export default function PremiumCard({ children, className = "", hover = false }: Props) {
  return (
    <article className={`premium-card ${hover ? "premium-card--hover" : ""} p-6 sm:p-7 ${className}`}>
      {children}
    </article>
  );
}
