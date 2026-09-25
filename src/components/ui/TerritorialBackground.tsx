import TerritorialGrid from "./TerritorialGrid";
import TopographicContours from "./TopographicContours";

export type TerritorialVariant = "grid" | "contours" | "transition";

interface Props {
  variant: TerritorialVariant;
  className?: string;
}

/**
 * Fondo territorial decorativo (grid / curvas / transición).
 *
 * - `grid`: solo retícula cartográfica, estática (SOCideas).
 * - `contours`: solo curvas de nivel, parallax lento (URBideas).
 * - `transition`: grid a la izquierda que se desvanece hacia curvas de
 *   nivel a la derecha, con profundidades distintas (home).
 *
 * Puramente decorativo: `aria-hidden`, sin foco, sin pointer-events
 * (ver CSS `.territorial-background`). El contenido funcional del hero
 * queda por encima con z-index superior.
 */
export default function TerritorialBackground({ variant, className = "" }: Props) {
  const parallax = variant === "grid" ? "off" : "on";

  return (
    <div
      className={`territorial-background territorial-background--${variant} ${className}`}
      data-parallax={parallax}
      aria-hidden="true"
      role="presentation"
    >
      {(variant === "grid" || variant === "transition") && (
        <TerritorialGrid depth={variant === "transition" ? 10 : 0} />
      )}
      {(variant === "contours" || variant === "transition") && (
        <TopographicContours depth={variant === "transition" ? 18 : 12} />
      )}
    </div>
  );
}
