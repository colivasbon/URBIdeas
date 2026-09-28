import type { ReactNode } from "react";

interface Props {
  /** Rótulo opcional sobre el título (módulo o contexto). Sin mayúsculas. */
  eyebrow?: string;
  title: string;
  lede?: string;
  actions?: ReactNode;
  meta?: ReactNode;
  breadcrumbs?: ReactNode;
  children?: ReactNode;
}

/**
 * Cabecera de página interior (nivel 2): migas, título, entradilla, metadatos
 * y acciones sobre el fondo de página, cerrada por un filete musgo. Las
 * portadas de plataforma y módulo usan la hoja cartográfica (MapSheet).
 */
export default function PageShell({ eyebrow, title, lede, actions, meta, breadcrumbs, children }: Props) {
  return (
    <header className="page-head">
      {breadcrumbs ? <div className="mb-6">{breadcrumbs}</div> : null}
      {eyebrow ? <p className="type-label text-[var(--moss-ink)]">{eyebrow}</p> : null}
      <h1 className={["type-h1 max-w-[22ch] text-[var(--text-primary)]", eyebrow ? "mt-2" : ""].join(" ")}>{title}</h1>
      {lede ? (
        <p className="mt-4 max-w-[62ch] text-[var(--fs-body-lg)] leading-[var(--lh-body-lg)] text-[var(--text-secondary)]">
          {lede}
        </p>
      ) : null}
      {meta ? <div className="mt-5 flex flex-wrap items-center gap-2">{meta}</div> : null}
      {actions ? <div className="mt-6 flex flex-wrap gap-3">{actions}</div> : null}
      {children}
    </header>
  );
}
