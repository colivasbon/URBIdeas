interface Props {
  title: string;
  lede?: string;
  align?: "left" | "center";
  as?: "h2" | "h3";
}

export default function SectionHeading({ title, lede, align = "left", as = "h2" }: Props) {
  const alignCls = align === "center" ? "text-center mx-auto items-center" : "text-left items-start";
  const Heading = as;
  return (
    <div className={`flex max-w-3xl flex-col gap-3 ${alignCls}`}>
      <Heading className="type-h2 text-[var(--text-primary)]">{title}</Heading>
      {lede ? (
        <p className="measure text-[var(--fs-body)] leading-[var(--lh-body)] text-[var(--text-secondary)]">{lede}</p>
      ) : null}
    </div>
  );
}
