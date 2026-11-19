"use client";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { issueLinkAction, type AdminFormState } from "@/app/admin/actions";
import { CopyButton } from "@/components/copy-button";
import { btn } from "@/components/admin/ui";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={btn.secondary}>
      {pending ? "生成中…" : label}
    </button>
  );
}

export function IssueLinkForm({ userId, email, purpose, label, description }: { userId: number; email: string; purpose: "EMAIL_VERIFY" | "PASSWORD_RESET"; label: string; description: string }) {
  const [state, action] = useActionState<AdminFormState, FormData>(issueLinkAction, {});
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="purpose" value={purpose} />
      <SubmitButton label={label} />
      <p className="text-[12.5px] leading-5 text-zinc-500">{description}</p>
      {state.error && (
        <p role="alert" className="text-[12.5px] text-rose-700">
          {state.error}
        </p>
      )}
      {state.link && (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-[12.5px] text-emerald-900">
          <p>{state.message}</p>
          <code className="mt-1.5 block break-all rounded bg-white px-2 py-1.5 font-mono text-[12px] text-zinc-800">{state.link}</code>
          <div className="mt-2">
            <CopyButton text={state.link} label="复制链接" />
          </div>
        </div>
      )}
    </form>
  );
}
