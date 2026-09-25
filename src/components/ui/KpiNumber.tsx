"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  /** Valor final exacto, ya en el DOM para SEO y lectores de pantalla. */
  value: string;
  /** Etiqueta bajo la cifra. */
  label: string;
  className?: string;
}

function parseValue(value: string): { number: number; decimals: number } | null {
  const normalized = value.trim();
  // Solo animamos cifras puras (con separadores es-ES o punto decimal).
  if (!/^\d{1,3}(\.\d{3})*(,\d+)?$|^\d+(,\d+)?$/.test(normalized)) return null;
  const plain = normalized.replace(/\./g, "").replace(",", ".");
  const number = Number(plain);
  if (!Number.isFinite(number)) return null;
  const decimals = plain.includes(".") ? plain.split(".")[1].length : 0;
  return { number, decimals };
}

const formatter = (decimals: number) =>
  new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

/**
 * Cifra KPI con conteo animado (≤900 ms, ease-out, una sola vez, al entrar
 * en viewport). El valor final está siempre en el DOM; la animación es
 * decorativa (aria-hidden) y se desactiva con prefers-reduced-motion.
 */
export default function KpiNumber({ value, label, className = "" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [display, setDisplay] = useState(value);
  const parsed = parseValue(value);

  useEffect(() => {
    if (!parsed || typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    let started = false;
    const format = formatter(parsed.decimals);
    const final = format.format(parsed.number);

    const run = () => {
      const duration = 900;
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        setDisplay(format.format(parsed.number * eased));
        if (t < 1) raf = requestAnimationFrame(tick);
        else setDisplay(final);
      };
      setDisplay(format.format(0));
      raf = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !started) {
            started = true;
            run();
            observer.disconnect();
          }
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div ref={ref} className={className}>
      <p
        className={
          parsed
            ? "type-data-xl text-[var(--text-primary)]"
            : "text-2xl font-semibold tracking-[-0.01em] text-[var(--text-primary)]"
        }
      >
        <span aria-hidden="true">{display}</span>
        <span className="sr-only">{value}</span>
      </p>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">{label}</p>
    </div>
  );
}
