interface Props {
  title: string;
  lede?: string;
  align?: "left" | "center";
}

export default function SectionHeading({ title, lede, align = "left" }: Props) {
  const alignCls = align === "center" ? "text-center mx-auto items-center" : "text-left items-start";
  return (
    <div className={`flex max-w-3xl flex-col gap-3 ${alignCls}`}>
      <h2 className="text-xl font-bold tracking-tight text-[var(--color-text-primary)] sm:text-2xl">
        {title}
      </h2>
      {lede ? <p className="editorial-lede">{lede}</p> : null}
    </div>
  );
}
