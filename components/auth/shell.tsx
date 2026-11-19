import type { ReactNode } from "react";

/** Narrow centred card used by the sign-in / sign-up / reset pages. */
export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-12 sm:py-16">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{title}</h1>
      {subtitle && <p className="mt-2 text-[13.5px] leading-6 text-zinc-500">{subtitle}</p>}
      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">{children}</div>
      {footer && <div className="mt-5 text-center text-[13px] text-zinc-500">{footer}</div>}
    </div>
  );
}

/** Section card used on the account page. */
export function Panel({ id, title, children, description }: { id?: string; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
      <h2 className="text-[15px] font-semibold text-zinc-900">{title}</h2>
      {description && <p className="mt-1 text-[13px] leading-6 text-zinc-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
