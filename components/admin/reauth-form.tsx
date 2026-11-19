"use client";
import { ActionForm, Field, Submit } from "@/components/auth/form";
import { reauthAction } from "@/app/admin/actions";

export function ReauthForm({ next }: { next: string }) {
  return (
    <ActionForm action={reauthAction}>
      <input type="hidden" name="next" value={next} />
      <Field name="code" label="验证码" autoComplete="one-time-code" inputMode="numeric" maxLength={8} />
      <Submit>验证</Submit>
    </ActionForm>
  );
}
