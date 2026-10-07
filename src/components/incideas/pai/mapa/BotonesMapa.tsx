"use client";

import { SuperpuestoMapa } from "./ElementosMapa";

interface Props {
  pantallaCompleta: boolean;
  hayFiguras: boolean;
  hayMediciones: boolean;
  onPantallaCompleta: () => void;
  onEncuadrarFiguras: () => void;
  onEncuadrarMediciones: () => void;
}

const clase =
  "rounded-[6px] bg-[#F1F1F1] px-3 py-2 text-xs font-semibold text-[#3C403E] shadow-[0_1px_6px_rgba(0,0,0,0.3)] transition-colors hover:bg-[#C2E189] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3E665C]";

export default function BotonesMapa({ pantallaCompleta, hayFiguras, hayMediciones, onPantallaCompleta, onEncuadrarFiguras, onEncuadrarMediciones }: Props) {
  return (
    <SuperpuestoMapa className="absolute right-3 top-3 z-[1000] flex flex-col items-end gap-2">
      <button type="button" className={clase} onClick={onPantallaCompleta} aria-pressed={pantallaCompleta}>
        {pantallaCompleta ? "Salir de pantalla completa" : "Pantalla completa"}
      </button>
      <button type="button" className={clase} onClick={onEncuadrarFiguras} disabled={!hayFiguras}>
        Ir al ámbito
      </button>
      <button type="button" className={clase} onClick={onEncuadrarMediciones} disabled={!hayMediciones}>
        Ver mediciones
      </button>
    </SuperpuestoMapa>
  );
}
