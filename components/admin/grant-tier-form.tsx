"use client";
import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { grantTierAction, type AdminFormState } from "@/app/admin/actions";
import { btn } from "@/components/admin/ui";

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={btn.primary} disabled={disabled || pending}>
      {pending ? "开通中…" : "开通"}
    </button>
  );
}

const selectCls = "block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-[13.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20";

export function GrantTierForm({ userId, tiers, disabled }: { userId: number; tiers: { code: string; label: string }[]; disabled: boolean }) {
  const [state, action] = useActionState<AdminFormState, FormData>(grantTierAction, {});
  const [duration, setDuration] = useState("365");
  const ids = { tier: useId(), duration: useId(), until: useId(), note: useId() };
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="userId" value={userId} />
      {state.error && (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-800">
          {state.error}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor={ids.tier} className="mb-1 block text-[12.5px] font-medium text-zinc-700">
            等级
          </label>
          <select id={ids.tier} name="tier" className={selectCls} disabled={disabled}>
            {tiers.map((t) => (
              <option key={t.code} value={t.code}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={ids.duration} className="mb-1 block text-[12.5px] font-medium text-zinc-700">
            有效期
          </label>
          <select id={ids.duration} name="duration" value={duration} onChange={(e) => setDuration(e.target.value)} className={selectCls} disabled={disabled}>
            <option value="30">30 天</option>
            <option value="90">90 天</option>
            <option value="180">180 天</option>
            <option value="365">1 年</option>
            <option value="date">到指定日期</option>
            <option value="forever">长期（不过期）</option>
          </select>
        </div>
        {duration === "date" && (
          <div>
            <label htmlFor={ids.until} className="mb-1 block text-[12.5px] font-medium text-zinc-700">
              到期日（含当天）
            </label>
            <input id={ids.until} name="until" type="date" className={selectCls} disabled={disabled} />
          </div>
        )}
      </div>
      <div>
        <label htmlFor={ids.note} className="mb-1 block text-[12.5px] font-medium text-zinc-700">
          备注（可选）
        </label>
        <input id={ids.note} name="note" maxLength={200} placeholder="例如：早期内测用户" className={selectCls} disabled={disabled} />
      </div>
      <Submit disabled={disabled} />
      {disabled && <p className="text-[12.5px] text-amber-800">该用户邮箱尚未验证，不能开通会员。可在下方生成验证链接发给用户。</p>}
    </form>
  );
}
