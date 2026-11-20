export function PageHeader({
  title,
  desc,
  count,
  children,
}: {
  title: string;
  desc: string;
  count?: number;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-8 border-b border-rule pb-8">
      <div className="flex items-baseline gap-3">
        <h1 className="headline text-[40px] sm:text-[52px]">
          {title}
        </h1>
        {typeof count === "number" && (
          <span className="font-mono text-[13px] text-zinc-500">
            {count}
          </span>
        )}
      </div>
      <p className="mt-3 max-w-3xl text-[15px] font-light leading-7 text-zinc-700">
        {desc}
      </p>
      {children}
    </div>
  );
}
