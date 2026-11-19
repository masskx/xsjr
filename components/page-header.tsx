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
    <div className="mb-6">
      <div className="flex items-baseline gap-2.5">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          {title}
        </h1>
        {typeof count === "number" && (
          <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[12px] text-zinc-500">
            {count}
          </span>
        )}
      </div>
      <p className="mt-2 max-w-3xl text-[13.5px] leading-6 text-zinc-500">
        {desc}
      </p>
      {children}
    </div>
  );
}
