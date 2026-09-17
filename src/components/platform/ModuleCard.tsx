import Link from "next/link";

interface ModuleCardProps {
  kicker: string;
  title: string;
  description: string;
  href: string;
  cta: string;
  badge?: string;
}

export default function ModuleCard({ kicker, title, description, href, cta, badge }: ModuleCardProps) {
  return (
    <article className="group relative flex flex-col rounded-[6px] border border-[var(--color-border-subtle)] bg-[var(--color-card-bg)] p-6 transition-all duration-200 ease-out hover:border-conifera hover:shadow-[var(--shadow-premium-sm)] sm:p-7">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--moss-ink)]">{kicker}</p>
        {badge && (
          <span className="inline-flex items-center rounded-[6px] border border-conifera bg-crisopa px-2 py-0.5 text-[11px] font-semibold text-carbon">
            {badge}
          </span>
        )}
      </div>
      <h2 className="mt-3 text-xl font-bold tracking-tight text-[var(--color-text-primary)]">{title}</h2>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--color-text-secondary)]">{description}</p>
      <Link
        href={href}
        className="mt-5 inline-flex min-h-[44px] w-fit items-center px-5 py-2.5 text-sm font-semibold text-white bg-musgo rounded-[6px] hover:bg-musgo-hover transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--retama)]"
      >
        {cta}
      </Link>
    </article>
  );
}
