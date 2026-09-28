"use client";

interface Props {
  /** Valor final exacto, tal como se muestra. */
  value: string;
  /** Etiqueta bajo la cifra. */
  label: string;
  className?: string;
}

// Cifras puras (con separadores es-ES o coma decimal) se componen en la escala de dato.
const PURE_NUMBER = /^\d{1,3}(\.\d{3})*(,\d+)?$|^\d+(,\d+)?$/;

/**
 * Cifra clave con su etiqueta. Estática: el dato se lee, no se anima.
 */
export default function KpiNumber({ value, label, className = "" }: Props) {
  const pure = PURE_NUMBER.test(value.trim());
  return (
    <div className={className}>
      <p
        className={
          pure
            ? "type-data-xl tnum text-[var(--text-primary)]"
            : "type-h2 tnum text-[var(--text-primary)]"
        }
      >
        {value}
      </p>
      <p className="type-body-sm mt-2 text-[var(--text-secondary)]">{label}</p>
    </div>
  );
}
