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
 * - `contours`: solo curvas de nivel (URBideas).
 * - `transition`: retícula y curvas de nivel superpuestas (home).
 *
 * Siempre estático: sin parallax ni movimiento.
 *
 * Puramente decorativo: `aria-hidden`, sin foco, sin pointer-events
 * (ver CSS `.territorial-background`). El contenido funcional del hero
 * queda por encima con z-index superior.
 */
export default function TerritorialBackground({ variant, className = "" }: Props) {
  return (
    <div
      className={`territorial-background territorial-background--${variant} ${className}`}
      data-parallax="off"
      aria-hidden="true"
      role="presentation"
    >
      {(variant === "grid" || variant === "transition") && (
        <TerritorialGrid />
      )}
      {(variant === "contours" || variant === "transition") && (
        <TopographicContours />
      )}
    </div>
  );
}
