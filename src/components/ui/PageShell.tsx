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

/** Cabecera de página: jerarquía clara, espaciado generoso, Poppins. */
export default function PageShell({ eyebrow, title, lede, actions, meta, children }: Props) {
  return (
    <section className="pb-8">
      <SectionEyebrow>{eyebrow}</SectionEyebrow>
      <h1 className="mt-3 max-w-3xl text-3xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-4xl" style={{ lineHeight: 1.15 }}>
        {title}
      </h1>
      {lede ? <p className="mt-3 max-w-2xl text-base leading-relaxed text-[var(--color-text-secondary)] sm:text-lg">{lede}</p> : null}
      {meta ? <div className="mt-4 flex flex-wrap items-center gap-2">{meta}</div> : null}
      {actions ? <div className="mt-5 flex flex-wrap gap-3">{actions}</div> : null}
      {children}
    </section>
  );
}
