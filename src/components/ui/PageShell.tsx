import type { ReactNode } from "react";
import SectionEyebrow from "./SectionEyebrow";

interface Props {
  eyebrow: string;
  title: string;
  lede?: string;
  actions?: ReactNode;
  meta?: ReactNode;
  children?: ReactNode;
}

/** Cabecera editorial de página/sección: jerarquía + acciones + meta. */
export default function PageShell({ eyebrow, title, lede, actions, meta, children }: Props) {
  return (
    <section className="border-b border-[var(--color-border-subtle)] pb-8">
      <SectionEyebrow>{eyebrow}</SectionEyebrow>
      <h1 className="editorial-display mt-3 text-3xl text-[var(--color-text-primary)] sm:text-4xl">
        {title}
      </h1>
      {lede ? <p className="editorial-lede mt-3 max-w-3xl">{lede}</p> : null}
      {meta ? <div className="mt-4 flex flex-wrap items-center gap-2">{meta}</div> : null}
      {actions ? <div className="mt-5 flex flex-wrap gap-3">{actions}</div> : null}
      {children}
    </section>
  );
}
