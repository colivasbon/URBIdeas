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
    <article className="group relative flex flex-col rounded-[var(--border-radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-card-bg)] p-6 sm:p-7 transition-colors duration-300 hover:border-[var(--color-secondary)]/40">
      <div className="flex items-center gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-secondary)]">{kicker}</p>
        {badge && (
          <span className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-input-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-text-secondary)]">
            {badge}
          </span>
        )}
      </div>
      <h2 className="mt-3 text-xl font-bold text-[var(--color-text-primary)]">{title}</h2>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--color-text-secondary)]">{description}</p>
      <Link
        href={href}
        className="mt-5 inline-flex w-fit items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[var(--color-primary)] rounded-xl hover:bg-[var(--color-primary-light)] transition-all duration-300 active:scale-[0.97]"
      >
        {cta}
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
        </svg>
      </Link>
    </article>
  );
}
