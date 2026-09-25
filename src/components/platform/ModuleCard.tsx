import Link from "next/link";
import Badge from "@/components/ui/Badge";

interface ModuleCardProps {
  kicker: string;
  title: string;
  description: string;
  href: string;
  cta: string;
  badge?: string;
  /** Tratamiento atenuado para módulos en preparación (no navegables). */
  pending?: boolean;
}

/**
 * Card de módulo: toda la superficie es un único enlace (pseudo-cobertura con
 * un solo <a> absoluto, sin anidar enlaces). El CTA es texto + icono.
 */
export default function ModuleCard({ kicker, title, description, href, cta, badge, pending = false }: ModuleCardProps) {
  return (
    <article className={['card card-interactive relative flex flex-col p-6 sm:p-8', pending ? 'opacity-80' : ''].join(' ')}>
      <div className="flex flex-wrap items-center gap-3">
        <p className="type-overline text-[var(--moss-ink)]">{kicker}</p>
        {badge && (
          <Badge variant="secondary" dot>
            {badge}
          </Badge>
        )}
      </div>
      <h2 className="type-h3 mt-3 text-[var(--text-primary)]">{title}</h2>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--text-secondary)]">{description}</p>
      {pending ? (
        <span className="badge badge-pending mt-5 w-fit">{cta}</span>
      ) : (
        <span className="btn btn-link mt-4 w-fit px-0" aria-hidden="true">
          {cta}
          <svg className="btn-arrow h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12l-7.5 7.5M21 12H3" />
          </svg>
        </span>
      )}
      {!pending && (
        <Link href={href} className="absolute inset-0 rounded-[6px]" aria-label={`${cta} — ${title}`} />
      )}
    </article>
  );
}
