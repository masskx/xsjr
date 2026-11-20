"use client";
import { useActionState } from "react";
import { createApiTokenAction, type AdminFormState } from "@/app/admin/actions";
import { CopyButton } from "@/components/copy-button";

export function ApiTokenForm() {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(createApiTokenAction, {});
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
        <label className="block text-[12.5px] font-medium text-zinc-700">
          名称
          <input name="name" required maxLength={40} defaultValue={state.values?.name ?? ""} placeholder="例如：本机批量上传" className="mt-1 block w-full rounded-[3px] border border-zinc-300 bg-white px-3 py-2 text-[13.5px]" />
        </label>
        <label className="block text-[12.5px] font-medium text-zinc-700">
          有效期
          <select name="days" defaultValue="90" className="mt-1 block w-full rounded-[3px] border border-zinc-300 bg-white px-3 py-2 text-[13.5px]">
            <option value="30">30 天</option>
            <option value="90">90 天</option>
            <option value="365">1 年</option>
            <option value="0">不过期</option>
          </select>
        </label>
        <button disabled={pending} className="btn-ink !min-h-10 text-sm">{pending ? "创建中…" : "创建令牌"}</button>
      </div>
      {state.error && <p role="alert" className="text-[12.5px] text-rose-700">{state.error}</p>}
      {state.ok && state.link && (
        <div role="status" className="rounded-[3px] border border-amber-300 bg-amber-50 p-3">
          <p className="text-[13px] text-amber-900">{state.message}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-[2px] bg-white px-2 py-1 font-mono text-[12.5px] text-zinc-900">{state.link}</code>
            <CopyButton text={state.link} label="复制令牌" />
          </div>
        </div>
      )}
    </form>
  );
}
