"use client";
import { ActionForm, Field, Submit } from "@/components/auth/form";
import { createPromptAction, type AdminFormState } from "@/app/admin/actions";

/** "New resource" form: the minimum fields to create a draft. Defaults to prompts. */
export function CreatePromptForm({
  categories,
  action = createPromptAction,
  example = "methods-writer",
}: {
  categories: string[];
  action?: (state: AdminFormState, fd: FormData) => Promise<AdminFormState>;
  example?: string;
}) {
  return (
    <ActionForm action={action}>
      <Field name="title" label="标题" maxLength={80} />
      <Field name="slug" label="网址标识" maxLength={60} hint={`小写字母、数字和连字符，例如 ${example}。发布后不能再改。`} />
      <Field name="summary" label="摘要" maxLength={110} hint="20–110 字，显示在卡片和搜索结果里。" />
      <Field name="category" label="分类" maxLength={20} hint={categories.length ? `已有分类：${categories.join("、")}` : undefined} />
      <Submit>创建草稿</Submit>
    </ActionForm>
  );
}
