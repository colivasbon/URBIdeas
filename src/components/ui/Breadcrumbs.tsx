import Link from "next/link";
import type { ReactNode } from "react";

export interface BreadcrumbItem {
  label: string;
  href?: string;
  icon?: ReactNode;
}

interface Props {
  items: BreadcrumbItem[];
  /** "inverse" para cabeceras sobre fondo musgo/carbón. */
  tone?: "default" | "inverse";
  className?: string;
}

/** Migas de pan: body-sm, separador «/» en limo, último Ítem sin enlace. */
export default function Breadcrumbs({ items, tone = "default", className = "" }: Props) {
  const inverse = tone === "inverse";
  return (
    <nav
      aria-label="Migas de pan"
      className={["breadcrumbs", inverse ? "text-[var(--text-inverse-secondary)]" : "", className].join(" ")}
    >
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={`${item.label}-${i}`} className="flex items-center gap-2">
            {i > 0 && (
              <span aria-hidden="true" className={inverse ? "text-white/40" : "breadcrumbs__sep"}>
                /
              </span>
            )}
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className={
                  inverse
                    ? "text-[var(--text-inverse-secondary)] hover:text-[var(--text-inverse)]"
                    : "text-[var(--text-link)]"
                }
              >
                {item.label}
              </Link>
            ) : (
              <span
                aria-current={isLast ? "page" : undefined}
                className={inverse ? "font-medium text-[var(--text-inverse)]" : "breadcrumbs__current"}
              >
                {item.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
