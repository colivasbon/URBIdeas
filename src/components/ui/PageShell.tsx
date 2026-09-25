import type { ReactNode } from "react";
import SectionEyebrow from "./SectionEyebrow";

interface Props {
  eyebrow: string;
  title: string;
  lede?: string;
  actions?: ReactNode;
  meta?: ReactNode;
  breadcrumbs?: ReactNode;
  children?: ReactNode;
}

/** Cabecera de página: eyebrow + h1 + lede + metadatos y acciones. */
export default function PageShell({ eyebrow, title, lede, actions, meta, breadcrumbs, children }: Props) {
  return (
    <header className="pb-6">
      {breadcrumbs ? <div className="mb-4">{breadcrumbs}</div> : null}
      <SectionEyebrow>{eyebrow}</SectionEyebrow>
      <h1 className="type-h1 mt-3 max-w-3xl text-[var(--text-primary)]">{title}</h1>
      {lede ? (
        <p className="measure mt-3 text-[var(--fs-body-lg)] leading-[var(--lh-body-lg)] text-[var(--text-secondary)]">
          {lede}
        </p>
      ) : null}
      {meta ? <div className="mt-4 flex flex-wrap items-center gap-2">{meta}</div> : null}
      {actions ? <div className="mt-5 flex flex-wrap gap-3">{actions}</div> : null}
      {children}
    </header>
  );
}
